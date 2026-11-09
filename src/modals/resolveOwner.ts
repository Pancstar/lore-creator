import { App, Modal, Setting, TFile } from "obsidian";
import { applyLang } from "../i18n";

export interface ResolveOwnerOptions {
	title: string;
	body: string;
	/** The notes the old record could mean; one button each, by full path. */
	candidates: TFile[];
	chooseLabel: string;
	cancelLabel: string;
}

/**
 * Asks which note an old record means when it names its note by a name several
 * notes share. Resolves with the chosen note, or null when the author backs out
 * (closing the dialog counts as backing out).
 */
export function askOwner(app: App, options: ResolveOwnerOptions): Promise<TFile | null> {
	return new Promise((resolve) => {
		new ResolveOwnerModal(app, options, resolve).open();
	});
}

class ResolveOwnerModal extends Modal {
	private chosen: TFile | null = null;

	constructor(
		app: App,
		private options: ResolveOwnerOptions,
		private onDone: (file: TFile | null) => void,
	) {
		super(app);
	}

	onOpen() {
		applyLang(this.modalEl);
		this.titleEl.setText(this.options.title);
		this.contentEl.addClass("plc-confirm");
		this.contentEl.createEl("p", { text: this.options.body });

		for (const candidate of this.options.candidates) {
			new Setting(this.contentEl).setName(candidate.path).addButton((button) =>
				button.setButtonText(this.options.chooseLabel).onClick(() => {
					this.chosen = candidate;
					this.close();
				}),
			);
		}

		new Setting(this.contentEl).addButton((button) =>
			button.setButtonText(this.options.cancelLabel).onClick(() => this.close()),
		);
	}

	onClose() {
		this.contentEl.empty();
		this.onDone(this.chosen);
	}
}
