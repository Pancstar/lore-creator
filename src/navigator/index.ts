import { MarkdownView, TFile, setIcon } from "obsidian";
import type LorePlugin from "../main";
import { resolveTargets } from "../links";
import { Minimap, MinimapMode } from "./minimap";
import { asString } from "../frontmatter";
import { applyLang } from "../i18n";

const BAR_CLASS = "plc-navbar";
const MAP_CLASS = "plc-minimap";
const HOST_CLASS = "plc-has-navigator";
const STATUS_BAR_OFFSET = "--plc-status-bar-offset";

/**
 * The bar under a note and the map beside it. Fragments here are written out of
 * order and often branch, so moving between them follows the declared `next`
 * and `prev` links rather than guessing an order from dates.
 */
export class Navigator {
	private minimap: Minimap;

	constructor(private plugin: LorePlugin) {
		this.minimap = new Minimap(this.plugin);
	}

	removeAll() {
		document.body.style.removeProperty(STATUS_BAR_OFFSET);
		this.statusBarHeight = null;
		for (const leaf of this.plugin.app.workspace.getLeavesOfType("markdown")) {
			const view = leaf.view;
			if (view instanceof MarkdownView) this.remove(view);
		}
	}

	/**
	 * Obsidian's status bar floats over the bottom-right of the workspace. Its
	 * width changes as the word count ticks up, so the bar is lifted clear of it
	 * by its height rather than given a right margin that would never stay right.
	 */
	private statusBarHeight: number | null = null;

	syncStatusBarOffset() {
		const statusBar = document.body.querySelector<HTMLElement>(".status-bar");
		const height = statusBar ? Math.round(statusBar.getBoundingClientRect().height) : 0;
		// Called on every focus change; the style is only written when it moved.
		if (height === this.statusBarHeight) return;
		this.statusBarHeight = height;
		document.body.style.setProperty(STATUS_BAR_OFFSET, `${height}px`);
	}

	private remove(view: MarkdownView) {
		view.contentEl.findAll(`.${BAR_CLASS}, .${MAP_CLASS}`).forEach((el) => el.remove());
		view.contentEl.removeClass(HOST_CLASS);
	}

	/** Files a note points at, in the order the author listed them. */
	targets(file: TFile, direction: "next" | "prev"): TFile[] {
		const frontmatter = this.plugin.app.metadataCache.getFileCache(file)?.frontmatter;
		if (!frontmatter) return [];
		return resolveTargets(this.plugin.app, frontmatter[direction], file.path);
	}

	render(view: MarkdownView) {
		this.remove(view);

		const file = view.file;
		if (!file) return;

		const frontmatter = this.plugin.app.metadataCache.getFileCache(file)?.frontmatter;

		// An archived draft is not part of the story's path; say so and point
		// back to the live version instead of offering next/prev from the past.
		if (frontmatter?.["version-of"]) {
			view.contentEl.addClass(HOST_CLASS);
			this.buildArchiveBar(view.contentEl, file, frontmatter);
			return;
		}

		const timeline = asString(frontmatter?.timeline).trim();
		if (!timeline) return;

		const prev = this.targets(file, "prev");
		const next = this.targets(file, "next");

		view.contentEl.addClass(HOST_CLASS);

		const mapEl = view.contentEl.createDiv({ cls: MAP_CLASS });
		applyLang(mapEl);
		this.syncMap(mapEl, file, null);

		const barEl = view.contentEl.createDiv({ cls: BAR_CLASS });
		applyLang(barEl);
		this.buildSide(barEl, file, mapEl, prev, "prev");
		this.buildContext(barEl, frontmatter, timeline);
		this.buildSide(barEl, file, mapEl, next, "next");
		this.buildPin(barEl, mapEl, file);
	}

