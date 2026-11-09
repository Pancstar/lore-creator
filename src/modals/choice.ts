import { App, Modal, Setting } from "obsidian";
import { applyLang } from "../i18n";

export interface ChoiceButton<T extends string> {
	id: T;
	label: string;
	/** Drawn as the main button. */
	cta?: boolean;
}

export interface ChoiceOptions<T extends string> {
	title: string;
	body: string;
	/** Left to right; the main one usually last. */
	buttons: ChoiceButton<T>[];
}

/**
 * A question with more answers than yes and no. Resolves with the id of the
 * button pressed, or null when the dialog is closed without one.
 */
export function askChoice<T extends string>(app: App, options: ChoiceOptions<T>): Promise<T | null> {
	return new Promise((resolve) => {
		new ChoiceModal(app, options, resolve).open();
	});
}

class ChoiceModal<T extends string> extends Modal {
	private chosen: T | null = null;

	constructor(
		app: App,
		private options: ChoiceOptions<T>,
		private onDone: (choice: T | null) => void,
	) {
		super(app);
	}

	onOpen() {
		applyLang(this.modalEl);
		this.titleEl.setText(this.options.title);
		this.contentEl.createEl("p", { text: this.options.body });

		const row = new Setting(this.contentEl);
		for (const choice of this.options.buttons) {
			row.addButton((button) => {
				button.setButtonText(choice.label).onClick(() => {
					this.chosen = choice.id;
					this.close();
				});
				if (choice.cta) button.setCta();
			});
		}
	}

	onClose() {
		this.contentEl.empty();
		this.onDone(this.chosen);
	}
}
