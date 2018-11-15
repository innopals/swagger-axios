import * as rimraf from 'rimraf';
import * as mkdirp from 'mkdirp';
import * as fs from 'fs';
import * as path from 'path';
import { fork } from 'child_process';
import { CodeGenConfig } from './config';
import { Spec, Path, Schema, Operation, Response } from 'swagger-schema-official';

import { generateAll } from './codegen/model';
import { generateAxiosInstance } from './codegen/axios';
import { generateStub } from './codegen/stub';

const LOCK_DIR = '.swagger-axios';

function isResponse(arg: any): arg is Response {
  return arg && !!arg.schema;
}

async function codegen(spec: Spec, config: CodeGenConfig) {
  if (fs.existsSync(LOCK_DIR)) {
    throw new Error(`Temp directory ${LOCK_DIR} exists, is there another process running?`);
  }
  if (fs.existsSync(config.out) && fs.statSync(config.out).isFile()) {
    throw new Error(`Output "${config.out}" is a file.`);
  }
  mkdirp.sync(LOCK_DIR);
  try {
    // 1. filter api paths
    let apiList = Object.keys(spec.paths);
    if (config.include.length > 0) {
      apiList = apiList.filter(path => config.include.find(i => path.startsWith(i)));
    }
    if (config.exclude.length > 0) {
      apiList = apiList.filter(path => !config.exclude.find(i => path.startsWith(i)));
    }
    // 2. load required schemas
    const schemas: { [ref: string]: Schema } = {};
    if (spec.definitions) {
      const definitions = spec.definitions;
      Object.keys(definitions).forEach(name => {
        schemas[`#/definitions/${name}`] = definitions[name];
      });
    }
    // console.log(schemas);
    const requiredSchemas: { [ref: string]: Schema } = {};
    const requireSchema = function (schema: Schema) {
      if (schema.$ref && !requiredSchemas[schema.$ref]) {
        let refSchema = schemas[schema.$ref];
        if (!refSchema) {
          throw new Error(`Unable to find schema ${schema.$ref}`);
        }
        requiredSchemas[schema.$ref] = refSchema;
        requireSchema(refSchema);
      }
      if (schema.allOf) {
        schema.allOf.forEach(requireSchema);
      }
      if (schema.properties) {
        const properties = schema.properties;
        Object.keys(properties).forEach(key => {
          if (!properties[key]) { return; }
          requireSchema(properties[key]);
        });
      }
      if (schema.items) {
        if (Array.isArray(schema.items)) {
          schema.items.forEach(requireSchema);
        } else {
          requireSchema(schema.items);
        }
      }
    };
    apiList.forEach(path => {
      let api = spec.paths[path];
      (['get', 'post', 'put', 'delete', 'options', 'head', 'patch'] as (keyof Path)[]).forEach(method => {
        if (!api[method]) { return; }
        const op = api[method] as Operation;
        if (op.parameters) {
          op.parameters.forEach(p => requireSchema(p as Schema));
        }
        Object.keys(op.responses).forEach(key => {
          const response = op.responses[key];
          if (isResponse(response) && response.schema) {
            requireSchema(response.schema!);
          }
        });
      });
    });

    // 3. Generate schemas def
    let models = generateAll(requiredSchemas);
    // models = generateAll(schemas);
    fs.writeFileSync(path.join(LOCK_DIR, 'models.ts'), models);

    // 4. Generate axios default instance
    let axiosInstance = generateAxiosInstance(spec, config);
    fs.writeFileSync(path.join(LOCK_DIR, 'axiosInstance.ts'), axiosInstance);

    // 5. Generate api stub methods
    apiList.forEach(apiPath => {
      let api = spec.paths[apiPath];
      (['get', 'post', 'put', 'delete', 'options', 'head', 'patch'] as (keyof Path)[]).forEach(method => {
        if (!api[method]) { return; }
        const op = api[method] as Operation;
        if (!op.operationId) {
          throw new Error(`Operation path ${apiPath} method ${method} does not have an operationId.`);
        }
        let axiosInstancePath = (config.skipTags || !op.tags) ? './axiosInstance' : '../axiosInstance';
        if (config.axiosInstancePath) {
          axiosInstancePath = config.axiosInstancePath;
          if (axiosInstancePath.startsWith("./") || axiosInstancePath.startsWith("../")) {
            for (let i = config.out.split(path.sep).length; i > 0; i--) {
              axiosInstancePath = path.join('..', axiosInstancePath);
            }
            if (!config.skipTags && op.tags) {
              axiosInstancePath = path.join('..', axiosInstancePath);
            }
          }
        }
        const code = generateStub({
          path: apiPath,
          method,
          op,
          axiosInstancePath,
          modelPath: (!config.skipTags && op.tags) ? '../models' : './models',
          dataField: config.resultDataField
        });
        if (config.skipTags || !op.tags) {
          fs.writeFileSync(path.join(LOCK_DIR, op.operationId + '.ts'), code);
        } else {
          op.tags.forEach(tag => {
            let tagFolder = tag.endsWith("-controller") ? tag.substr(0, tag.length - 11) : tag; // Springfox controller name as tag
            mkdirp.sync(path.join(LOCK_DIR, tagFolder));
            fs.writeFileSync(path.join(LOCK_DIR, tagFolder, op.operationId + '.ts'), code);
          });
        }
      });
    });
    // 6. run tsc
    if (config.js) {
      let tsconfig = require(path.resolve(__dirname, '../tsconfig-api.json'));
      fs.writeFileSync(path.join(LOCK_DIR, 'tsconfig.json'), JSON.stringify(tsconfig));
      let tsc = fork(require.resolve('typescript/bin/tsc'), [], {
        cwd: path.resolve(LOCK_DIR)
      });
      await new Promise((f, r) => {
        tsc.once("exit", (code, signal) => {
          if (code === 0) {
            return f();
          }
          r(signal);
        });
      });
      fs.unlinkSync(path.join(LOCK_DIR, 'tsconfig.json'));
    }

    // Wipe out and replace.
    rimraf.sync(config.out);
    fs.renameSync(LOCK_DIR, config.out);
  } finally {
    if (fs.existsSync(LOCK_DIR)) {
      rimraf.sync(LOCK_DIR);
    }
  }
}

export { codegen };
export default codegen;
