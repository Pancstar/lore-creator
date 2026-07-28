import { App, Modal, Setting } from "obsidian";

export interface ConfirmOptions {
	title: string;
	body: string;
	/** Lines describing exactly what will change on disk. */
	details?: string[];
	confirmLabel: string;
	cancelLabel: string;
	destructive?: boolean;
}

/**
 * Used before anything that moves or replaces files. The details list spells out
 * the exact paths involved, because "switch version" hides a lot of file
 * shuffling and the author should see it before agreeing to it.
 */
export class ConfirmModal extends Modal {
	private confirmed = false;

	constructor(
		app: App,
		private options: ConfirmOptions,
		private onConfirm: () => void,
	) {
		super(app);
	}

	onOpen() {
		this.titleEl.setText(this.options.title);
		this.contentEl.addClass("plc-confirm");
		this.contentEl.createEl("p", { text: this.options.body });

		if (this.options.details?.length) {
			const list = this.contentEl.createEl("ul", { cls: "plc-confirm-details" });
			for (const detail of this.options.details) {
				list.createEl("li", { text: detail });
			}
		}

		new Setting(this.contentEl)
			.addButton((button) =>
				button.setButtonText(this.options.cancelLabel).onClick(() => this.close()),
			)
			.addButton((button) => {
				button.setButtonText(this.options.confirmLabel).onClick(() => {
					this.confirmed = true;
					this.close();
				});
				if (this.options.destructive) {
					button.setDestructive();
				} else {
					button.setCta();
				}
			});
	}

	onClose() {
		this.contentEl.empty();
		if (this.confirmed) this.onConfirm();
	}
}
