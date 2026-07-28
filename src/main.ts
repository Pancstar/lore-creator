import { MarkdownView, Plugin, TFile, WorkspaceLeaf, moment, normalizePath } from "obsidian";
import { DEFAULT_SETTINGS, LoreSettingTab, LoreSettings } from "./settings";
import { I18n } from "./i18n";
import { Universe } from "./universe";
import { TypeRegistry } from "./types";
import { Banner } from "./banner";
import { NewNoteModal } from "./modals/newNote";
import { LoreView, VIEW_DEFINITIONS } from "./views";

export default class LorePlugin extends Plugin {
	settings: LoreSettings = { ...DEFAULT_SETTINGS };
	i18n = new I18n();
	universe!: Universe;
	types!: TypeRegistry;
	banner!: Banner;

	get language(): "tr" | "en" {
		return this.i18n.current;
	}

	private get registryPath(): string {
		return normalizePath(`${this.settings.systemFolder}/TÜRLER.md`);
	}

	async onload() {
		await this.loadSettings();

		this.universe = new Universe(this.app, this.settings.universeFile);
		this.types = new TypeRegistry(this.app, this.registryPath);
		this.banner = new Banner(this);
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

		this.addCommand({
			id: "new-lore-note",
			name: this.i18n.t("command.newNote"),
			callback: () => new NewNoteModal(this.app, this).open(),
		});

		this.addSettingTab(new LoreSettingTab(this.app, this));

		this.registerEvent(
			this.app.workspace.on("file-open", () => this.banner.refreshAll()),
		);
		this.registerEvent(
			this.app.workspace.on("layout-change", () => this.banner.refreshAll()),
		);
		this.registerEvent(
			this.app.metadataCache.on("changed", (file) => this.onMetadataChanged(file)),
		);

		// Views exist before this plugin finishes loading, so draw into them once
		// the workspace is settled rather than waiting for the next file to open.
		this.app.workspace.onLayoutReady(() => this.banner.refreshAll());
	}

	onunload() {
		this.banner?.removeAll();
	}

	private onMetadataChanged(file: TFile) {
		if (this.types.isRegistryFile(file)) {
			this.types.invalidate();
			this.banner.refreshAll();
			return;
		}

		// Redraw only the views showing this file, so typing in one note does not
		// rebuild banners across the whole workspace.
		for (const leaf of this.app.workspace.getLeavesOfType("markdown")) {
			const view = leaf.view;
			if (view instanceof MarkdownView && view.file?.path === file.path) {
				this.banner.render(view);
			}
		}
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
		this.universe.setPath(this.settings.universeFile);
		this.types.setPath(this.registryPath);
		this.applyLanguage();
		this.refreshViews();
		this.banner.refreshAll();
	}

	private applyLanguage() {
		// Obsidian keeps its bundled moment in sync with the interface language,
		// which is more dependable than reading localStorage directly.
		const locale = moment.locale() || window.localStorage.getItem("language") || "en";
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
