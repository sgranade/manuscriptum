import { Root } from "mdast";
import { FrontMatterCache } from "obsidian";
import remarkFrontmatter from "remark-frontmatter";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { visit } from "unist-util-visit";

/**
 * Manuscript file's metadata.
 */
export interface ManuscriptMetadata {
    /**
     * Title of the story.
     */
    title: string;
    /**
     * Output filename to save the manuscript to.
     */
    filename: string;
    /**
     * Output directory to save the manuscript to.
     */
    outdir: string;
    /**
     * Story author, or undefined to anonymize the MS.
     */
    author?: string;
    /**
     * Story author's surname, or undefined to anonymize.
     */
    surname?: string;
    /**
     * Author's contact information, or undefined to anonymize.
     */
    contact?: string;
    /**
     * Number of words in the manuscript, or undefined if not known.
     */
    wordcount?: number;
}

/**
 * Information about an Obsidian note.
 */
export interface NoteInformation {
    /**
     * Note's name.
     */
    name: string;
    /**
     * Content of the note.
     */
    content: string;
    /**
     * Any frontmatter associated with the note.
     */
    frontmatter?: FrontMatterCache;
}

/**
 * Create Markdown AST from Obsidian notes.
 *
 * Notes' properties can overwrite the existing manuscript metadata if they're non-blank.
 *
 * @param notesInfo Info about Obsidian notes.
 * @param metadata Manuscript metadata.
 * @returns Tuple of Markdown AST corresponding to the notes and array of notices to show to the user (if any).
 */
export function obsidianNotesToAST(
    notesInfo: NoteInformation[],
    metadata: ManuscriptMetadata
): [Root, string[]] {
    const pipeline = unified()
        .use(remarkParse)
        .use(remarkGfm)
        .use(remarkFrontmatter);
    const notices: string[] = [];

    const origMetadata = { ...metadata };
    metadata.wordcount = 0;

    let tree: Root = { type: "root", children: [] };
    for (const info of notesInfo) {
        // Check if the note has properties that overwrite the existing settings
        if (info.frontmatter !== null && info.frontmatter !== undefined) {
            const redefinedProps = [];

            for (const k of [
                "title",
                "filename",
                "outdir",
                "author",
                "surname",
                "contact",
                // Set only string properties in this!
            ] as Array<keyof ManuscriptMetadata>) {
                const val = info.frontmatter![k] as string;
                if (val !== undefined) {
                    // Don't allow blank metadata
                    if (val.trim() === "") {
                        notices.push(
                            `${k} property on note ${info.name} is blank. Ignoring.`
                        );
                        continue;
                    }

                    // Warn if we re-define metadata
                    if (metadata[k] !== origMetadata[k]) {
                        redefinedProps.push(k);
                    }
                    (metadata[k] as string) = val; // Trust that we're only setting string properties
                }
            }

            if (redefinedProps.length !== 0) {
                notices.push(
                    `Note ${info.name} re-defined the following properties: ${redefinedProps.join(", ")}`
                );
            }
        }

        // Turn markdown content into an AST
        const subTree = pipeline.parse(info.content);

        // Count words by visiting every text node
        let count = 0;
        visit(subTree, "text", (node) => {
            const words = node.value.trim().split(/\s+/).filter(Boolean);
            count += words.length;
        });
        metadata.wordcount += count;

        subTree.children = subTree.children.filter(
            (node) => node.type !== "yaml"
        );
        if (tree.children.length === 0) {
            tree = subTree;
        } else {
            tree.children.push({ type: "thematicBreak" }, ...subTree.children);
        }
    }

    return [tree, notices];
}
