import * as fs from "node:fs";
import * as path from "node:path";
import * as docx from "docx";
import { Root } from "mdast";
import { IDocxProps, ISectionProps, toDocx } from "mdast2docx";
import {
    App,
    MarkdownView,
    Notice,
    Plugin,
    PluginSettingTab,
    Setting,
    TFile,
    TFolder,
} from "obsidian";
import remarkFrontmatter from "remark-frontmatter";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified } from "unified";

import {
    addFrontMatterPlugin,
    doubleSpaceAndIndentParas,
    shunnThematicBreakPlugin,
} from "./docxPlugins";
import { downloadsFolder } from "./downloadsFolder";
import { ConfirmModal } from "./obsidianComponents";
import { folderNameToDocxOutfileName } from "./utilities";

interface ManuscriptenSettings {
    authorName: string;
    authorSurname: string;
    authorContactInformation: string;
    outputDir: string;
}

const DEFAULT_SETTINGS: Partial<ManuscriptenSettings> = {
    outputDir: downloadsFolder(),
};

/**
 * Manuscript file's metadata.
 */
interface ManuscriptMetadata {
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
    outputDir: string;
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
    contactInformation?: string;
}

export default class ManuscriptenPlugin extends Plugin {
    settings: ManuscriptenSettings;

    async onload() {
        await this.loadSettings();

        this.addSettingTab(new ManuscriptenSettingTab(this.app, this));

        this.addEnmanuscriptContextMenuItems();

        this.addEnmanuscriptCommands();
    }

    onunload() {}

    async loadSettings() {
        this.settings = Object.assign(
            {},
            DEFAULT_SETTINGS,
            await this.loadData()
        );
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }

    /**
     * Add enmanuscript items to the file pane context menu for notes and folders.
     */
    addEnmanuscriptContextMenuItems() {
        this.registerEvent(
            this.app.workspace.on("file-menu", (menu, file) => {
                if (
                    (file instanceof TFile && file.extension === "md") ||
                    file instanceof TFolder
                ) {
                    menu.addItem((item) => {
                        item.setTitle("Save as manuscript (Shunn modern)")
                            .setIcon("book-text") // Lucide icon name
                            .onClick(() => {
                                let node: TFolder | TFile | null = file;
                                // If we're run on a file, find the containing folder
                                if (node instanceof TFile) {
                                    node = node.parent;
                                }

                                if (node instanceof TFolder) {
                                    this.saveAsManuscript(node);
                                } else {
                                    console.error(
                                        "Unexpected type of folder:",
                                        node
                                    );
                                }
                            });
                    });
                }
            })
        );
    }

    /**
     * Add enmanuscript commands when a note is open.
     */
    addEnmanuscriptCommands() {
        this.addCommand({
            id: "save-as-manuscript",
            name: "Save as manuscript (Shunn Modern)",
            checkCallback: (checking: boolean) => {
                // Only happen if we're in a markdown view
                const markdownView =
                    this.app.workspace.getActiveViewOfType(MarkdownView);
                if (markdownView && markdownView.file !== null) {
                    if (!checking) {
                        if (markdownView.file.parent instanceof TFolder) {
                            this.saveAsManuscript(markdownView.file.parent);
                        } else {
                            console.error(
                                "Note didn't have a folder:",
                                markdownView.file
                            );
                        }
                    }

                    return true;
                }
            },
        });
    }

    async saveAsManuscript(folder: TFolder) {
        const pipeline = unified()
            .use(remarkParse)
            .use(remarkGfm)
            .use(remarkFrontmatter);

        const metadata: ManuscriptMetadata = {
            title: folder.name,
            filename: folderNameToDocxOutfileName(folder.name),
            outputDir: this.settings.outputDir.trim(),
            author: this.settings.authorName.trim(),
            surname: this.settings.authorSurname.trim(),
            contactInformation: this.settings.authorContactInformation.trim(),
        };

        const notes = folder.children.filter(
            (f) => f instanceof TFile && f.extension === "md"
        ) as TFile[];
        // TODO handle too-large number of notes (is the user sure? maybe make that a setting)

        let tree;
        for (const note of notes) {
            // Check if the note has properties that overwrite the global settings
            const frontmatter =
                this.app.metadataCache.getFileCache(note)?.frontmatter;
            if (frontmatter !== null && frontmatter !== undefined) {
                if (frontmatter.title !== undefined) {
                    metadata.title = frontmatter.title.trim();
                }
                if (frontmatter.filename !== undefined) {
                    metadata.filename = frontmatter.filename;
                }
                if (frontmatter.outdir !== undefined) {
                    if (fs.existsSync(frontmatter.outdir)) {
                        metadata.outputDir = frontmatter.outdir;
                    } else {
                        new Notice(
                            `outdir property on note ${note.name} has a non-existent directory: ` +
                                `${frontmatter.outdir}. Using default output directory: ${metadata.outputDir}`
                        );
                    }
                }
                if (frontmatter.author !== undefined) {
                    metadata.author = frontmatter.author.trim();
                }
                if (frontmatter.surname !== undefined) {
                    metadata.surname = frontmatter.surname.trim();
                }
                if (frontmatter.contact !== undefined) {
                    metadata.contactInformation = frontmatter.contact.trim();
                }
            }

            if (metadata.author === "") {
                metadata.author = undefined;
            }
            if (metadata.surname === "") {
                metadata.surname = undefined;
            }
            if (metadata.contactInformation === "") {
                metadata.contactInformation = undefined;
            }

            // Turn markdown content into an AST
            const content = await this.app.vault.cachedRead(note);
            // TODO ADD WORDCOUNT!
            const subTree = pipeline.parse(content);
            subTree.children = subTree.children.filter(
                (node) => node.type !== "yaml"
            );
            if (tree === undefined) {
                tree = subTree;
            } else {
                tree.children.push(
                    { type: "thematicBreak" },
                    ...subTree.children
                );
            }
        }

        if (tree === undefined) {
            new Notice(
                `Couldn't find Markdown in ${folder.name} to save as a manuscript`
            );
            return;
        }

        const docxArrayBuffer = await this.storyMdToDocx(tree, metadata);

        const outFullPath = path.join(metadata.outputDir, metadata.filename);
        if (fs.existsSync(outFullPath)) {
            new ConfirmModal(
                this.app,
                `Manuscript file "${metadata.filename}" already exists.`,
                () => {
                    this.writeDocxFile(outFullPath, docxArrayBuffer);
                },
                "Overwrite",
                "Cancel"
            ).open();
        } else {
            this.writeDocxFile(outFullPath, docxArrayBuffer);
        }
    }

