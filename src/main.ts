import { MarkdownView, Notice, Plugin, TAbstractFile, TFile, WorkspaceLeaf, debounce, getLanguage, normalizePath } from "obsidian";
import { SetupModal } from "./setup/wizard";
import { LoreSettingTab } from "./settings";
import { I18n } from "./i18n";
import { DEFAULT_SETTINGS, LoreSettings, sanitizeSettings } from "./settingsData";
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
	GuideView,
	LawsView,
	TimelineView,
	VIEW_DEFINITIONS,
	VIEW_TYPE_DASHBOARD,
	VIEW_TYPE_GUIDE,
	VIEW_TYPE_TIMELINE,
} from "./views";
import type { ChapterId } from "./guide/chapters";
import { SearchModal } from "./modals/search";
import { ExportModal } from "./modals/export";
import { TimelineModel } from "./timeline/model";
import { openTimeSystemEditor } from "./modals/timeSystem";
import { setTemplatesFolder } from "./scope";

export default class LorePlugin extends Plugin {
	settings: LoreSettings = { ...DEFAULT_SETTINGS };
	i18n = new I18n();
	universe!: Universe;
	types!: TypeRegistry;
	banner!: Banner;
	navigator!: Navigator;
	versions!: VersionStore;
	versionSets!: VersionSetStore;

	/**
	 * Autosave fires metadata events on nearly every keystroke. Caches are
	 * dropped at once, but the redraw waits for the burst to settle.
	 */
	private scheduleRefresh = debounce(() => this.refreshAll(), 150, true);

	get language(): "tr" | "en" {
		return this.i18n.current;
	}

	private get registryPath(): string {
		return normalizePath(this.settings.registryFile);
	}

	async onload() {
		await this.loadSettings();
		setTemplatesFolder(this.settings.templatesFolder);

		this.universe = new Universe(this.app, this.settings.universeFile);
		this.types = new TypeRegistry(this.app, this.registryPath);
		this.versions = new VersionStore(this.app, this.settings.versionsFolder);
		this.versionSets = new VersionSetStore(this.app, this.versions, this.settings.versionSetsFile, () => this.language);
		this.banner = new Banner(this);
		this.navigator = new Navigator(this);
		this.applyLanguage();

		for (const definition of VIEW_DEFINITIONS) {
			this.registerView(definition.type, (leaf) => definition.create(leaf, this));

			if (definition.ribbon) {
				this.addRibbonIcon(definition.icon, this.i18n.t(definition.titleKey), () => {
					void this.activateView(definition.type);
				});
			}

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
			id: "edit-time-system",
			name: this.i18n.t("command.timeSystem"),
			callback: () => openTimeSystemEditor(this),
		});

		this.addCommand({
			id: "setup-vault",
			name: this.i18n.t("command.setup"),
			callback: () => new SetupModal(this.app, this).open(),
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
			id: "show-in-timeline",
			name: this.i18n.t("command.showInTimeline"),
			checkCallback: (checking) => {
				const file = this.app.workspace.getActiveFile();
				if (!file) return false;
				const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter;
				if (typeof frontmatter?.timeline !== "string" || !frontmatter.timeline.trim()) return false;
				if (frontmatter["version-of"]) return false;
				if (!checking) void this.showInTimeline(file);
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

		// Opening a file redraws that note; a pane coming into view draws any
		// note that went stale while it was hidden.
		this.registerEvent(this.app.workspace.on("file-open", () => this.decorateUnseen()));
		this.registerEvent(this.app.workspace.on("layout-change", () => this.decorateUnseen()));
		this.registerEvent(this.app.workspace.on("active-leaf-change", () => this.decorateUnseen()));
		this.registerEvent(
			this.app.workspace.on("resize", () => this.decorateUnseen()),
		);
		this.registerEvent(
			this.app.metadataCache.on("changed", (file) => this.onMetadataChanged(file)),
		);
		// A report opened before Obsidian finished reading links skipped the
		// orphan check; it is redrawn once, when the index is complete.
		this.registerEvent(
			this.app.metadataCache.on("resolved", () => {
				this.linksResolved = true;
				for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_DASHBOARD)) {
					if (leaf.view instanceof DashboardView && leaf.view.waitingForIndex) leaf.view.render();
				}
			}),
		);
		// Deleted and renamed notes must leave the views even when no other note's
		// metadata changes alongside them.
		this.registerEvent(this.app.vault.on("delete", (file) => this.onVaultStructureChanged(file)));
		this.registerEvent(this.app.vault.on("rename", (file) => this.onVaultStructureChanged(file)));

		// Views exist before this plugin finishes loading, so draw into them once
		// the workspace is settled rather than waiting for the next file to open.
		this.app.workspace.onLayoutReady(() => {
			this.decorateNotes();
			// First run (including a first run after updating): the guide opens
			// once and its "Set up your universe" chapter replaces the notice,
			// so a newcomer never meets two prompts at once.
			if (!this.settings.guideShown) {
				this.settings.guideShown = true;
				void this.saveData(this.settings);
				void this.openGuide("intro");
				return;
			}
			this.offerSetup();
		});
	}

