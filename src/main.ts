import { Plugin, WorkspaceLeaf } from "obsidian";
import { DEFAULT_SETTINGS, LoreSettingTab, LoreSettings } from "./settings";
import { I18n } from "./i18n";
import { Universe } from "./universe";
import { LoreView, VIEW_DEFINITIONS } from "./views";

export default class LorePlugin extends Plugin {
	settings: LoreSettings = { ...DEFAULT_SETTINGS };
	i18n = new I18n();
	universe!: Universe;

	async onload() {
		await this.loadSettings();

		this.universe = new Universe(this.app, this.settings.universeFile);
		this.applyLanguage();

		for (const definition of VIEW_DEFINITIONS) {
			this.registerView(definition.type, (leaf) => definition.create(leaf, this));

			this.addRibbonIcon(definition.icon, this.i18n.t(definition.titleKey), () => {
				void this.activateView(definition.type);
			});

			this.addCommand({
				id: `open-${definition.type}`,
				name: this.i18n.t(definition.commandKey),
				callback: () => void this.activateView(definition.type),
			});
		}

		this.addSettingTab(new LoreSettingTab(this.app, this));
	}

	onunload() {
		// Obsidian detaches this plugin's leaves automatically on unload.
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
		this.universe.setPath(this.settings.universeFile);
		this.applyLanguage();
		this.refreshViews();
	}

	private applyLanguage() {
		// `window.localStorage.language` is where Obsidian keeps its UI locale.
		const locale = window.localStorage.getItem("language") ?? "en";
		this.i18n.setLanguage(this.settings.language, locale);
	}

	private refreshViews() {
		for (const definition of VIEW_DEFINITIONS) {
			for (const leaf of this.app.workspace.getLeavesOfType(definition.type)) {
				const view = leaf.view;
				if (view instanceof LoreView) view.render();
			}
		}
	}

	/** Reveals an existing leaf of this type, or opens one in the right sidebar. */
	async activateView(viewType: string) {
		const { workspace } = this.app;

		const existing = workspace.getLeavesOfType(viewType);
		if (existing.length > 0) {
			await workspace.revealLeaf(existing[0]);
			return;
		}

		const leaf: WorkspaceLeaf | null = workspace.getRightLeaf(false);
		if (!leaf) return;

		await leaf.setViewState({ type: viewType, active: true });
		await workspace.revealLeaf(leaf);
	}
}
