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
  if (!("entries" in definition)) {
    return [];
  }

  const content: ContentItem[] =
    definition?.entries
      ?.filter(
        (field: TypeField) =>
          field.tags?.internal === undefined && field.name !== "#private",
      )
      .map((field: TypeField) => ({
        name: field.name,
        type: field.type,
        isOptional: field.optional,
        description: field.description || "",
        defaultValue: field.tags?.default || field.tags?.defaultValue,
        isExperimental: field.tags?.experimental !== undefined,
        deprecated: field.tags?.deprecated,
      })) || [];

  return content;
}
