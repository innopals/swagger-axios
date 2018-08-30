import { Operation, Schema, BodyParameter } from 'swagger-schema-official';
import { nomalizeModelName, generateSchema } from './model';

export interface StubContext {
  path: string;
  method: string;
  op: Operation;
  axiosInstancePath: string;
  modelPath: string;
  dataField?: string;
}

function getResponseSchema(schema?: Schema, dataField?: string): string {
  if (!schema) {
    return 'any';
  }
  if (!dataField || !schema.properties || !schema.properties[dataField]) {
    return generateSchema(schema, 0);
  }
  return generateSchema(schema.properties[dataField], 0);
}

function getImports(imports: Set<string>, schema: Schema): void {
  if (schema.$ref) {
    imports.add(schema.$ref);
  }
  if (schema.allOf) {
    schema.allOf.forEach(s => getImports(imports, s));
  }
  if (schema.properties) {
    const properties = schema.properties;
    Object.keys(properties).forEach(key => {
      if (!properties[key]) {
        return;
      }
      getImports(imports, properties[key]);
    });
  }
  if (schema.items) {
    if (Array.isArray(schema.items)) {
      schema.items.forEach(s => getImports(imports, s));
    } else {
      getImports(imports, schema.items);
    }
  }
}

// function createPathReplacer(name: string) {
//   return `url = url.replace(/\\{${name}\\}/, ${name});`;
// }

export function generateStub(ctx: StubContext): string {
  const imports = new Set<string>();
  const parameters = ctx.op.parameters;
  if (parameters) {
    parameters.forEach(parameter => {
      if (parameter.in === 'body') {
        const schema = (parameter as BodyParameter).schema;
        if (schema) {
          getImports(imports, schema);
        }
      }
    });
  }
  const responses = ctx.op.responses;
  const response = responses[200];
  if (response && response.schema) {
    getImports(imports, response.schema);
  }
  let modelImport = "";
  if (imports.size > 0) {
    modelImport = `import {${Array.from(imports).map(i => ' ' + nomalizeModelName(i)).join(',')} } from '${ctx.modelPath}';\n`;
  }
  const args: { name: string, schema?: Schema }[] = [];
  if (parameters) {
    parameters.forEach(parameter => {
      if (parameter.in === 'body') {
        const schema = (parameter as BodyParameter).schema;
        args.push({ name: parameter.name, schema });
      }
      if (parameter.in === 'query' || parameter.in === 'path') {
        args.push({ name: parameter.name, schema: parameter as Schema });
      }
    });
  }
  const bodyParameter = (parameters || []).find(p => p.in === 'body');
  const queryParameters = (parameters || []).filter(p => p.in === 'query');

  return `import axios from '${ctx.axiosInstancePath}';
${modelImport}
export default function (${args.length === 0 ? "" : `\n  ${args.map(arg => `${arg.name}: ${arg.schema ? generateSchema(arg.schema, 2) : 'any'}`).join(",\n  ")}\n`}): Promise<${getResponseSchema(response.schema, ctx.dataField)}> {
  let url = \`${ctx.path.replace(/\{/g, '${')}\`;
  return axios.request({
    url,
    method: "${ctx.method}",
    params: ${queryParameters.length > 0 ? `{ ${queryParameters.map(p => p.name).join(", ")} }` : "{}"},
    data: ${bodyParameter ? bodyParameter.name : '{}'}
  }) as any;
}
`;
}
