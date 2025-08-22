import { generateDefinition, TypeField } from "nextra/tsdoc";
import { ContentItem } from "./properties-table-types";
import { PropertiesTable } from "./properties-table";

interface TSDocToPropertiesTableProps {
  definition: ReturnType<typeof generateDefinition>;
  filter?: (content: ContentItem) => boolean;
}

/**
 * Component that uses TSDoc to parse TypeScript types and renders them using PropertiesTable
 */
export const TSDocPropertiesTable: React.FC<TSDocToPropertiesTableProps> = ({
  definition,
  filter,
}) => {
  let content: ContentItem[] = [];
  if ("entries" in definition) {
    content = definitionToContent(definition);
  }
  if (filter) {
    content = content.filter(filter);
  }
  return <PropertiesTable content={content} />;
};

export function definitionToContent(
  definition: ReturnType<typeof generateDefinition>,
): ContentItem[] {
  let content: ContentItem[] = [];
  if ("entries" in definition) {
    content =
      definition?.entries?.map((field: TypeField) => ({
        name: field.name,
        type: field.type,
        isOptional: field.optional,
        description: field.description || "",
        // Extract default value from tags if present
        defaultValue: field.tags?.default || field.tags?.defaultValue,
      })) || [];
  }
  return content;
}
