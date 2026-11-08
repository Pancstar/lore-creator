import { ItemView, WorkspaceLeaf, setIcon } from "obsidian";
import type LorePlugin from "../main";
import { CHAPTERS, Chapter, ChapterId, FAQ, GROUPS, GuideAction, GuideBlock, GuideCondition } from "./chapters";
import { renderDiagram } from "./diagrams";
import { confirmCreateExample, confirmRemoveExample, exampleExists } from "./example";
import { openTimeSystemEditor } from "../modals/timeSystem";
import { SetupModal } from "../setup/wizard";
import { NewNoteModal } from "../modals/newNote";
import { VIEW_TYPE_TIMELINE } from "../timeline/view";
import { VIEW_TYPE_DASHBOARD } from "../views/dashboard";

export const VIEW_TYPE_GUIDE = "plc-guide";

/** Below this pane width the menu sits above the page instead of beside it. */
const NARROW_WIDTH = 640;

/**
 * A friendly tour of the plugin: a menu of chapters on one side, one chapter at
 * a time on the other, with buttons that do the thing being explained. It
 * reads the vault but never writes to it on its own.
 */
export class GuideView extends ItemView {
	private current: ChapterId = "intro";
	private faqQuery = "";
	private menuEl!: HTMLElement;
	private pageEl!: HTMLElement;

	constructor(
		leaf: WorkspaceLeaf,
		private plugin: LorePlugin,
	) {
		super(leaf);
	}

	getViewType(): string {
		return VIEW_TYPE_GUIDE;
	}

	getDisplayText(): string {
		return this.plugin.i18n.t("view.guide");
	}

	getIcon(): string {
		return "book-open";
	}

	private t(key: string, ...args: string[]): string {
		return this.plugin.i18n.t(key, ...args);
	}

	async onOpen() {
		this.contentEl.addClass("plc-guide");
		this.menuEl = this.contentEl.createDiv({ cls: "plc-guide-menu" });
		this.pageEl = this.contentEl.createDiv({ cls: "plc-guide-page" });

		const observer = new ResizeObserver(() => {
			this.contentEl.toggleClass("is-narrow", this.contentEl.clientWidth < NARROW_WIDTH);
		});
		observer.observe(this.contentEl);
		this.register(() => observer.disconnect());

		this.render();
	}

	async onClose() {
		this.contentEl.empty();
	}

	openChapter(id: ChapterId) {
		this.current = id;
		this.markRead(id);
		this.render();
		this.pageEl?.scrollTo({ top: 0 });
	}

	/**
	 * Called by the plugin's debounced refresh. Redraws only when something the
	 * guide shows actually changed, so a reader's place and focus survive
	 * every autosave.
	 */
	refresh() {
		this.exampleCache = null;
		if (this.stateKey() !== this.lastStateKey) this.render();
	}

	private lastStateKey = "";

	private stateKey(): string {
		return `${this.plugin.language}|${this.holds("universeExists")}|${this.holds("exampleExists")}`;
	}

	render() {
		this.exampleCache = null;
		this.lastStateKey = this.stateKey();
		if (!this.menuEl) return;
		this.renderMenu();
		this.renderPage();
	}

	private markRead(id: ChapterId) {
		const read = this.plugin.settings.guideRead;
		if (read.includes(id)) return;
		this.plugin.settings.guideRead = [...read, id];
		// Saved straight to disk: a full settings save would redraw every view.
		void this.plugin.saveData(this.plugin.settings);
	}

	private renderMenu() {
		this.menuEl.empty();
		const read = new Set(this.plugin.settings.guideRead);

		for (const group of GROUPS) {
			this.menuEl.createDiv({ cls: "plc-guide-group", text: this.t(`guide.group.${group}`) });
			for (const chapter of CHAPTERS.filter((entry) => entry.group === group)) {
				const item = this.menuEl.createEl("button", {
					cls: `plc-guide-item${chapter.id === this.current ? " is-active" : ""}`,
				});
				const mark = item.createSpan({ cls: "plc-guide-mark" });
				if (chapter.id === "faq") setIcon(mark, "help-circle");
				else mark.setText(read.has(chapter.id) ? "✅" : chapter.id === this.current ? "▶" : "○");
				item.createSpan({ text: this.t(`guide.${chapter.id}.title`) });
				item.addEventListener("click", () => this.openChapter(chapter.id));
			}
		}
	}

	private renderPage() {
		this.pageEl.empty();
		const index = CHAPTERS.findIndex((chapter) => chapter.id === this.current);
		const chapter = CHAPTERS[index];

		const bar = this.pageEl.createDiv({ cls: "plc-guide-progress" });
		for (let i = 0; i < CHAPTERS.length; i++) {
			bar.createSpan({ cls: i <= index ? "is-done" : "" });
		}
		this.pageEl.createDiv({
			cls: "plc-guide-meta",
			text: this.t("guide.progress", String(index + 1), String(CHAPTERS.length), String(chapter.minutes)),
		});
		this.pageEl.createEl("h2", { text: this.t(`guide.${chapter.id}.title`) });

		if (chapter.id === "faq") this.renderFaq();
		else for (const block of chapter.blocks) this.renderBlock(block);

		this.renderNav(index);
	}

