import {
  Operation,
  Schema,
  BodyParameter,
  PathParameter,
  QueryParameter,
  Response,
} from "swagger-schema-official";
import { normalizeModelName, generateSchema } from "./model";

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
    return "any";
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
    schema.allOf.forEach((s) => getImports(imports, s));
  }
  if (schema.properties) {
    const properties = schema.properties;
    Object.keys(properties).forEach((key) => {
      if (!properties[key]) {
        return;
      }
      getImports(imports, properties[key]);
    });
  }
  if (schema.items) {
    if (Array.isArray(schema.items)) {
      schema.items.forEach((s) => getImports(imports, s));
    } else {
      getImports(imports, schema.items);
    }
  }
}

// function createPathReplacer(name: string) {
//   return `url = url.replace(/\\{${name}\\}/, ${name});`;
// }

function isBodyParameter(p: any): p is BodyParameter {
  return p.in === "body";
}
function isPathParameter(p: any): p is PathParameter {
  return p.in === "path";
}
function isQueryParameter(p: any): p is QueryParameter {
  return p.in === "query";
}
function isResponse(arg: any): arg is Response {
  return arg && !!arg.schema;
}

export function generateStub(ctx: StubContext): string {
  const imports = new Set<string>();
  const parameters = ctx.op.parameters;
  if (parameters) {
    parameters.forEach((parameter) => {
      if (isBodyParameter(parameter)) {
        const schema = (parameter as BodyParameter).schema;
        if (schema) {
          getImports(imports, schema);
        }
      }
    });
  }
  const responses = ctx.op.responses;
  const response = responses[200];
  if (!isResponse(response) || !response.schema) {
    throw new Error("Expect response to include a schema");
  }
  getImports(imports, response.schema);
  let modelImport = "";
  if (imports.size > 0) {
    modelImport = `import {${Array.from(imports)
      .map((i) => " " + normalizeModelName(i))
      .join(",")} } from '${ctx.modelPath}';\n`;
  }
  const args: { name: string; schema: Schema; required?: boolean }[] = [];
  if (parameters) {
    parameters.forEach((parameter) => {
      if (isQueryParameter(parameter) || isPathParameter(parameter)) {
        args.push({
          name: parameter.name,
          required: parameter.required,
          schema: parameter as Schema,
        });
      }
    });
  }
  const bodyParameter = (parameters || []).find(isBodyParameter);
  const queryParameters = (parameters || []).filter(isQueryParameter);

  const stubParameters: string[] = [];
  if (args.length > 0) {
    let parameter = `{ ${args.map((arg) => arg.name).join(", ")} }: {\n    `;
    parameter += args
      .map((arg) => {
        return `${arg.name}${arg.required ? "" : "?"}: ${generateSchema(
          arg.schema,
          2
        )}`;
      })
      .join(",\n    ");
    parameter += "\n  }";
    stubParameters.push(parameter);
  }
  if (bodyParameter) {
    let parameter = bodyParameter as BodyParameter;
    if (parameter.schema) {
      stubParameters.push(
        `${parameter.name}${parameter.required ? "" : "?"}: ${generateSchema(
          parameter.schema,
          2
        )}`
      );
    }
  }

  return `// @ts-ignore
import axios from '${ctx.axiosInstancePath}';
${modelImport}
export default function (${
    stubParameters.length === 0 ? "" : `\n  ${stubParameters.join(",\n  ")}\n`
  }): Promise<${getResponseSchema(response.schema, ctx.dataField)}> {
  return axios.request({
    url: \`${ctx.path.replace(/\{/g, "${")}\`,
    method: "${ctx.method}",
    params: ${
      queryParameters.length > 0
        ? `{ ${queryParameters.map((p) => p.name).join(", ")} }`
        : "{}"
    },
    data: ${bodyParameter ? bodyParameter.name : "undefined"}
  }) as any;
}
`;
}
