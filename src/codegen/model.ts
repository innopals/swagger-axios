import { Schema } from "swagger-schema-official";

export function normalizeModelName(ref: string) {
  if (!ref.startsWith("#/definitions/")) {
    throw new Error(`Unexpected schema ref: ${ref}`);
  }
  let name = ref.substr(14).replace(/[^a-z_0-9]/gi, "_");
  while (name.endsWith("_")) {
    name = name.substr(0, name.length - 1);
  }
  return name;
}

export function generateAll(schemas: { [ref: string]: Schema }): string {
  let blocks: string[] = [];
  Object.keys(schemas).forEach((ref) => {
    blocks.push(generateModel(normalizeModelName(ref), schemas[ref]));
  });
  return blocks.join("\n\n");
}

export function generateModel(name: string, schema: Schema): string {
  if (schema.$ref) {
    return `export type ${normalizeModelName(name)} = ${normalizeModelName(
      schema.$ref
    )};`;
  }
  return `export interface ${name} ${generateSchema(schema, 0)};`;
}

export function generateSchema(schema: Schema, indent: number): string {
  if (schema.$ref) {
    return normalizeModelName(schema.$ref);
  }
  if (schema.allOf && schema.allOf.length > 0) {
    let rs = schema.allOf.map((s) => generateSchema(s, indent + 2)).join(" & ");
    return schema.allOf.length === 1 ? rs : `(${rs})`;
  }
  if (["integer", "long", "float", "double"].indexOf(schema.type!) >= 0) {
    return "number";
  }
  if (
    ["string", "byte", "binary", "date", "dateTime", "password"].indexOf(
      schema.type!
    ) >= 0
  ) {
    return "string";
  }
  if (schema.type === "boolean") {
    return "boolean";
  }
  if (schema.type === "array") {
    if (!schema.items) {
      throw new Error(`Schema items is required when type is array.`);
    }
    if (Array.isArray(schema.items)) {
      return `(${schema.items
        .map((s) => generateSchema(s, indent))
        .join(" | ")})[]`;
    } else {
      return `${generateSchema(schema.items, indent)}[]`;
    }
  }
  if (schema.type !== "object") {
    throw new Error(
      `Unexpected schema type ${schema.type}, raw: ${JSON.stringify(schema)}`
    );
  }
  const lines: string[] = ["{"];
  const properties = schema.properties || {};
  Object.keys(properties).forEach((propName) => {
    lines.push(
      `  ${propName}${
        properties[propName].required ? "" : "?"
      }: ${generateSchema(properties[propName], indent + 2)};`
    );
  });
  lines.push("}");
  let br = "\n";
  for (let i = 0; i < indent; i++) {
    br += " ";
  }
  return lines.join(br);
}
