import { App, SuggestModal, TFile } from "obsidian";

/**
 * Shown when a fragment leads to more than one place, which is the normal case
 * in a branching story rather than an edge case.
 */
export class PickTargetModal extends SuggestModal<TFile> {
	constructor(
		app: App,
		private targets: TFile[],
		placeholder: string,
		private onPick: (file: TFile) => void,
	) {
		super(app);
		this.setPlaceholder(placeholder);
	}

	getSuggestions(query: string): TFile[] {
		const needle = query.trim().toLowerCase();
		if (!needle) return this.targets;
		return this.targets.filter((file) => file.basename.toLowerCase().includes(needle));
	}

	renderSuggestion(file: TFile, el: HTMLElement) {
		el.createDiv({ text: file.basename });

		const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter;
		const label = typeof frontmatter?.["time-label"] === "string" ? frontmatter["time-label"] : "";
		if (label) el.createEl("small", { text: label, cls: "plc-version-note" });
	}

	onChooseSuggestion(file: TFile) {
		this.onPick(file);
	}
}
