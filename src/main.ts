import { MarkdownView, Plugin, TFile, WorkspaceLeaf, moment, normalizePath } from "obsidian";
import { DEFAULT_SETTINGS, LoreSettingTab, LoreSettings } from "./settings";
import { I18n } from "./i18n";
import { Universe } from "./universe";
import { TypeRegistry } from "./types";
import { Banner } from "./banner";
import { Navigator } from "./navigator";
import { PickTargetModal } from "./modals/pickTarget";
import { VersionStore } from "./versions/store";
import { VersionSetStore } from "./versions/sets";
import { NewNoteModal } from "./modals/newNote";
import { PromoteModal } from "./modals/promote";
import { VersionMenuModal } from "./modals/versionMenu";
import { VersionSetsModal } from "./modals/versionSets";
import {
	DashboardView,
	DraftsView,
	LawsView,
	TimelineView,
	VIEW_DEFINITIONS,
	VIEW_TYPE_TIMELINE,
} from "./views";
import { SearchModal } from "./modals/search";
import { ExportModal } from "./modals/export";

export default class LorePlugin extends Plugin {
	settings: LoreSettings = { ...DEFAULT_SETTINGS };
	i18n = new I18n();
	universe!: Universe;
	types!: TypeRegistry;
	banner!: Banner;
	navigator!: Navigator;
	versions!: VersionStore;
	versionSets!: VersionSetStore;

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
		this.versions = new VersionStore(this.app, this.settings.versionsFolder);
		this.versionSets = new VersionSetStore(this.app, this.versions, this.settings.versionSetsFile);
		this.banner = new Banner(this);
		this.navigator = new Navigator(this);
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

		this.addCommand({
			id: "note-versions",
			name: this.i18n.t("command.versions"),
			checkCallback: (checking) => {
				const file = this.app.workspace.getActiveFile();
				if (!file) return false;
				if (!checking) new VersionMenuModal(this.app, this, file).open();
				return true;
			},
		});

		this.addCommand({
			id: "version-sets",
			name: this.i18n.t("command.versionSets"),
			callback: () => new VersionSetsModal(this.app, this).open(),
		});

		this.addCommand({
			id: "lore-search",
			name: this.i18n.t("command.search"),
			callback: () => new SearchModal(this.app, this).open(),
		});

		this.addCommand({
			id: "export-universe",
			name: this.i18n.t("command.export"),
			callback: () => new ExportModal(this.app, this).open(),
		});

		this.addCommand({
			id: "promote-draft",
			name: this.i18n.t("command.promote"),
			checkCallback: (checking) => {
				const file = this.app.workspace.getActiveFile();
				if (!file) return false;
				const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter;
				if (frontmatter?.type !== "draft") return false;
				if (!checking) new PromoteModal(this.app, this, file).open();
				return true;
			},
		});

		this.addCommand({
			id: "go-next",
			name: this.i18n.t("command.goNext"),
			checkCallback: (checking) => this.navigateCommand(checking, "next"),
		});

		this.addCommand({
			id: "go-prev",
			name: this.i18n.t("command.goPrev"),
			checkCallback: (checking) => this.navigateCommand(checking, "prev"),
		});

		this.addSettingTab(new LoreSettingTab(this.app, this));

		this.registerEvent(this.app.workspace.on("file-open", () => this.decorateNotes()));
		this.registerEvent(this.app.workspace.on("layout-change", () => this.decorateNotes()));
		this.registerEvent(
			this.app.workspace.on("resize", () => this.navigator.syncStatusBarOffset()),
		);
		this.registerEvent(
			this.app.metadataCache.on("changed", (file) => this.onMetadataChanged(file)),
		);

		// Views exist before this plugin finishes loading, so draw into them once
		// the workspace is settled rather than waiting for the next file to open.
		this.app.workspace.onLayoutReady(() => this.decorateNotes());
	}

	onunload() {
		this.banner?.removeAll();
		this.navigator?.removeAll();
	}

	/**
	 * Only offered when the note actually leads somewhere; a branching story
	 * asks which way rather than picking one on the author's behalf.
	 */
	private navigateCommand(checking: boolean, direction: "next" | "prev"): boolean {
		const file = this.app.workspace.getActiveFile();
		if (!file) return false;

		const targets = this.navigator.targets(file, direction);
		if (targets.length === 0) return false;
		if (checking) return true;

		if (targets.length === 1) {
			void this.app.workspace.getLeaf(false).openFile(targets[0]);
			return true;
		}

		new PickTargetModal(
			this.app,
			targets,
			this.i18n.t(direction === "next" ? "nav.pickNext" : "nav.pickPrev"),
			(target) => void this.app.workspace.getLeaf(false).openFile(target),
		).open();
		return true;
	}

	/** Draws the banner and the navigation bar into every open markdown view. */
	private decorateNotes() {
		this.banner.refreshAll();
		this.navigator.refreshAll();
	}

	private onMetadataChanged(file: TFile) {
		// Any frontmatter edit can move a note on the timeline or change which
		// laws and drafts it relates to, so the lists are rebuilt regardless of
		// which note changed.
		this.refreshViews();

		if (this.types.isRegistryFile(file)) {
			this.types.invalidate();
			this.decorateNotes();
			return;
		}

		// Editing one note can change what its neighbours point at, so every open
		// view is refreshed rather than only the one showing this file.
		this.decorateNotes();
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
		this.universe.setPath(this.settings.universeFile);
		this.types.setPath(this.registryPath);
		this.versions.setFolder(this.settings.versionsFolder);
		this.versionSets.setPath(this.settings.versionSetsFile);
		this.applyLanguage();
		this.refreshViews();
		this.decorateNotes();
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
				if (
					view instanceof LawsView ||
					view instanceof DraftsView ||
					view instanceof DashboardView
				) {
					view.render();
				}
			}
		}
		this.refreshTimelines();
	}

	private refreshTimelines() {
		for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_TIMELINE)) {
			const view = leaf.view;
			if (view instanceof TimelineView) view.queueRender();
		}
	}

	/** Reveals an existing leaf, opening it where that kind of view belongs. */
	async activateView(viewType: string) {
		const { workspace } = this.app;

		const existing = workspace.getLeavesOfType(viewType);
		if (existing.length > 0) {
			await workspace.revealLeaf(existing[0]);
			return;
		}

		const definition = VIEW_DEFINITIONS.find((entry) => entry.type === viewType);
		const leaf: WorkspaceLeaf | null =
			definition?.placement === "main" ? workspace.getLeaf("tab") : workspace.getRightLeaf(false);
		if (!leaf) return;

		await leaf.setViewState({ type: viewType, active: true });
		await workspace.revealLeaf(leaf);
	}
}
