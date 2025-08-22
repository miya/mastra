import { asSchema } from 'ai-v5';
import type { JSONSchema7, Schema } from 'ai-v5';
import type z4 from 'zod/v4';
import type z3 from 'zod/v3';

export type PartialSchemaOutput<TObjectSchema extends OutputSchema = undefined> = TObjectSchema extends undefined
  ? undefined
  : Partial<InferSchemaOutput<TObjectSchema>>;

export type InferSchemaOutput<TObjectSchema extends OutputSchema> = TObjectSchema extends undefined
  ? undefined
  : TObjectSchema extends z4.core.$ZodType<infer OBJECT, any>
    ? OBJECT // Zod v4
    : TObjectSchema extends z3.Schema<infer OBJECT, z3.ZodTypeDef, any>
      ? OBJECT // Zod v3
      : TObjectSchema extends Schema<infer OBJECT>
        ? OBJECT // JSON Schema (AI SDK's Schema type)
        : unknown; // Fallback

export type OutputSchema<OBJECT = any> =
  | z4.core.$ZodType<OBJECT, any>
  | z3.Schema<OBJECT, z3.ZodTypeDef, any>
  | Schema<OBJECT>
  | undefined;

export type ZodLikePartialSchema<T = any> = (
  | z4.core.$ZodType<Partial<T>, any> // Zod v4 partial schema
  | z3.ZodType<Partial<T>, z3.ZodTypeDef, any> // Zod v3 partial schema
) & {
  safeParse(value: unknown): { success: boolean; data?: Partial<T>; error?: any };
};

export function getTransformedSchema<TObjectSchema extends OutputSchema = undefined>(schema?: TObjectSchema) {
  const jsonSchema = schema ? asSchema(schema).jsonSchema : undefined;
  if (!jsonSchema) {
    return undefined;
  }

  const { $schema, ...itemSchema } = jsonSchema;
  if (itemSchema.type === 'array') {
    const innerElement = itemSchema.items;
    const arrayOutputSchema: JSONSchema7 = {
      $schema: $schema,
      type: 'object',
      properties: {
        elements: { type: 'array', items: innerElement },
      },
      required: ['elements'],
      additionalProperties: false,
    };

    return {
      jsonSchema: arrayOutputSchema,
      outputFormat: 'array',
    };
  }

  // Handle enum schemas - wrap in object like AI SDK does
  if (itemSchema.enum && Array.isArray(itemSchema.enum)) {
    const enumOutputSchema: JSONSchema7 = {
      $schema: $schema,
      type: 'object',
      properties: {
        result: { type: itemSchema.type || 'string', enum: itemSchema.enum },
      },
      required: ['result'],
      additionalProperties: false,
    };

    return {
      jsonSchema: enumOutputSchema,
      outputFormat: 'enum',
    };
  }

  return {
    jsonSchema: jsonSchema,
    outputFormat: jsonSchema.type, // 'object'
  };
}

type ResponseFormatResult =
  | {
      type: 'text';
    }
  | {
      type: 'json';
      /**
       * JSON schema that the generated output should conform to.
       */
      schema?: JSONSchema7;
    };
export function getResponseFormat(schema?: Parameters<typeof asSchema>[0] | undefined): ResponseFormatResult {
  if (schema) {
    const transformedSchema = getTransformedSchema(schema);
    return {
      type: 'json',
      schema: transformedSchema?.jsonSchema,
    };
  }

  // response format 'text' for everything else
  return {
    type: 'text',
  };
}

// // export type TObjectSchema<OBJECT> = z4.core.$ZodType<OBJECT, any> | z3.Schema<OBJECT, z3.ZodTypeDef, any> | Schema<OBJECT> | undefined;

// /**
//  * Used to mark validator functions so we can support both Zod and custom schemas.
//  */
// declare const validatorSymbol: unique symbol;
// type ValidationResult<OBJECT> =
//   | {
//       success: true;
//       value: OBJECT;
//     }
//   | {
//       success: false;
//       error: Error;
//     };
// type Validator<OBJECT = unknown> = {
//   /**
//    * Used to mark validator functions so we can support both Zod and custom schemas.
//    */
//   [validatorSymbol]: true;
//   /**
//    * Optional. Validates that the structure of a value matches this schema,
//    * and returns a typed version of the value if it does.
//    */
//   readonly validate?: (value: unknown) => ValidationResult<OBJECT> | PromiseLike<ValidationResult<OBJECT>>;
// };

// /**
//  * Used to mark schemas so we can support both Zod and custom schemas.
//  */
// declare const schemaSymbol: unique symbol;
// type Schema<OBJECT = unknown> = Validator<OBJECT> & {
//   /**
//    * Used to mark schemas so we can support both Zod and custom schemas.
//    */
//   [schemaSymbol]: true;
//   /**
//    * Schema type for inference.
//    */
//   _type: OBJECT;
//   /**
//    * The JSON Schema for the schema. It is passed to the providers.
//    */
//   readonly jsonSchema: JSONSchema7;
// };
// // type FlexibleSchema<T> = z4.core.$ZodType<T, any> | z3.Schema<T, z3.ZodTypeDef, any> | Schema<T>;

// export type OutputSchema<OBJECT = unknown> =
//   | z4.core.$ZodType<OBJECT, any>
//   | z3.Schema<OBJECT, z3.ZodTypeDef, any>
//   | Schema<OBJECT>
//   | undefined;