	private buildSide(
		bar: HTMLElement,
		file: TFile,
		mapEl: HTMLElement,
		targets: TFile[],
		direction: "next" | "prev",
	) {
		const sideEl = bar.createDiv({ cls: `plc-navbar-side is-${direction}` });
		if (targets.length === 0) {
			// An empty `next` usually means the thread ends here, so nothing is
			// invented to fill the gap.
			sideEl.createSpan({
				cls: "plc-navbar-end",
				text: this.plugin.i18n.t(direction === "next" ? "nav.noNext" : "nav.noPrev"),
			});
			return;
		}

		for (const target of targets) {
			const button = sideEl.createEl("button", { cls: "plc-navbar-button" });

			if (direction === "prev") {
				const arrow = button.createSpan({ cls: "plc-navbar-arrow" });
				setIcon(arrow, "chevron-left");
			}
			button.createSpan({ cls: "plc-navbar-label", text: target.basename });
			if (direction === "next") {
				const arrow = button.createSpan({ cls: "plc-navbar-arrow" });
				setIcon(arrow, "chevron-right");
			}

			button.addEventListener("click", (event) => {
				const newTab = event.ctrlKey || event.metaKey;
				void this.plugin.app.workspace.getLeaf(newTab ? "tab" : false).openFile(target);
			});

			// Hovering previews the destination on the map before committing to it.
			button.addEventListener("mouseenter", () => {
				mapEl.addClass("is-peeking");
				this.syncMap(mapEl, file, target);
			});
			button.addEventListener("mouseleave", () => {
				mapEl.removeClass("is-peeking");
				this.syncMap(mapEl, file, null);
			});
		}
	}

	private buildArchiveBar(host: HTMLElement, file: TFile, frontmatter: Record<string, unknown>) {
		const t = (key: string, ...args: string[]) => this.plugin.i18n.t(key, ...args);
		const barEl = host.createDiv({ cls: `${BAR_CLASS} is-archive` });
		applyLang(barEl);

		const version = asString(frontmatter.version).trim();
		const name = asString(frontmatter["version-name"]).trim();
		const infoEl = barEl.createDiv({ cls: "plc-navbar-context" });
		const iconEl = infoEl.createSpan({ cls: "plc-navbar-arrow" });
		setIcon(iconEl, "archive");
		infoEl.createSpan({ text: ` ${t("nav.archived", version).trim()}${name ? ` · ${name}` : ""}` });

		const active = resolveTargets(this.plugin.app, frontmatter["version-of"], file.path)[0];
		if (!active) return;
		const button = barEl.createEl("button", { cls: "plc-navbar-button mod-cta" });
		button.createSpan({ cls: "plc-navbar-label", text: t("nav.goActive") });
		button.addEventListener("click", (event) => {
			const newTab = event.ctrlKey || event.metaKey;
			void this.plugin.app.workspace.getLeaf(newTab ? "tab" : false).openFile(active);
		});
	}

	private buildContext(bar: HTMLElement, frontmatter: Record<string, unknown> | undefined, timeline: string) {
		const flow = asString(frontmatter?.flow).trim();
		const contextEl = bar.createDiv({ cls: "plc-navbar-context" });
		contextEl.setText(flow ? `${timeline} › ${flow}` : timeline);
	}

	private buildPin(bar: HTMLElement, mapEl: HTMLElement, file: TFile) {
		const t = (key: string) => this.plugin.i18n.t(key);
		const actionsEl = bar.createDiv({ cls: "plc-navbar-actions" });

		const modeButton = actionsEl.createEl("button", {
			cls: "clickable-icon",
			attr: { "aria-label": t("nav.mode"), title: t("nav.mode") },
		});
		setIcon(modeButton, this.plugin.settings.minimapMode === "wide" ? "minimize-2" : "maximize-2");
		modeButton.addEventListener("click", () => {
			const next: MinimapMode = this.plugin.settings.minimapMode === "wide" ? "near" : "wide";
			this.plugin.settings.minimapMode = next;
			this.saveMapSetting();
		});

		const pinButton = actionsEl.createEl("button", {
			cls: `clickable-icon${this.plugin.settings.minimapPinned ? " is-active" : ""}`,
			attr: { "aria-label": t("nav.pin"), title: t("nav.pin") },
		});
		setIcon(pinButton, this.plugin.settings.minimapPinned ? "pin" : "pin-off");
		pinButton.addEventListener("click", () => {
			this.plugin.settings.minimapPinned = !this.plugin.settings.minimapPinned;
			this.saveMapSetting();
		});

		mapEl.toggleClass("is-pinned", this.plugin.settings.minimapPinned);
		void file;
	}

	/**
	 * A map preference touches only the bars under the notes: saved as is and
	 * redrawn there, without dropping caches or repainting every view.
	 */
	private saveMapSetting() {
		void this.plugin.saveData(this.plugin.settings);
		this.plugin.decorateNotes();
	}

	private syncMap(mapEl: HTMLElement, file: TFile, highlight: TFile | null) {
		this.minimap.render(mapEl, file, this.plugin.settings.minimapMode, highlight);
	}
}
