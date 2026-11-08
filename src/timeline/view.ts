import { ItemView, Menu, Notice, TFile, ViewStateResult, WorkspaceLeaf, getIcon, setIcon } from "obsidian";
import type LorePlugin from "../main";
import { VersionSetsModal } from "../modals/versionSets";
import { LaneEditModal } from "../modals/laneEdit";
import { NodeStatus, TimelineModel, TimelineDefinition, TimelineNode } from "./model";
import {
	EMPTY_FILTER,
	TimelineFilter,
	divergenceMoment,
	isFiltering,
	neighbour,
	nodeMatches,
	pruneFilter,
	searchMatches,
} from "./interaction";
import { asString } from "../frontmatter";
import {
	AXIS_HEIGHT,
	CANVAS_PADDING,
	LEFT_GUTTER,
	Lane,
	Layout,
	PlacedNode,
	autoPixelsPerUnit,
	computeLayout,
	laneAt,
	timeAt,
} from "./layout";
import { TimePrecision, isTimePrecision } from "../time";

export const VIEW_TYPE_TIMELINE = "plc-timeline";

const MIN_ZOOM = 0.2;
const MAX_ZOOM = 4;
const MIN_DENSITY = 0.1;
const MAX_DENSITY = 20;
/** Horizontal room a date label needs before the next one may be drawn. */
const MIN_LABEL_GAP = 64;
/** Pixels of travel before a press counts as a pan rather than a click. */
const DRAG_THRESHOLD = 4;
/** Times closer than this are the same moment (below shift-drag's 1e-6 step). */
const TIME_EPSILON = 1e-7;
/** How long a finger must rest on a note before it can be moved. */
const LONG_PRESS_MS = 400;

interface DragCompanion {
	entry: PlacedNode;
	group: SVGGElement;
}

interface NodeDrag {
	entry: PlacedNode;
	group: SVGGElement;
	/** Notes sharing this exact moment, carried along to keep them simultaneous. */
	companions: DragCompanion[];
	/** The axis column for the moment being moved, carried along with it. */
	tick: { el: TickEls; label: string } | null;
	guide: SVGLineElement | null;
	startX: number;
	startY: number;
	offsetX: number;
	offsetY: number;
	moved: boolean;
	/** Time the drop would land on, recomputed as the pointer moves. */
	time: number | null;
	lane: Lane | null;
	/** True while alt is held, leaving the companions where they are. */
	solo: boolean;
	cancelled: boolean;
}

/**
 * One moment on the axis. The grid line runs through the scene, the label sits
 * in the pinned axis strip; a drag moves both.
 */
interface TickEls {
	grid: SVGLineElement;
	label: SVGGElement;
}

/** Far enough to cover any canvas in the pinned strips' own direction. */
const STRIP_REACH = 100000;

const STATUSES: NodeStatus[] = ["draft", "partial", "done"];

/** Reads a saved filter back, dropping anything that is not a list of strings. */
function readFilter(value: unknown): TimelineFilter {
	const record = (typeof value === "object" && value !== null ? value : {}) as Record<string, unknown>;
	const strings = (entry: unknown) =>
		Array.isArray(entry) ? entry.filter((item): item is string => typeof item === "string") : [];
	return {
		statuses: strings(record.statuses).filter((status): status is NodeStatus =>
			STATUSES.includes(status as NodeStatus),
		),
		flows: strings(record.flows),
		types: strings(record.types),
	};
}

function toggled<T>(list: T[], value: T): T[] {
	return list.includes(value) ? list.filter((entry) => entry !== value) : [...list, value];
}

function svgEl<K extends keyof SVGElementTagNameMap>(
	tag: K,
	attrs: Record<string, string | number> = {},
): SVGElementTagNameMap[K] {
	const element = createSvg(tag);
	for (const [name, value] of Object.entries(attrs)) {
		element.setAttribute(name, String(value));
	}
	return element;
}

export class TimelineView extends ItemView {
	private model: TimelineModel;
	private timelineId: string | null = null;

	private zoom = 1;
	private panX = 0;
	private panY = 0;

	private toolbarEl!: HTMLElement;
	private canvasEl!: HTMLElement;
	private svg: SVGSVGElement | null = null;
	private sceneEl: SVGGElement | null = null;
	/** Lane names: follow vertical pan only, so they stay at the left edge. */
	private lanesLayerEl: SVGGElement | null = null;
	/** Time labels: follow horizontal pan only, so they stay at the top edge. */
	private axisLayerEl: SVGGElement | null = null;
	/** Covers the corner where the two pinned strips meet. */
	private cornerEl: SVGRectElement | null = null;
	/**
	 * Labels in the pinned strips. The strips never grow past their zoom-1 size,
	 * so these are placed by hand to stay level with the scene they describe.
	 */
	private pinnedEls: { el: SVGTextElement; axis: "x" | "y"; at: number }[] = [];
	private hintEl: HTMLElement | null = null;
	private layout: Layout | null = null;
	private redrawTimer: number | null = null;
	/** Set while a pan is in progress, so the trailing click is not treated as one. */
	private panned = false;
	private drag: NodeDrag | null = null;
	private nodeEls = new Map<string, SVGGElement>();
	private edgeEls: { from: string; to: string; el: SVGPathElement }[] = [];
	private tickEls = new Map<number, TickEls>();

	/** What the canvas is narrowed to; saved with the view, never with the notes. */
	private filter: TimelineFilter = { ...EMPTY_FILTER };
	/** Search text: transient, so a reopened timeline starts unfiltered by it. */
	private query = "";
	private matchIndex = -1;
	/** The rebuilt part of the toolbar; the search box lives outside it to keep focus. */
	private toolbarMainEl!: HTMLElement;
	private searchWrapEl!: HTMLElement;
	private searchEl!: HTMLInputElement;
	private counterEl!: HTMLElement;
	private filterButtonEl: HTMLButtonElement | null = null;
	/** Pending long press on a note under a finger; a drag starts only when it fires. */
	private longPressTimer: number | null = null;
	/** The note holding keyboard focus, so a redraw can hand it back. */
	private focusedPath: string | null = null;
	/** "Split from …" under the toolbar, for a parallel timeline. */
	private divergenceEl!: HTMLElement;
	/** When the shown timeline split from its parent, if that is known. */
	private divergenceTime: number | null = null;

	constructor(
		leaf: WorkspaceLeaf,
		private plugin: LorePlugin,
	) {
		super(leaf);
		this.model = new TimelineModel(this.app);
	}

	getViewType(): string {
		return VIEW_TYPE_TIMELINE;
	}

	getDisplayText(): string {
		return this.plugin.i18n.t("view.timeline");
	}

	getIcon(): string {
		return "git-branch";
	}

	async onOpen() {
		this.contentEl.addClass("plc-timeline-view");
		this.toolbarEl = this.contentEl.createDiv({ cls: "plc-timeline-toolbar" });
		this.toolbarMainEl = this.toolbarEl.createDiv({ cls: "plc-timeline-toolbar-main" });
		this.buildSearch();
		this.divergenceEl = this.contentEl.createDiv({ cls: "plc-timeline-divergence" });
		this.canvasEl = this.contentEl.createDiv({
			cls: "plc-timeline-canvas",
			attr: { tabindex: "0", "aria-label": this.plugin.i18n.t("timeline.keys") },
		});
		this.registerCanvasGestures();
		this.registerKeyboard();
		this.render();
	}

