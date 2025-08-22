import { generateDefinition, TypeField } from "nextra/tsdoc";
import { ContentItem } from "./properties-table-types";
import { PropertiesTable } from "./properties-table";

interface TSDocToPropertiesTableProps {
  /**
   * The definition to parse.
   */
  definition: ReturnType<typeof generateDefinition>;
  /**
   * Filter to apply to the properties.
   * If not provided, all properties will be included.
   */
  filter?: (content: ContentItem) => boolean;
  /**
   * Properties to include in the table in the order provided.
   * If not provided, all properties will be included in alphabetical order.
   */
  properties?: string[];
}

/**
 * Component that uses TSDoc to parse TypeScript types and renders them using PropertiesTable
 */
export const TSDocPropertiesTable: React.FC<TSDocToPropertiesTableProps> = ({
  definition,
  filter,
  properties,
}) => {
  let content: ContentItem[] = [];
  if ("entries" in definition) {
    content = definitionToContent(definition);
  }
  if (properties && properties.length > 0) {
    content = content
      .filter((content) => properties.includes(content.name))
      .sort((a, b) => properties.indexOf(a.name) - properties.indexOf(b.name));
  } else {
    content = content.sort((a, b) => a.name.localeCompare(b.name));
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
