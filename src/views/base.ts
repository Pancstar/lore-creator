import { ItemView, WorkspaceLeaf } from "obsidian";
import type LorePlugin from "../main";

/**
 * Shared shell for the plugin's side views. Each phase replaces one of these
 * placeholders with a real implementation; the registration and icon stay put.
 */
export abstract class LoreView extends ItemView {
	abstract readonly viewType: string;
	abstract readonly titleKey: string;
	abstract readonly hintKey: string;
	abstract readonly icon: string;

	constructor(
		leaf: WorkspaceLeaf,
		protected plugin: LorePlugin,
	) {
		super(leaf);
	}

	getViewType(): string {
		return this.viewType;
	}

	getDisplayText(): string {
		return this.plugin.i18n.t(this.titleKey);
	}

	getIcon(): string {
		return this.icon;
	}

	async onOpen() {
		this.render();
	}

	render() {
		const container = this.contentEl;
		container.empty();
		container.addClass("plc-view");

		container.createEl("h3", { text: this.plugin.i18n.t(this.titleKey) });
		container.createEl("p", {
			text: this.plugin.i18n.t(this.hintKey),
			cls: "plc-view-hint",
		});
		container.createEl("p", {
			text: this.plugin.i18n.t("view.placeholder"),
			cls: "plc-view-placeholder",
		});
	}
}