	private renderBlock(block: GuideBlock) {
		switch (block.kind) {
			case "text":
				this.pageEl.createEl("p", { text: this.t(block.key) });
				return;
			case "tip":
				this.pageEl.createDiv({ cls: "plc-guide-tip", text: `💡 ${this.t(block.key)}` });
				return;
			case "diagram":
				renderDiagram(this.pageEl, block.diagram, (key) => this.t(key));
				return;
			case "state":
				if (this.holds(block.when)) this.pageEl.createDiv({ cls: "plc-guide-state", text: this.t(block.key) });
				return;
			case "curious": {
				const details = this.pageEl.createEl("details", { cls: "plc-guide-curious" });
				details.createEl("summary", { text: this.t("guide.curious") });
				details.createEl("p", { text: this.t(block.key) });
				return;
			}
			case "action": {
				if (!this.actionVisible(block.action)) return;
				const button = this.pageEl.createEl("button", {
					cls: `plc-guide-action${block.action === "removeExample" ? "" : " mod-cta"}`,
					text: this.t(block.key),
				});
				button.addEventListener("click", () => this.run(block.action));
				return;
			}
		}
	}

	/** One vault scan per render or refresh, not one per block. */
	private exampleCache: boolean | null = null;

	private hasExample(): boolean {
		this.exampleCache ??= exampleExists(this.app);
		return this.exampleCache;
	}

	private holds(condition: GuideCondition): boolean {
		if (condition === "universeExists") return !!this.plugin.universe.file;
		return this.hasExample();
	}

	/** Create and remove never show together; the one that makes sense does. */
	private actionVisible(action: GuideAction): boolean {
		if (action === "createExample") return !this.hasExample();
		if (action === "removeExample") return this.hasExample();
		return true;
	}

	private run(action: GuideAction) {
		switch (action) {
			case "setup":
				new SetupModal(this.app, this.plugin).open();
				return;
			case "timeSystem":
				openTimeSystemEditor(this.plugin);
				return;
			case "newNote":
				new NewNoteModal(this.app, this.plugin).open();
				return;
			case "openTimeline":
				void this.plugin.activateView(VIEW_TYPE_TIMELINE);
				return;
			case "openDashboard":
				void this.plugin.activateView(VIEW_TYPE_DASHBOARD);
				return;
			case "createExample":
				confirmCreateExample(this.plugin);
				return;
			case "removeExample":
				confirmRemoveExample(this.plugin);
				return;
		}
	}

	private renderFaq() {
		const search = this.pageEl.createEl("input", {
			cls: "plc-guide-search",
			attr: { type: "search", placeholder: this.t("guide.faq.search") },
		});
		search.value = this.faqQuery;
		const listEl = this.pageEl.createDiv({ cls: "plc-guide-faq" });

		const draw = () => {
			listEl.empty();
			const needle = this.faqQuery.trim().toLocaleLowerCase(this.plugin.language);
			const matches = FAQ.filter((entry) => {
				if (!needle) return true;
				const text = `${this.t(entry.q)} ${this.t(entry.a)}`.toLocaleLowerCase(this.plugin.language);
				return text.includes(needle);
			});
			if (matches.length === 0) {
				listEl.createEl("p", { cls: "plc-guide-meta", text: this.t("guide.faq.empty") });
				return;
			}
			for (const entry of matches) {
				const details = listEl.createEl("details", { cls: "plc-guide-question" });
				details.createEl("summary", { text: this.t(entry.q) });
				details.createEl("p", { text: this.t(entry.a) });
			}
		};

		search.addEventListener("input", () => {
			this.faqQuery = search.value;
			draw();
		});
		draw();
	}

	private renderNav(index: number) {
		const nav = this.pageEl.createDiv({ cls: "plc-guide-nav" });
		const prev: Chapter | undefined = CHAPTERS[index - 1];
		const next: Chapter | undefined = CHAPTERS[index + 1];

		if (prev) {
			const button = nav.createEl("button", { text: this.t("guide.back", this.t(`guide.${prev.id}.title`)) });
			button.addEventListener("click", () => this.openChapter(prev.id));
		} else {
			nav.createSpan();
		}
		if (next) {
			const button = nav.createEl("button", {
				cls: "mod-cta",
				text: this.t("guide.next", this.t(`guide.${next.id}.title`)),
			});
			button.addEventListener("click", () => this.openChapter(next.id));
		}
	}
}