    /**
     * Turn a story's Markdown into the contents of a docx file.
     * @param tree Markdown abstract syntax tree for the story.
     * @param metadata Manuscript metadata.
     * @returns Docx content.
     */
    private async storyMdToDocx(tree: Root, metadata: ManuscriptMetadata) {
        const docProps: IDocxProps = {
            title: metadata.title,
        };
        const sectionProps: ISectionProps = {
            properties: {
                page: {
                    margin: {
                        top: "1in",
                        right: "1in",
                        bottom: "1in",
                        left: "1in",
                    },
                    pageNumbers: {
                        start: 1,
                        formatType: docx.NumberFormat.DECIMAL,
                    },
                },
                titlePage: true, // So we get a page with no header
            },
            headers: {
                default: new docx.Header({
                    children: [
                        new docx.Paragraph({
                            children: [
                                new docx.TextRun({
                                    children: [
                                        metadata.surname !== undefined
                                            ? `${metadata.surname} / `
                                            : "" + `${metadata.title} / `,
                                        docx.PageNumber.CURRENT,
                                    ],
                                }),
                            ],
                            alignment: "right",
                        }),
                    ],
                }),
            },
            plugins: [
                shunnThematicBreakPlugin(),
                doubleSpaceAndIndentParas(),
                addFrontMatterPlugin(
                    metadata.title,
                    "About 870 words",
                    metadata.author,
                    metadata.contactInformation
                ),
            ],
        };

        const docxArrayBuffer = (await toDocx(
            tree,
            docProps,
            sectionProps,
            "arraybuffer"
        )) as ArrayBuffer;
        return docxArrayBuffer;
    }

    /**
     * Write a docx file, notifying the Obsidian user.
     * @param outPath Path to write the output to.
     * @param content Docx file contents.
     */
    private writeDocxFile(outPath: string, content: ArrayBuffer) {
        try {
        fs.writeFileSync(outPath, Buffer.from(content));
        new Notice(`Manuscript saved as ${path.basename(outPath)}`);
        } catch (e) {
            new Notice(`Failed to write manuscript: ${e}`);
        }
    }
}

class ManuscriptenSettingTab extends PluginSettingTab {
    plugin: ManuscriptenPlugin;

    constructor(app: App, plugin: ManuscriptenPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;

        containerEl.empty();

        new Setting(containerEl)
            .setName("Author Name")
            .setDesc("Appears at the top of the manuscript")
            .addText((text) =>
                text
                    .setPlaceholder("Example: Jae Simons")
                    .setValue(this.plugin.settings.authorName)
                    .onChange(async (value) => {
                        this.plugin.settings.authorName = value;
                        await this.plugin.saveSettings();
                    })
            );

        new Setting(containerEl)
            .setName("Author Surname")
            .setDesc("Appears in manuscript headers")
            .addText((text) =>
                text
                    .setPlaceholder("Example: Simons")
                    .setValue(this.plugin.settings.authorSurname)
                    .onChange(async (value) => {
                        this.plugin.settings.authorSurname = value;
                        await this.plugin.saveSettings();
                    })
            );

        new Setting(containerEl)
            .setName("Author Contact Information")
            .setDesc("Appears in the manuscript front matter")
            .addTextArea((text) =>
                text
                    .setPlaceholder(
                        "Example: Jae Simons\njaesimons@actualemail.com"
                    )
                    .setValue(this.plugin.settings.authorContactInformation)
                    .onChange(async (value) => {
                        this.plugin.settings.authorContactInformation = value;
                        await this.plugin.saveSettings();
                    })
            );

        new Setting(containerEl)
            .setName("Output Directory")
            .setDesc("Where to put the .docx files")
            .addText((text) =>
                text
                    .setPlaceholder("Example: c:/users/jsimons/Documents")
                    .setValue(this.plugin.settings.outputDir)
                    .onChange(async (value) => {
                        this.plugin.settings.outputDir = value;
                        await this.plugin.saveSettings();
                    })
            );
    }
}
