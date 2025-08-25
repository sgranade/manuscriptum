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
