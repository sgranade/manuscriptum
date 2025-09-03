import { App, Modal, Setting } from "obsidian";

/**
 * Confirmation modal.
 */
export class ConfirmModal extends Modal {
    private question: string;
    private yesText: string;
    private noText: string;
    private onYes: () => void;
    private onNo: () => void;

    /**
     * Create a confirmation modal.
     * @param app Obsidian app.
     * @param question Question to ask the user.
     * @param onYes Function to run if they say yes.
     * @param yesText Text for the "yes" button.
     * @param noText Text for the "no" button.
     * @param onNo Function to run if they say no.
     */
    constructor(
        app: App,
        question: string,
        onYes: () => void,
        yesText = "Yes",
        noText = "No",
        onNo?: () => void
    ) {
        super(app);
        this.question = question;
        this.yesText = yesText;
        this.noText = noText;
        this.onYes = onYes;
        this.onNo = onNo ?? (() => {});
    }

    onOpen() {
        const { contentEl } = this;

        contentEl.createEl("p", { text: this.question });

        new Setting(contentEl)
            .addButton((btn) =>
                btn
                    .setButtonText(this.yesText)
                    .setCta()
                    .onClick(() => {
                        this.close();
                        this.onYes();
                    })
            )
            .addButton((btn) =>
                btn.setButtonText(this.noText).onClick(() => {
                    this.close();
                    this.onNo();
                })
            );
    }

    onClose() {
        this.contentEl.empty();
    }
}
