import { LineRuleType } from "docx";
import { IPlugin } from "mdast2docx";

/**
 * mdast2docx plugin to convert Markdown thematic breaks (`***`) to Shunn-manuscript scene breaks (centered `#`).
 *
 * By default mdast2docx turns thematic breaks into a full horizontal rule.
 */
export const shunnThematicBreakPlugin: () => IPlugin = () => {
    // Code based on https://github.com/md2docx/table/
    return {
        block: (docx, node) => {
            if (node.type !== "thematicBreak") return [];

            // @ts-expect-error - Setting type to empty string to avoid re-processing the node.
            node.type = "";
            return [
                new docx.Paragraph({
                    text: "#",
                    alignment: "center",
                }),
            ];
        },
    };
};

/**
 * mdast2docx plugin to add a first line indent and double-space paragraphs.
 */
export const doubleSpaceAndIndentParas: () => IPlugin = () => {
    return {
        block(docx, node, paraProps) {
            if (node.type === "paragraph") {
                paraProps.indent = {
                    firstLine: 720,
                };
                paraProps.spacing = {
                    line: 480, // Double spaced: AUTO line rule sets this to be units of 1/240th of the font size
                    lineRule: LineRuleType.AUTO,
                };
            }

            return [];
        },
    };
};