	/** Coalesces bursts of metadata events into a single redraw. */
	queueRender() {
		if (this.redrawTimer !== null) return;
		this.redrawTimer = window.setTimeout(() => {
			this.redrawTimer = null;
			// Redrawing mid-drag would pull the boxes out from under the pointer;
			// wait until the drop, which redraws anyway.
			if (this.drag) {
				this.queueRender();
				return;
			}
			this.render();
		}, 120);
	}

	/** Remembers the chosen timeline and the camera across restarts. */
	getState(): Record<string, unknown> {
		return {
			...super.getState(),
			timelineId: this.timelineId,
			zoom: this.zoom,
			panX: this.panX,
			panY: this.panY,
			filter: this.filter,
		};
	}

	async setState(state: unknown, result: ViewStateResult): Promise<void> {
		const saved = (state ?? {}) as Record<string, unknown>;
		if (typeof saved.timelineId === "string") this.timelineId = saved.timelineId;
		if (typeof saved.zoom === "number" && Number.isFinite(saved.zoom)) {
			this.zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, saved.zoom));
		}
		if (typeof saved.panX === "number" && Number.isFinite(saved.panX)) this.panX = saved.panX;
		if (typeof saved.panY === "number" && Number.isFinite(saved.panY)) this.panY = saved.panY;
		if (saved.filter !== undefined) this.filter = readFilter(saved.filter);

		await super.setState(state, result);
		// State can arrive after the view has already drawn its defaults.
		if (this.canvasEl) this.render();
	}

	render() {
		const definitions = this.model.definitions();
		const referenced = this.model.referencedTimelineIds();

		// A timeline can exist purely because notes point at it, before anyone has
		// written the note that describes it.
		const known = new Set(definitions.map((definition) => definition.id));
		const orphanIds = referenced.filter((id) => !known.has(id));

		if (this.timelineId && !known.has(this.timelineId) && !orphanIds.includes(this.timelineId)) {
			this.timelineId = null;
		}
		this.timelineId ??= definitions[0]?.id ?? orphanIds[0] ?? null;

		this.renderToolbar(definitions, orphanIds);
		this.renderDivergence(definitions);
		this.renderCanvas(definitions);
	}

	/**
	 * Where a parallel timeline left its parent: the parent's name (a click
	 * switches to it) and the note it split at. Shows whatever is known; an
	 * unknown parent or an untimed point just means less is said.
	 */
	private renderDivergence(definitions: TimelineDefinition[]) {
		const t = (key: string, ...args: string[]) => this.plugin.i18n.t(key, ...args);
		this.divergenceEl.empty();
		this.divergenceTime = null;

		const definition = definitions.find((entry) => entry.id === this.timelineId);
		this.divergenceEl.toggleClass("is-hidden", !definition?.divergesFrom);
		if (!definition?.divergesFrom) return;

		const parentId = this.model.resolveTimelineId(definition.divergesFrom, definition.file.path);
		const parent = definitions.find((entry) => entry.id === parentId);

		const [before, after] = t("timeline.divergedFrom", "\u0000").split("\u0000");
		this.divergenceEl.createSpan({ text: before });
		if (parent) {
			const link = this.divergenceEl.createEl("a", { text: parent.name, cls: "plc-divergence-parent" });
			link.addEventListener("click", (event) => {
				event.preventDefault();
				this.timelineId = parent.id;
				this.resetPan();
				this.render();
				this.app.workspace.requestSaveLayout();
			});
		} else {
			this.divergenceEl.createSpan({ text: definition.divergesFrom });
		}
		if (after) this.divergenceEl.createSpan({ text: after });

		if (!definition.divergencePoint) return;
		const pointFile = this.app.metadataCache.getFirstLinkpathDest(definition.divergencePoint, definition.file.path);
		const point = pointFile
			? this.model.graph(parentId).nodes.find((node) => node.path === pointFile.path)
			: undefined;
		this.divergenceTime = divergenceMoment(point);

		this.divergenceEl.createSpan({ text: " · " });
		const pointEl = this.divergenceEl.createEl(pointFile ? "a" : "span", {
			text: pointFile?.basename ?? definition.divergencePoint,
		});
		if (pointFile) {
			pointEl.addEventListener("click", (event) => {
				event.preventDefault();
				void this.app.workspace.getLeaf(false).openFile(pointFile);
			});
		}
		if (point && this.divergenceTime !== null) {
			const when = point.timeLabel || this.formatNodeTime(this.divergenceTime, point.precision);
			this.divergenceEl.createSpan({ cls: "plc-divergence-time", text: ` (${when})` });
		}
	}

	private renderToolbar(definitions: TimelineDefinition[], orphanIds: string[]) {
		this.toolbarMainEl.empty();
		const t = (key: string, ...args: string[]) => this.plugin.i18n.t(key, ...args);

		const empty = definitions.length === 0 && orphanIds.length === 0;
		this.searchWrapEl.toggleClass("is-hidden", empty);
		if (empty) return;

		const select = this.toolbarMainEl.createEl("select", { cls: "dropdown plc-timeline-select" });
		for (const definition of definitions) {
			const suffix = definition.kind === "parallel" ? ` · ${t("timeline.parallel")}` : "";
			select.createEl("option", { value: definition.id, text: `${definition.name}${suffix}` });
		}
		for (const id of orphanIds) {
			select.createEl("option", { value: id, text: `${id} · ${t("timeline.undefined")}` });
		}
		if (this.timelineId) select.value = this.timelineId;
		select.addEventListener("change", () => {
			this.timelineId = select.value;
			this.resetPan();
			this.render();
			this.app.workspace.requestSaveLayout();
		});

		const spacer = this.toolbarMainEl.createDiv({ cls: "plc-timeline-spacer" });
		spacer.setAttr("aria-hidden", "true");

		this.addToolbarButton("crosshair", t("timeline.showCurrent"), () => this.showActiveNote());
		this.filterButtonEl = this.addToolbarButton(
			"filter",
			t("timeline.filter"),
			(event) => this.openFilterMenu(event),
			isFiltering(this.filter, ""),
		);

		const locked = this.plugin.settings.timelineLocked;
		this.addToolbarButton(
			locked ? "lock" : "unlock",
			t(locked ? "timeline.unlock" : "timeline.lock"),
			() => void this.toggleLock(),
			locked,
		);

		this.addToolbarButton("layers", t("timeline.versions"), () =>
			new VersionSetsModal(this.app, this.plugin).open(),
		);

		// Spreading the time axis is a different wish from magnifying everything,
		// so density and zoom get separate controls.
		this.addToolbarButton("chevrons-left-right", t("timeline.wider"), () =>
			void this.applyDensity(this.plugin.settings.timeDensity * 1.35),
		);
		this.addToolbarButton("chevrons-right-left", t("timeline.narrower"), () =>
			void this.applyDensity(this.plugin.settings.timeDensity / 1.35),
		);

		this.addToolbarButton("zoom-out", t("timeline.zoomOut"), () => this.applyZoom(this.zoom / 1.25));
		this.addToolbarButton("zoom-in", t("timeline.zoomIn"), () => this.applyZoom(this.zoom * 1.25));
		this.addToolbarButton("maximize", t("timeline.fit"), () => this.fitToView());
	}

	private async toggleLock() {
		this.plugin.settings.timelineLocked = !this.plugin.settings.timelineLocked;
		await this.plugin.saveSettings();
		this.render();
	}

	private async applyDensity(next: number) {
		const clamped = Math.min(MAX_DENSITY, Math.max(MIN_DENSITY, next));
		if (clamped === this.plugin.settings.timeDensity) return;
		this.plugin.settings.timeDensity = clamped;
		await this.plugin.saveSettings();
		this.render();
	}

	private addToolbarButton(
		icon: string,
		label: string,
		onClick: (event: MouseEvent) => void,
		active = false,
	): HTMLButtonElement {
		const button = this.toolbarMainEl.createEl("button", {
			cls: `clickable-icon plc-timeline-button${active ? " is-active" : ""}`,
			attr: { "aria-label": label, title: label },
		});
		setIcon(button, icon);
		button.addEventListener("click", onClick);
		return button;
	}

	/**
	 * The search box is built once and kept out of the rebuilt toolbar, so an
	 * autosave redraw while typing does not steal the caret.
	 */
	private buildSearch() {
		const t = (key: string) => this.plugin.i18n.t(key);
		this.searchWrapEl = this.toolbarEl.createDiv({ cls: "plc-timeline-search" });
		this.searchEl = this.searchWrapEl.createEl("input", {
			type: "search",
			attr: { placeholder: t("timeline.search"), "aria-label": t("timeline.search") },
		});
		this.counterEl = this.searchWrapEl.createSpan({ cls: "plc-timeline-counter" });

		this.searchEl.addEventListener("input", () => {
			this.query = this.searchEl.value;
			this.matchIndex = -1;
			this.applyHighlight();
			this.stepMatch(1);
		});
		this.searchEl.addEventListener("keydown", (event) => {
			// Keys typed here belong to the box, not to the canvas shortcuts.
			event.stopPropagation();
			if (event.key === "Enter") {
				event.preventDefault();
				this.stepMatch(event.shiftKey ? -1 : 1);
			} else if (event.key === "Escape") {
				event.preventDefault();
				this.searchEl.value = "";
				this.query = "";
				this.matchIndex = -1;
				this.applyHighlight();
				this.canvasEl.focus();
			}
		});
	}

	/** Moves to the next (or previous) search hit and brings it into view. */
	private stepMatch(direction: 1 | -1) {
		const matches = this.layout ? searchMatches(this.layout.placed, this.query, this.filter) : [];
		if (matches.length === 0) {
			this.matchIndex = -1;
			this.updateCounter(matches.length);
			return;
		}
		this.matchIndex = (this.matchIndex + direction + matches.length) % matches.length;
		this.updateCounter(matches.length);
		const path = matches[this.matchIndex];
		for (const [nodePath, el] of this.nodeEls) el.toggleClass("is-current-match", nodePath === path);
		this.centreOn(path);
	}

	private updateCounter(total: number) {
		const hasQuery = this.query.trim().length > 0;
		this.counterEl.setText(
			hasQuery ? this.plugin.i18n.t("timeline.matches", String(this.matchIndex + 1), String(total)) : "",
		);
		this.counterEl.toggleClass("is-empty", hasQuery && total === 0);
	}

	/**
	 * Dims what the filter and search leave out. The layout never changes, so
	 * the shape of the story stays recognisable while narrowing it down.
	 */
	private applyHighlight() {
		if (!this.layout) return;
		const filtering = isFiltering(this.filter, this.query);
		const ordered = searchMatches(this.layout.placed, this.query, this.filter);
		const hits = new Set(ordered);
		const dimmed = new Set<string>();
		// A redraw keeps the current hit if it is still one; otherwise none is current.
		if (this.matchIndex >= ordered.length) this.matchIndex = ordered.length - 1;
		const current = this.matchIndex >= 0 ? ordered[this.matchIndex] : null;

		for (const entry of this.layout.placed) {
			const el = this.nodeEls.get(entry.node.path);
			if (!el) continue;
			const dim = filtering && !nodeMatches(entry.node, this.filter, this.query);
			if (dim) dimmed.add(entry.node.path);
			el.toggleClass("is-dimmed", dim);
			el.toggleClass("is-match", hits.has(entry.node.path));
			el.toggleClass("is-current-match", entry.node.path === current);
		}
		this.filterButtonEl?.toggleClass("is-active", isFiltering(this.filter, ""));
		for (const edge of this.edgeEls) {
			edge.el.toggleClass("is-dimmed", dimmed.has(edge.from) || dimmed.has(edge.to));
		}
		this.updateCounter(hits.size);
	}

	private openFilterMenu(event: MouseEvent) {
		const t = (key: string) => this.plugin.i18n.t(key);
		const layout = this.layout;
		if (!layout) return;
		const menu = new Menu();

		const heading = (key: string) =>
			menu.addItem((item) => item.setTitle(t(key)).setIsLabel(true));
		const option = (title: string, checked: boolean, toggle: () => void) =>
			menu.addItem((item) =>
				item
					.setTitle(title)
					.setChecked(checked)
					.onClick(() => {
						toggle();
						this.filterChanged();
					}),
			);

		heading("timeline.filter.status");
		for (const status of STATUSES) {
			option(t(`status.${status}`), this.filter.statuses.includes(status), () => {
				this.filter = { ...this.filter, statuses: toggled(this.filter.statuses, status) };
			});
		}

		menu.addSeparator();
		heading("timeline.filter.flow");
		for (const lane of layout.lanes.filter((entry) => !entry.untimed)) {
			option(lane.name, this.filter.flows.includes(lane.id), () => {
				this.filter = { ...this.filter, flows: toggled(this.filter.flows, lane.id) };
			});
		}

		const types = [...new Set(layout.placed.map((entry) => entry.node.type).filter((type) => type))].sort();
		if (types.length > 0) {
			menu.addSeparator();
			heading("timeline.filter.type");
			for (const type of types) {
				const definition = this.plugin.types.byId(type);
				const label = definition ? this.plugin.types.label(definition, this.plugin.language) : type;
				option(label, this.filter.types.includes(type), () => {
					this.filter = { ...this.filter, types: toggled(this.filter.types, type) };
				});
			}
		}

		if (isFiltering(this.filter, "")) {
			menu.addSeparator();
			menu.addItem((item) =>
				item
					.setTitle(t("timeline.filter.clear"))
					.setIcon("x")
					.onClick(() => {
						this.filter = { ...EMPTY_FILTER };
						this.filterChanged();
					}),
			);
		}

		// Anchored to the button, so a keyboard press does not open it at 0,0.
		const anchor = (event.currentTarget as HTMLElement | null)?.getBoundingClientRect();
		if (anchor) menu.showAtPosition({ x: anchor.left, y: anchor.bottom });
		else menu.showAtMouseEvent(event);
	}

	/** Only the highlight changes; the layout and the toolbar stay as they are. */
	private filterChanged() {
		this.matchIndex = -1;
		this.applyHighlight();
		this.app.workspace.requestSaveLayout();
	}

	/** Pans so a note sits in the middle of the canvas. */
	private centreOn(path: string) {
		const entry = this.layout?.placed.find((placed) => placed.node.path === path);
		if (!entry) return;
		const rect = this.canvasEl.getBoundingClientRect();
		if (rect.width === 0 || rect.height === 0) return;
		this.panX = rect.width / 2 - (entry.x + entry.width / 2) * this.zoom;
		this.panY = rect.height / 2 - (entry.y + entry.height / 2) * this.zoom;
		this.applyTransform();
	}

	/** The toolbar's crosshair: the note open in the editor, wherever it sits. */
	private showActiveNote() {
		const file = this.app.workspace.getActiveFile();
		if (!file || !this.showNote(file)) {
			new Notice(this.plugin.i18n.t("timeline.notOnTimeline"));
		}
	}

	/**
	 * Switches to the note's timeline, centres it and makes it pulse once.
	 * False when the note is not on any timeline.
	 */
	showNote(file: TFile): boolean {
		const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter;
		const timelineId = asString(frontmatter?.timeline).trim();
		if (!timelineId || frontmatter?.["version-of"]) return false;
		// Leave the current timeline alone unless the note will actually be drawn.
		if (!this.model.graph(timelineId).nodes.some((node) => node.path === file.path)) return false;

		if (timelineId !== this.timelineId) {
			this.timelineId = timelineId;
			this.render();
			this.app.workspace.requestSaveLayout();
		}
		this.centreOn(file.path);
		const el = this.nodeEls.get(file.path);
		if (!el) return false;
		el.addClass("is-pulse");
		window.setTimeout(() => el.removeClass("is-pulse"), 1200);
		return true;
	}

	private renderCanvas(definitions: TimelineDefinition[]) {
		// Emptying the canvas drops focus on the body; remember whether to restore it.
		const hadFocus = this.canvasEl.contains(document.activeElement) && document.activeElement !== this.canvasEl;
		// A long press under way belongs to a box that is about to be replaced.
		this.clearLongPress();
		this.canvasEl.empty();
		try {
			this.renderCanvasContent(definitions);
		} finally {
			if (hadFocus) this.restoreFocus();
		}
	}

	private restoreFocus() {
		const el = this.focusedPath ? this.nodeEls.get(this.focusedPath) : undefined;
		if (el) el.focus({ preventScroll: true });
		else this.canvasEl.focus({ preventScroll: true });
	}

	private renderCanvasContent(definitions: TimelineDefinition[]) {
		this.svg = null;
		this.sceneEl = null;
		this.lanesLayerEl = null;
		this.axisLayerEl = null;
		this.cornerEl = null;
		this.pinnedEls = [];
		this.layout = null;

		const t = (key: string, ...args: string[]) => this.plugin.i18n.t(key, ...args);

		if (!this.timelineId) {
			this.renderEmptyState(t("timeline.empty.title"), t("timeline.empty.body"));
			return;
		}

		const graph = this.model.graph(this.timelineId);
		if (graph.nodes.length === 0) {
			this.renderEmptyState(
				t("timeline.noNotes.title"),
				t("timeline.noNotes.body", this.timelineId),
			);
			return;
		}

		const definition = definitions.find((entry) => entry.id === this.timelineId);

		const times = graph.nodes
			.map((node) => node.time)
			.filter((time): time is number => time !== null);
		const span = times.length > 1 ? Math.max(...times) - Math.min(...times) : 0;

		this.layout = computeLayout(graph, {
			flows: definition?.flows ?? [],
			pixelsPerUnit: autoPixelsPerUnit(span) * this.plugin.settings.timeDensity,
			unnamedFlowLabel: t("timeline.unnamedFlow"),
			untimedLabel: t("timeline.untimed"),
			// A moment is labelled with the author's own wording when they gave it
			// one, since that reads better than anything derived from the number.
			formatTick: (value) => this.momentLabel(value, graph.nodes),
		});

		// Lane ids from another timeline would dim everything with nothing checked.
		const pruned = pruneFilter(
			this.filter,
			this.layout.lanes.filter((lane) => !lane.untimed).map((lane) => lane.id),
		);
		if (pruned !== this.filter) {
			this.filter = pruned;
			this.filterButtonEl?.toggleClass("is-active", isFiltering(this.filter, ""));
			this.app.workspace.requestSaveLayout();
		}

		this.drawSvg(this.layout);
	}

	private renderEmptyState(title: string, body: string) {
		const wrapper = this.canvasEl.createDiv({ cls: "plc-timeline-empty" });
		wrapper.createEl("h3", { text: title });
		wrapper.createEl("p", { text: body });
	}

	private drawSvg(layout: Layout) {
		const svg = svgEl("svg", { class: "plc-timeline-svg" });
		this.canvasEl.appendChild(svg);
		this.svg = svg;

		const defs = svgEl("defs");
		const marker = svgEl("marker", {
			id: "plc-arrow",
			viewBox: "0 0 10 10",
			refX: 9,
			refY: 5,
			markerWidth: 6,
			markerHeight: 6,
			orient: "auto-start-reverse",
		});
		marker.appendChild(svgEl("path", { d: "M 0 0 L 10 5 L 0 10 z", class: "plc-arrowhead" }));
		defs.appendChild(marker);
		svg.appendChild(defs);

		// Lane labels and the axis stay pinned while the scene pans underneath:
		// each strip follows the pan in one direction only.
		const scene = svgEl("g", { class: "plc-timeline-scene" });
		const axisLayer = svgEl("g", { class: "plc-pinned-axis" });
		const lanesLayer = svgEl("g", { class: "plc-pinned-lanes" });
		const corner = svgEl("rect", { class: "plc-pinned-corner", x: 0, y: 0 });
		svg.append(scene, axisLayer, lanesLayer, corner);
		this.sceneEl = scene;
		this.axisLayerEl = axisLayer;
		this.lanesLayerEl = lanesLayer;
		this.cornerEl = corner;

		this.drawLanes(scene, lanesLayer, layout);
		this.drawEdges(scene, layout);
		this.drawNodes(scene, layout);
		this.drawAxis(scene, axisLayer, layout);
		this.drawDivergenceMarker(scene, axisLayer, layout);

		this.applyTransform();
		this.applyHighlight();
	}

	private drawLanes(scene: SVGGElement, labels: SVGGElement, layout: Layout) {
		const group = svgEl("g", { class: "plc-lanes" });

		// The gutter is opaque so boxes panned to the left slide under the names.
		labels.appendChild(
			svgEl("rect", {
				x: 0,
				y: -STRIP_REACH,
				width: LEFT_GUTTER,
				height: STRIP_REACH * 2,
				class: "plc-pinned-strip",
			}),
		);

		for (const lane of layout.lanes) {
			group.appendChild(
				svgEl("rect", {
					x: 0,
					y: lane.y - 10,
					width: layout.width,
					height: lane.height + 20,
					class: `plc-lane-band${lane.untimed ? " is-untimed" : ""}`,
				}),
			);

			// The unassigned and untimed lanes are drawn by the plugin rather than
			// declared by the author, so there is nothing to rename.
			const editable = lane.id.length > 0 && !lane.untimed;

			const label = svgEl("text", {
				x: LEFT_GUTTER - 16,
				y: lane.y + lane.height / 2,
				class: `plc-lane-label${editable ? " is-editable" : ""}`,
				"text-anchor": "end",
				"dominant-baseline": "middle",
			});
			label.textContent = lane.name;

			if (editable) {
				const title = svgEl("title");
				title.textContent = this.plugin.i18n.t("lane.hint");
				label.appendChild(title);

				label.addEventListener("click", (event) => {
					event.stopPropagation();
					this.editLane(lane);
				});
				// A press on a name is a rename, not the start of a pan.
				label.addEventListener("pointerdown", (event) => event.stopPropagation());
			}

			labels.appendChild(label);
			this.pinnedEls.push({ el: label, axis: "y", at: lane.y + lane.height / 2 });
		}

		scene.appendChild(group);
	}

	private drawAxis(scene: SVGGElement, strip: SVGGElement, layout: Layout) {
		const grid = svgEl("g", { class: "plc-axis" });
		this.tickEls.clear();

		// The strip is opaque so boxes panned upwards slide under the dates.
		strip.appendChild(
			svgEl("rect", {
				x: -STRIP_REACH,
				y: 0,
				width: STRIP_REACH * 2,
				height: AXIS_HEIGHT,
				class: "plc-pinned-strip",
			}),
		);
		strip.appendChild(
			svgEl("line", {
				x1: -STRIP_REACH,
				y1: AXIS_HEIGHT,
				x2: STRIP_REACH,
				y2: AXIS_HEIGHT,
				class: "plc-axis-line",
			}),
		);

		// Moments can sit close enough that their labels would collide. The line
		// still marks every one; only the text gives way.
		let lastLabelX = Number.NEGATIVE_INFINITY;

		for (const tick of layout.ticks) {
			const line = svgEl("line", {
				x1: tick.x,
				y1: AXIS_HEIGHT,
				x2: tick.x,
				y2: layout.height,
				class: "plc-axis-grid",
			});
			grid.appendChild(line);

			const labelEl = svgEl("g", { class: "plc-tick" });
			if (tick.x - lastLabelX >= MIN_LABEL_GAP) {
				const label = svgEl("text", {
					x: tick.x,
					y: AXIS_HEIGHT - 10,
					class: "plc-axis-label",
					"text-anchor": "middle",
				});
				label.textContent = tick.label;
				labelEl.appendChild(label);
				this.pinnedEls.push({ el: label, axis: "x", at: tick.x });
				lastLabelX = tick.x;
			}
			strip.appendChild(labelEl);

			this.tickEls.set(tick.value, { grid: line, label: labelEl });
		}

		// Grid lines go under the lanes' boxes but over their bands.
		scene.insertBefore(grid, scene.querySelector(".plc-edges"));
	}

	/** A dashed line at the moment this timeline split off, when it falls on the canvas. */
	private drawDivergenceMarker(scene: SVGGElement, strip: SVGGElement, layout: Layout) {
		if (this.divergenceTime === null) return;
		const x = this.xForTime(layout, this.divergenceTime);
		if (x < LEFT_GUTTER || x > layout.width) return;

		// Under the boxes, like the grid, so it never covers or catches a note.
		scene.insertBefore(
			svgEl("line", { x1: x, y1: AXIS_HEIGHT, x2: x, y2: layout.height, class: "plc-divergence-line" }),
			scene.querySelector(".plc-edges"),
		);
		const label = svgEl("text", { x: x + 4, y: 12, class: "plc-divergence-label" });
		label.textContent = this.plugin.i18n.t("timeline.divergence");
		strip.appendChild(label);
		this.pinnedEls.push({ el: label, axis: "x", at: x + 4 });
	}

	/**
	 * Curved connectors rather than straight lines: when several threads converge
	 * on one moment the curves stay separable, and it matches how the author
	 * sketches these by hand.
	 */
	private drawEdges(scene: SVGGElement, layout: Layout) {
		const group = svgEl("g", { class: "plc-edges" });
		const byPath = new Map(layout.placed.map((entry) => [entry.node.path, entry]));
		this.edgeEls = [];

		for (const edge of layout.edges) {
			const from = byPath.get(edge.from);
			const to = byPath.get(edge.to);
			if (!from || !to) continue;

			const x1 = from.x + from.width;
			const y1 = from.y + from.height / 2;
			const x2 = to.x;
			const y2 = to.y + to.height / 2;
			const reach = Math.max(40, Math.abs(x2 - x1) * 0.45);

			const path = svgEl("path", {
				d: `M ${x1} ${y1} C ${x1 + reach} ${y1}, ${x2 - reach} ${y2}, ${x2} ${y2}`,
				class: "plc-edge",
				"marker-end": "url(#plc-arrow)",
			});
			this.edgeEls.push({ from: edge.from, to: edge.to, el: path });
			group.appendChild(path);
		}

		scene.appendChild(group);
	}

	private drawNodes(scene: SVGGElement, layout: Layout) {
		const group = svgEl("g", { class: "plc-nodes" });
		this.nodeEls.clear();

		for (const entry of layout.placed) {
			const nodeEl = this.drawNode(entry);
			this.nodeEls.set(entry.node.path, nodeEl);
			group.appendChild(nodeEl);
		}

		scene.appendChild(group);
	}

	private drawNode(entry: PlacedNode): SVGGElement {
		const { node } = entry;
		const t = (key: string, ...args: string[]) => this.plugin.i18n.t(key, ...args);

		const group = svgEl("g", {
			class: `plc-node is-${node.status}${node.uncertain ? " is-uncertain" : ""}`,
			transform: `translate(${entry.x}, ${entry.y})`,
			tabindex: 0,
			role: "button",
			"data-path": node.path,
		});

		group.appendChild(
			svgEl("rect", {
				width: entry.width,
				height: entry.height,
				rx: 6,
				ry: 6,
				class: "plc-node-box",
			}),
		);

		let textX = 12;
		// A lucide name that does not exist draws nothing rather than failing.
		const lucide = node.icon && node.iconType === "lucide" ? getIcon(node.icon) : null;
		if (lucide) {
			lucide.setAttribute("x", String(textX));
			lucide.setAttribute("y", String((entry.height - 16) / 2));
			lucide.setAttribute("width", "16");
			lucide.setAttribute("height", "16");
			// Obsidian's own icon class would resize it past the box.
			lucide.removeClass("svg-icon");
			lucide.addClass("plc-node-lucide");
			group.appendChild(lucide);
			textX += 20;
		} else if (node.icon && node.iconType === "emoji") {
			const iconEl = svgEl("text", {
				x: textX,
				y: entry.height / 2,
				class: "plc-node-icon",
				"dominant-baseline": "middle",
			});
			iconEl.textContent = node.icon;
			group.appendChild(iconEl);
			textX += 20;
		}

		const label = svgEl("text", {
			x: textX,
			y: entry.height / 2,
			class: "plc-node-title",
			"dominant-baseline": "middle",
		});
		label.textContent = node.title;
		group.appendChild(label);

		// A small mark on fragments that have alternatives, so which parts of the
		// story are still being argued with is visible without opening anything.
		const versioned = this.plugin.versions.hasMultiple(node.file);
		if (versioned) {
			group.appendChild(
				svgEl("circle", {
					cx: entry.width - 9,
					cy: 9,
					r: 3.5,
					class: "plc-node-versions",
				}),
			);
		}

		const timeText =
			node.timeLabel || (node.time === null ? t("timeline.untimed") : this.formatNodeTime(node.time, node.precision));
		const lines = [node.title, timeText, t(`status.${node.status}`), versioned ? t("timeline.hasVersions") : ""].filter(
			(line) => line.length > 0,
		);
		const title = svgEl("title");
		title.textContent = lines.join("\n");
		group.appendChild(title);
		group.setAttribute("aria-label", lines.join(", "));

		group.addEventListener("click", (event) => {
			// Releasing a pan or a reposition over a node should not open it.
			if (this.panned) return;
			event.stopPropagation();
			void this.openNode(node.file, event);
		});

		if (!this.plugin.settings.timelineLocked) {
			group.addClass("is-draggable");
			group.addEventListener("pointerdown", (event) => {
				if (event.button !== 0) return;
				if (event.pointerType === "touch") {
					// A finger swiping across a crowded canvas nearly always starts
					// on a box. It pans; only holding still first picks the note up.
					this.clearLongPress();
					this.longPressTimer = window.setTimeout(() => {
						this.longPressTimer = null;
						if (this.panned || this.drag) return;
						this.beginDrag(entry, group, event);
					}, LONG_PRESS_MS);
					return;
				}
				// Claim the gesture so the canvas does not start panning instead.
				event.stopPropagation();
				this.beginDrag(entry, group, event);
			});
		}

		return group;
	}

	/** Opens the rename dialog for a lane, gathering the notes it holds first. */
	private editLane(lane: Lane) {
		const definition = this.model.definitions().find((entry) => entry.id === this.timelineId);
		if (!definition) {
			new Notice(this.plugin.i18n.t("lane.noTimelineNote"));
			return;
		}

		const members = (this.layout?.placed ?? [])
			.filter((entry) => entry.node.flow === lane.id)
			.map((entry) => entry.node.file);

		new LaneEditModal(
			this.app,
			this.plugin,
			definition.file,
			{ id: lane.id, name: lane.name },
			members,
			() => this.render(),
		).open();
	}

	private async openNode(file: TFile, event: MouseEvent | KeyboardEvent) {
		const newTab = event.ctrlKey || event.metaKey;
		await this.app.workspace.getLeaf(newTab ? "tab" : false).openFile(file);
	}

	/** Converts a pointer position into canvas coordinates. */
	private toScene(clientX: number, clientY: number): { x: number; y: number } {
		const rect = this.canvasEl.getBoundingClientRect();
		return {
			x: (clientX - rect.left - this.panX) / this.zoom,
			y: (clientY - rect.top - this.panY) / this.zoom,
		};
	}

	/**
	 * How far apart two droppable times are. Without this a drag produces values
	 * like 1963.4471, which is never what anyone meant by moving a box.
	 */
	private snapStep(entry: PlacedNode): number {
		const frontmatter = this.app.metadataCache.getFileCache(entry.node.file)?.frontmatter;
		const precision: unknown = frontmatter?.["time-precision"];
		const days = this.plugin.universe.readTime().timeDays || 365;

		if (precision === "date") return 1 / days;
		if (precision === "datetime") return 1 / (days * 24);
		return 1;
	}

	/**
	 * Notes that happen at the same instant. Moving one without the others would
	 * quietly break the simultaneity the author established, so they travel
	 * together unless alt says otherwise.
	 */
	private companionsOf(entry: PlacedNode): DragCompanion[] {
		const layout = this.layout;
		if (!layout || entry.node.time === null) return [];

		const companions: DragCompanion[] = [];
		for (const other of layout.placed) {
			if (other.node.path === entry.node.path) continue;
			if (other.node.time !== entry.node.time) continue;

			const group = this.nodeEls.get(other.node.path);
			if (group) companions.push({ entry: other, group });
		}
		return companions;
	}

	private beginDrag(entry: PlacedNode, group: SVGGElement, event: PointerEvent) {
		const point = this.toScene(event.clientX, event.clientY);

		const tickEl = entry.node.time === null ? undefined : this.tickEls.get(entry.node.time);

		this.drag = {
			entry,
			group,
			companions: this.companionsOf(entry),
			tick: tickEl
				? { el: tickEl, label: tickEl.label.querySelector("text")?.textContent ?? "" }
				: null,
			guide: null,
			startX: event.clientX,
			startY: event.clientY,
			offsetX: point.x - entry.x,
			offsetY: point.y - entry.y,
			moved: false,
			time: entry.node.time,
			lane: null,
			solo: false,
			cancelled: false,
		};
	}

	private updateDrag(event: PointerEvent) {
		const drag = this.drag;
		const layout = this.layout;
		if (!drag || !layout) return;

		if (!drag.moved) {
			const travelled = Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY);
			if (travelled < DRAG_THRESHOLD) return;
			drag.moved = true;
			this.panned = true;
			drag.group.addClass("is-dragging");
			drag.guide = this.createGuide();
		}

		const point = this.toScene(event.clientX, event.clientY);
		const y = point.y - drag.offsetY;

		drag.lane = laneAt(layout, y + drag.entry.height / 2);
		drag.solo = event.altKey;

		// Dropping into the untimed lane would mean erasing a date, which is a
		// destructive edit disguised as a nudge; the time picker does that
		// explicitly instead.
		const intoUntimed = drag.lane?.untimed === true;
		const rawX = point.x - drag.offsetX;
		drag.time = intoUntimed ? null : this.snapTime(timeAt(layout, rawX), drag.entry, event.shiftKey);

		// Snap the drawing to the time it would actually land on, so what you see
		// is the value that gets written.
		const snappedX =
			drag.time === null ? rawX : this.xForTime(layout, drag.time);
		const deltaX = snappedX - drag.entry.x;

		drag.group.setAttribute("transform", `translate(${snappedX}, ${y})`);
		for (const companion of drag.companions) {
			const offset = drag.solo || intoUntimed ? 0 : deltaX;
			companion.group.setAttribute(
				"transform",
				`translate(${companion.entry.x + offset}, ${companion.entry.y})`,
			);
			companion.group.toggleClass("is-following", offset !== 0);
		}

		this.updateGuide(drag, snappedX);
		this.moveTick(drag, deltaX, intoUntimed);
		this.showDragHint(drag, event, intoUntimed);
	}

	/**
	 * The axis marks moments, so the date column belongs to the events standing
	 * in it and travels with them while they are being moved.
	 */
	private moveTick(drag: NodeDrag, deltaX: number, intoUntimed: boolean) {
		const tick = drag.tick;
		if (!tick) return;

		// With alt held only one event leaves the moment, so the moment stays put.
		const follows = !drag.solo && !intoUntimed;
		const shift = follows ? `translate(${deltaX}, 0)` : "translate(0, 0)";
		// The axis strip has its own scale, so the label travels in its units.
		const stripShift = follows ? `translate(${deltaX * this.pinnedRatio()}, 0)` : "translate(0, 0)";
		tick.el.label.setAttribute("transform", stripShift);
		tick.el.grid.setAttribute("transform", shift);
		tick.el.grid.toggleClass("is-moving", follows && deltaX !== 0);

		const label = tick.el.label.querySelector("text");
		if (!label) return;

		label.textContent =
			follows && drag.time !== null
				? this.formatNodeTime(drag.time, drag.entry.node.precision)
				: tick.label;
	}

	private momentLabel(value: number, nodes: TimelineNode[]): string {
		const atMoment = nodes.filter((node) => node.time === value);
		const named = atMoment.find((node) => node.timeLabel.length > 0);
		if (named) return named.timeLabel;
		return this.formatNodeTime(value, atMoment[0]?.precision ?? "year");
	}

	private formatNodeTime(value: number, precision: TimePrecision): string {
		return this.plugin.universe.formatTime(value, precision, this.plugin.language);
	}

	private xForTime(layout: Layout, time: number): number {
		return LEFT_GUTTER + CANVAS_PADDING + (time - layout.minTime) * layout.pixelsPerUnit;
	}

	/** A vertical line marking the moment the drag would land on. */
	private createGuide(): SVGLineElement | null {
		const layout = this.layout;
		if (!this.sceneEl || !layout) return null;

		const guide = svgEl("line", {
			class: "plc-drag-guide",
			x1: 0,
			y1: AXIS_HEIGHT,
			x2: 0,
			y2: layout.height,
		});
		this.sceneEl.appendChild(guide);
		return guide;
	}

	private updateGuide(drag: NodeDrag, x: number) {
		if (!drag.guide) return;
		const visible = drag.time !== null;
		drag.guide.setAttribute("x1", String(x));
		drag.guide.setAttribute("x2", String(x));
		drag.guide.toggleClass("is-hidden", !visible);
	}

	private snapTime(raw: number, entry: PlacedNode, fine: boolean): number {
		if (fine) return Number.parseFloat(raw.toFixed(6));
		const step = this.snapStep(entry);
		// Trim float noise from the multiplication so stored values stay clean.
		return Number.parseFloat((Math.round(raw / step) * step).toFixed(8));
	}

	private showDragHint(drag: NodeDrag, event: PointerEvent, intoUntimed: boolean) {
		const t = (key: string, ...args: string[]) => this.plugin.i18n.t(key, ...args);
		this.hintEl ??= this.canvasEl.createDiv({ cls: "plc-drag-hint" });

		const parts: string[] = [];

		if (intoUntimed) {
			parts.push(t("timeline.drag.blocked"));
		} else if (drag.time !== null) {
			parts.push(this.formatNodeTime(drag.time, drag.entry.node.precision));
		}
		if (drag.lane && !drag.lane.untimed && drag.lane.id !== drag.entry.node.flow) {
			parts.push(`→ ${drag.lane.name}`);
		}
		if (drag.companions.length > 0 && !intoUntimed) {
			parts.push(
				drag.solo
					? t("timeline.drag.solo")
					: t("timeline.drag.together", String(drag.companions.length + 1)),
			);
		}

		this.hintEl.setText(parts.join("  ·  "));
		this.hintEl.toggleClass("is-blocked", intoUntimed);

		const rect = this.canvasEl.getBoundingClientRect();
		this.hintEl.style.left = `${event.clientX - rect.left + 14}px`;
		this.hintEl.style.top = `${event.clientY - rect.top + 14}px`;
	}

	private clearDragHint() {
		this.hintEl?.remove();
		this.hintEl = null;
	}

	private async finishDrag() {
		const drag = this.drag;
		this.drag = null;
		this.clearDragHint();

		if (!drag) return;
		drag.group.removeClass("is-dragging");
		drag.guide?.remove();

		if (!drag.moved || drag.cancelled || drag.time === null) {
			// Nothing committed, so put the boxes back where the layout had them.
			this.render();
			return;
		}

		const time = drag.time;
		const flow = drag.lane && !drag.lane.untimed ? drag.lane.id : drag.entry.node.flow;
		const previous = drag.entry.node.time;
		// A drop on the same snapped moment is not a move; comparing with a
		// tolerance keeps float noise from wiping the author's time label.
		const timeChanged = previous === null || Math.abs(time - previous) > TIME_EPSILON;
		const flowChanged = flow !== drag.entry.node.flow;

		if (!timeChanged && !flowChanged) {
			this.render();
			return;
		}

		try {
			await this.writeTime(drag.entry.node.file, timeChanged ? time : null, flowChanged ? flow : null);

			// Companions keep their own lanes; only the moment they share moves.
			if (timeChanged && !drag.solo) {
				for (const companion of drag.companions) {
					await this.writeTime(companion.entry.node.file, time, null);
				}
			}
		} catch (error) {
			console.error("Lore Creator: could not move the note", error);
			this.render();
		}
	}

	private async writeTime(file: TFile, time: number | null, flow: string | null) {
		await this.app.fileManager.processFrontMatter(file, (frontmatter: Record<string, unknown>) => {
			if (time !== null) {
				frontmatter.time = time;
				if (!isTimePrecision(frontmatter["time-precision"])) {
					frontmatter["time-precision"] = "year";
				}
				// A label written for the old date would now be a lie, and the
				// author's own wording is better lost than left wrong.
				delete frontmatter["time-label"];
			}
			if (flow !== null) frontmatter.flow = flow;
		});
	}

	private clearLongPress() {
		if (this.longPressTimer !== null) window.clearTimeout(this.longPressTimer);
		this.longPressTimer = null;
	}

	private cancelDrag() {
		if (!this.drag) return;
		this.drag.cancelled = true;
		void this.finishDrag();
	}

	private registerCanvasGestures() {
		let pressed = false;
		let startX = 0;
		let startY = 0;
		let originX = 0;
		let originY = 0;

		// Two fingers on the canvas: pinch to zoom, move both to pan.
		const pointers = new Map<number, { x: number; y: number }>();
		let pinch: { distance: number; zoom: number; midX: number; midY: number } | null = null;

		const pinchFrame = () => {
			const [a, b] = [...pointers.values()];
			const rect = this.canvasEl.getBoundingClientRect();
			return {
				distance: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)),
				midX: (a.x + b.x) / 2 - rect.left,
				midY: (a.y + b.y) / 2 - rect.top,
			};
		};

		/** Starts (or restarts, after a third finger lifts) a pinch from the current pair. */
		const baseline = () => {
			const frame = pinchFrame();
			pinch = { distance: frame.distance, zoom: this.zoom, midX: frame.midX, midY: frame.midY };
		};

		// Capture phase: the second finger must be seen before a node claims it
		// as the start of a drag. Only fingers count — a mouse never pinches, and
		// a mouse release outside the window must not leave a ghost finger behind.
		this.registerDomEvent(
			this.canvasEl,
			"pointerdown",
			(event) => {
				if (event.pointerType !== "touch") return;
				pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
				if (pointers.size < 2) return;
				event.stopPropagation();
				this.clearLongPress();
				this.cancelDrag();
				pressed = false;
				this.panned = true;
				if (pointers.size === 2) baseline();
			},
			{ capture: true },
		);

		const releasePointer = (event: PointerEvent) => {
			if (!pointers.delete(event.pointerId) || !pinch) return;
			if (pointers.size === 2) {
				baseline();
				return;
			}
			if (pointers.size < 2) {
				pinch = null;
				// The finger still down carries on panning from where it is, with no
				// jump. `panned` stays set, so lifting it later is not a tap.
				const rest = [...pointers.values()][0];
				if (rest) {
					pressed = true;
					startX = rest.x;
					startY = rest.y;
					originX = rest.x - this.panX;
					originY = rest.y - this.panY;
				}
			}
		};
		this.registerDomEvent(window, "pointercancel", (event) => {
			this.clearLongPress();
			releasePointer(event);
			if (this.drag) this.cancelDrag();
			pressed = false;
			this.canvasEl.removeClass("is-panning");
		});

		this.registerDomEvent(this.canvasEl, "pointerdown", (event) => {
			if (event.button !== 0) return;
			pressed = true;
			this.panned = false;
			startX = event.clientX;
			startY = event.clientY;
			originX = event.clientX - this.panX;
			originY = event.clientY - this.panY;
		});

		// Tracked on the window so a drag that leaves the canvas still ends
		// cleanly. Pointer capture would do this too, but it also retargets the
		// click that follows, which would swallow every click on a node.
		this.registerDomEvent(window, "pointermove", (event) => {
			if (pointers.has(event.pointerId)) pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
			if (pinch && pointers.size === 2) {
				const frame = pinchFrame();
				// Pan by the midpoint's travel, then zoom about the new midpoint.
				this.panX += frame.midX - pinch.midX;
				this.panY += frame.midY - pinch.midY;
				pinch.midX = frame.midX;
				pinch.midY = frame.midY;
				this.applyZoom(pinch.zoom * (frame.distance / pinch.distance), frame.midX, frame.midY);
				this.applyTransform();
				return;
			}
			if (this.drag) {
				this.updateDrag(event);
				return;
			}
			if (!pressed) return;

			if (!this.panned) {
				const travelled = Math.hypot(event.clientX - startX, event.clientY - startY);
				if (travelled < DRAG_THRESHOLD) return;
				this.panned = true;
				this.clearLongPress(); // a finger that moves is panning, not picking up
				this.canvasEl.addClass("is-panning");
			}

			this.panX = event.clientX - originX;
			this.panY = event.clientY - originY;
			this.applyTransform();
		});

		this.registerDomEvent(window, "pointerup", (event) => {
			this.clearLongPress();
			const wasPinching = pinch !== null;
			releasePointer(event);
			if (wasPinching) return;
			if (this.drag) {
				// A touch drag began as a pan press; that press is over too.
				pressed = false;
				this.canvasEl.removeClass("is-panning");
				void this.finishDrag();
				window.setTimeout(() => (this.panned = false), 0);
				return;
			}
			if (!pressed) return;
			pressed = false;
			this.canvasEl.removeClass("is-panning");
			// `panned` stays set until the click that follows has been ignored.
			if (this.panned) window.setTimeout(() => (this.panned = false), 0);
		});

		this.registerDomEvent(window, "keydown", (event) => {
			if (event.key === "Escape" && this.drag) this.cancelDrag();
		});

		this.registerDomEvent(this.canvasEl, "wheel", (event) => {
			event.preventDefault();
			const rect = this.canvasEl.getBoundingClientRect();
			const pointerX = event.clientX - rect.left;
			const pointerY = event.clientY - rect.top;
			const factor = event.deltaY < 0 ? 1.12 : 1 / 1.12;
			this.applyZoom(this.zoom * factor, pointerX, pointerY);
		});
	}

	/**
	 * Keys on the canvas: Tab reaches the notes, arrows walk between them,
	 * Enter opens one, + − 0 zoom and fit, / jumps to the search box.
	 */
	private registerKeyboard() {
		this.registerDomEvent(this.canvasEl, "focusin", (event) => {
			const path = (event.target as Element | null)?.closest?.("[data-path]")?.getAttribute("data-path");
			if (path) this.focusedPath = path;
		});

		this.registerDomEvent(this.canvasEl, "keydown", (event) => {
			// Leave app shortcuts alone (Ctrl/Cmd +, −, 0 zoom Obsidian itself).
			if ((event.ctrlKey || event.metaKey || event.altKey) && event.key !== "Enter") return;
			const path = (event.target as Element | null)?.closest?.("[data-path]")?.getAttribute("data-path") ?? null;

			const arrows: Record<string, "left" | "right" | "up" | "down"> = {
				ArrowLeft: "left",
				ArrowRight: "right",
				ArrowUp: "up",
				ArrowDown: "down",
			};

			if (path && arrows[event.key] && this.layout) {
				event.preventDefault();
				const next = neighbour(this.layout, path, arrows[event.key]);
				if (next) this.focusNode(next);
				return;
			}
			if (path && (event.key === "Enter" || event.key === " ")) {
				event.preventDefault();
				const entry = this.layout?.placed.find((placed) => placed.node.path === path);
				if (entry) void this.openNode(entry.node.file, event);
				return;
			}
			if (!path && arrows[event.key] && this.layout && this.layout.placed.length > 0) {
				// From the empty canvas, the first arrow press lands on the first note.
				event.preventDefault();
				const first = [...this.layout.placed].sort((a, b) => a.y - b.y || a.x - b.x)[0];
				this.focusNode(first.node.path);
				return;
			}

			switch (event.key) {
				case "+":
				case "=":
					event.preventDefault();
					this.applyZoom(this.zoom * 1.25);
					break;
				case "-":
				case "_":
					event.preventDefault();
					this.applyZoom(this.zoom / 1.25);
					break;
				case "0":
					event.preventDefault();
					this.fitToView();
					break;
				case "/":
					event.preventDefault();
					this.searchEl.focus();
					this.searchEl.select();
					break;
			}
		});
	}

	private focusNode(path: string) {
		const el = this.nodeEls.get(path);
		if (!el) return;
		this.focusedPath = path;
		el.focus({ preventScroll: true });
		this.ensureVisible(path);
	}

	/** Pans just enough to bring a note out from under the edges and pinned strips. */
	private ensureVisible(path: string) {
		const entry = this.layout?.placed.find((placed) => placed.node.path === path);
		if (!entry) return;
		const rect = this.canvasEl.getBoundingClientRect();
		const margin = 24;
		const left = LEFT_GUTTER * this.stripScale() + margin;
		const top = AXIS_HEIGHT * this.stripScale() + margin;
		const x1 = this.panX + entry.x * this.zoom;
		const y1 = this.panY + entry.y * this.zoom;
		const x2 = x1 + entry.width * this.zoom;
		const y2 = y1 + entry.height * this.zoom;

		if (x1 < left) this.panX += left - x1;
		else if (x2 > rect.width - margin) this.panX -= x2 - (rect.width - margin);
		if (y1 < top) this.panY += top - y1;
		else if (y2 > rect.height - margin) this.panY -= y2 - (rect.height - margin);
		this.applyTransform();
	}

	/** Zooms about a point so the content under the cursor stays put. */
	private applyZoom(nextZoom: number, anchorX?: number, anchorY?: number) {
		const clamped = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, nextZoom));
		if (clamped === this.zoom) return;

		const rect = this.canvasEl.getBoundingClientRect();
		const focusX = anchorX ?? rect.width / 2;
		const focusY = anchorY ?? rect.height / 2;

		const ratio = clamped / this.zoom;
		this.panX = focusX - (focusX - this.panX) * ratio;
		this.panY = focusY - (focusY - this.panY) * ratio;
		this.zoom = clamped;
		this.applyTransform();
	}

	private resetPan() {
		this.zoom = 1;
		this.panX = 0;
		this.panY = 0;
	}

	private fitToView() {
		if (!this.layout) return;
		const rect = this.canvasEl.getBoundingClientRect();
		if (rect.width === 0 || rect.height === 0) return;

		const scaleX = rect.width / (this.layout.width + 40);
		const scaleY = rect.height / (this.layout.height + 40);
		this.zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.min(scaleX, scaleY)));
		this.panX = 20;
		this.panY = 20;
		this.applyTransform();
	}

	/**
	 * Scale of the pinned strips: they shrink with the scene when zooming out,
	 * but never grow past their normal size, so zooming in does not let the
	 * gutter and the date band eat the canvas.
	 */
	private stripScale(): number {
		return Math.min(this.zoom, 1);
	}

	/** Scene units to strip units, for placing a pinned label level with the scene. */
	private pinnedRatio(): number {
		return this.zoom / this.stripScale();
	}

	private applyTransform() {
		const strip = this.stripScale();
		const ratio = this.pinnedRatio();
		this.sceneEl?.setAttribute(
			"transform",
			`translate(${this.panX}, ${this.panY}) scale(${this.zoom})`,
		);
		this.axisLayerEl?.setAttribute("transform", `translate(${this.panX}, 0) scale(${strip})`);
		this.lanesLayerEl?.setAttribute("transform", `translate(0, ${this.panY}) scale(${strip})`);
		for (const pinned of this.pinnedEls) pinned.el.setAttribute(pinned.axis, String(pinned.at * ratio));
		this.cornerEl?.setAttribute("width", String(LEFT_GUTTER * strip));
		this.cornerEl?.setAttribute("height", String(AXIS_HEIGHT * strip));
		// Obsidian debounces this itself, so calling it on every pan step is fine.
		this.app.workspace.requestSaveLayout();
	}

	async onClose() {
		this.clearLongPress();
		if (this.redrawTimer !== null) window.clearTimeout(this.redrawTimer);
		this.redrawTimer = null;
		this.contentEl.empty();
	}
}