	onunload() {
		this.scheduleRefresh.cancel();
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

	/**
	 * A vault with no universe note has nothing for any of these views to show,
	 * so the offer to build one is made once and then never again — an author
	 * who declined does not want asking every time Obsidian starts.
	 */
	private offerSetup() {
		if (this.settings.setupOffered) return;
		if (this.universe.file) return;

		const notice = new Notice(this.i18n.t("setup.offer"), 15000);
		notice.messageEl.addClass("plc-clickable-notice");
		notice.messageEl.addEventListener("click", () => {
			notice.hide();
			new SetupModal(this.app, this).open();
		});

		this.settings.setupOffered = true;
		void this.saveData(this.settings);
	}

	/**
	 * Notes whose banner and navigation bar match the vault as it is now. A
	 * change redraws only the notes on screen; the rest drop out of this map and
	 * are drawn when they are shown, so many open tabs cost nothing while typing.
	 */
	private freshViews = new WeakMap<MarkdownView, string>();

	/** Set by the first "resolved" event: Obsidian has read every note's links once. */
	linksResolved = false;

	private markdownViews(): MarkdownView[] {
		return this.app.workspace
			.getLeavesOfType("markdown")
			.map((leaf) => leaf.view)
			.filter((view): view is MarkdownView => view instanceof MarkdownView);
	}

	private decorateView(view: MarkdownView) {
		this.banner.render(view);
		this.navigator.render(view);
		this.freshViews.set(view, view.file?.path ?? "");
	}

	/** Redraws the notes on screen; hidden ones are marked to be drawn when shown. */
	decorateNotes() {
		this.navigator.syncStatusBarOffset();
		// Read every view's visibility first, then draw: checking after each draw
		// would force a layout per note.
		const views = this.markdownViews().map((view) => ({ view, shown: view.containerEl.isShown() }));
		for (const { view, shown } of views) {
			if (shown) this.decorateView(view);
			else this.freshViews.delete(view);
		}
	}

	/** Draws notes on screen that missed a redraw while hidden, or are new. */
	private decorateUnseen() {
		this.navigator.syncStatusBarOffset();
		for (const view of this.markdownViews()) {
			// New, stale, or now showing a different file.
			const drawn = this.freshViews.get(view);
			if (drawn !== (view.file?.path ?? "") && view.containerEl.isShown()) this.decorateView(view);
		}
	}



	private onMetadataChanged(file: TFile) {
		if (this.types.isRegistryFile(file)) this.types.invalidate();

		// Any frontmatter edit can move a note on the timeline or change which
		// laws and drafts it relates to, so the lists are rebuilt regardless of
		// which note changed. Editing one note can also change what its
		// neighbours point at, so every open note is redecorated too.
		this.invalidateIndexes();
		this.scheduleRefresh();
	}

	private onVaultStructureChanged(file: TAbstractFile) {
		if (file instanceof TFile && this.types.isRegistryFile(file)) this.types.invalidate();
		this.invalidateIndexes();
		this.scheduleRefresh();
	}

	/** Drops every vault-wide cache; the next read rebuilds each in one pass. */
	private invalidateIndexes() {
		TimelineModel.invalidate();
		this.versions.invalidate();
	}

	private refreshAll() {
		this.refreshViews();
		this.decorateNotes();
	}

	async loadSettings() {
		this.settings = sanitizeSettings<LoreSettings>(await this.loadData(), DEFAULT_SETTINGS);
	}

	async saveSettings() {
		await this.saveData(this.settings);
		this.universe.setPath(this.settings.universeFile);
		this.types.setPath(this.registryPath);
		this.versions.setFolder(this.settings.versionsFolder);
		this.versionSets.setPath(this.settings.versionSetsFile);
		setTemplatesFolder(this.settings.templatesFolder);
		this.invalidateIndexes();
		this.applyLanguage();
		this.refreshViews();
		this.decorateNotes();
	}

	private applyLanguage() {
		// Obsidian reports its own interface language, which is more dependable
		// than reading the setting out of local storage ourselves.
		this.i18n.setLanguage(this.settings.language, getLanguage() || "en");
	}

	private refreshViews() {
		for (const definition of VIEW_DEFINITIONS) {
			for (const leaf of this.app.workspace.getLeavesOfType(definition.type)) {
				const view = leaf.view;
				if (view instanceof GuideView) {
					view.refresh();
				} else if (
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

	/** Opens the guide tab, on a given chapter when asked. */
	async openGuide(chapter?: ChapterId) {
		await this.activateView(VIEW_TYPE_GUIDE);
		const view = this.app.workspace.getLeavesOfType(VIEW_TYPE_GUIDE)[0]?.view;
		if (chapter && view instanceof GuideView) view.openChapter(chapter);
	}

	/** Reveals an existing leaf, opening it where that kind of view belongs. */
	/** Opens the timeline and brings a note into view once the canvas has a size. */
	async showInTimeline(file: TFile) {
		await this.activateView(VIEW_TYPE_TIMELINE);
		const view = this.app.workspace.getLeavesOfType(VIEW_TYPE_TIMELINE)[0]?.view;
		if (!(view instanceof TimelineView)) return;
		window.requestAnimationFrame(() => {
			if (!view.showNote(file)) new Notice(this.i18n.t("timeline.notOnTimeline"));
		});
	}

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
