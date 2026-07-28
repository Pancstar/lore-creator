import { ItemView, TFile, WorkspaceLeaf, setIcon } from "obsidian";
import type LorePlugin from "../main";
import { VersionSetsModal } from "../modals/versionSets";
import { TimelineModel, TimelineDefinition } from "./model";
import {
	AXIS_HEIGHT,
	LEFT_GUTTER,
	Lane,
	Layout,
	PlacedNode,
	autoPixelsPerUnit,
	computeLayout,
	laneAt,
	timeAt,
} from "./layout";
import { isTimePrecision } from "../time";

export const VIEW_TYPE_TIMELINE = "plc-timeline";

const SVG_NS = "http://www.w3.org/2000/svg";
const MIN_ZOOM = 0.2;
const MAX_ZOOM = 4;
const MIN_DENSITY = 0.1;
const MAX_DENSITY = 20;
/** Pixels of travel before a press counts as a pan rather than a click. */
const DRAG_THRESHOLD = 4;

interface NodeDrag {
	entry: PlacedNode;
	group: SVGGElement;
	startX: number;
	startY: number;
	offsetX: number;
	offsetY: number;
	moved: boolean;
	/** Time the drop would land on, recomputed as the pointer moves. */
	time: number | null;
	lane: Lane | null;
	cancelled: boolean;
}

function svgEl<K extends keyof SVGElementTagNameMap>(
	tag: K,
	attrs: Record<string, string | number> = {},
): SVGElementTagNameMap[K] {
	const element = document.createElementNS(SVG_NS, tag);
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
	private hintEl: HTMLElement | null = null;
	private layout: Layout | null = null;
	private redrawQueued = false;
	/** Set while a pan is in progress, so the trailing click is not treated as one. */
	private panned = false;
	private drag: NodeDrag | null = null;

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
		this.canvasEl = this.contentEl.createDiv({ cls: "plc-timeline-canvas" });
		this.registerCanvasGestures();
		this.render();
	}

	/** Coalesces bursts of metadata events into a single redraw. */
	queueRender() {
		if (this.redrawQueued) return;
		this.redrawQueued = true;
		window.setTimeout(() => {
			this.redrawQueued = false;
			this.render();
		}, 120);
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
		this.renderCanvas(definitions);
	}

	private renderToolbar(definitions: TimelineDefinition[], orphanIds: string[]) {
		this.toolbarEl.empty();
		const t = (key: string, ...args: string[]) => this.plugin.i18n.t(key, ...args);

		if (definitions.length === 0 && orphanIds.length === 0) return;

		const select = this.toolbarEl.createEl("select", { cls: "dropdown plc-timeline-select" });
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
		});

		const spacer = this.toolbarEl.createDiv({ cls: "plc-timeline-spacer" });
		spacer.setAttr("aria-hidden", "true");

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

	private addToolbarButton(icon: string, label: string, onClick: () => void, active = false) {
		const button = this.toolbarEl.createEl("button", {
			cls: `clickable-icon plc-timeline-button${active ? " is-active" : ""}`,
			attr: { "aria-label": label, title: label },
		});
		setIcon(button, icon);
		button.addEventListener("click", onClick);
	}

	private renderCanvas(definitions: TimelineDefinition[]) {
		this.canvasEl.empty();
		this.svg = null;
		this.sceneEl = null;
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
		const calendar = this.plugin.universe.readCalendar();

		const times = graph.nodes
			.map((node) => node.time)
			.filter((time): time is number => time !== null);
		const span = times.length > 1 ? Math.max(...times) - Math.min(...times) : 0;

		this.layout = computeLayout(graph, {
			flows: definition?.flows ?? [],
			pixelsPerUnit: autoPixelsPerUnit(span) * this.plugin.settings.timeDensity,
			unnamedFlowLabel: t("timeline.unnamedFlow"),
			untimedLabel: t("timeline.untimed"),
			formatTick: (value) => this.plugin.universe.formatTime(Math.round(value), calendar),
		});

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

		// Lane labels and the axis stay pinned while the scene pans underneath.
		const scene = svgEl("g", { class: "plc-timeline-scene" });
		svg.appendChild(scene);
		this.sceneEl = scene;

		this.drawLanes(scene, layout);
		this.drawEdges(scene, layout);
		this.drawNodes(scene, layout);
		this.drawAxis(scene, layout);

		this.applyTransform();
	}

	private drawLanes(scene: SVGGElement, layout: Layout) {
		const group = svgEl("g", { class: "plc-lanes" });

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

			const label = svgEl("text", {
				x: LEFT_GUTTER - 16,
				y: lane.y + lane.height / 2,
				class: "plc-lane-label",
				"text-anchor": "end",
				"dominant-baseline": "middle",
			});
			label.textContent = lane.name;
			group.appendChild(label);
		}

		scene.appendChild(group);
	}

	private drawAxis(scene: SVGGElement, layout: Layout) {
		const group = svgEl("g", { class: "plc-axis" });

		group.appendChild(
			svgEl("line", {
				x1: LEFT_GUTTER,
				y1: AXIS_HEIGHT,
				x2: layout.width,
				y2: AXIS_HEIGHT,
				class: "plc-axis-line",
			}),
		);

		for (const tick of layout.ticks) {
			group.appendChild(
				svgEl("line", {
					x1: tick.x,
					y1: AXIS_HEIGHT,
					x2: tick.x,
					y2: layout.height,
					class: "plc-axis-grid",
				}),
			);

			const label = svgEl("text", {
				x: tick.x,
				y: AXIS_HEIGHT - 10,
				class: "plc-axis-label",
				"text-anchor": "middle",
			});
			label.textContent = tick.label;
			group.appendChild(label);
		}

		scene.appendChild(group);
	}

	/**
	 * Curved connectors rather than straight lines: when several threads converge
	 * on one moment the curves stay separable, and it matches how the author
	 * sketches these by hand.
	 */
	private drawEdges(scene: SVGGElement, layout: Layout) {
		const group = svgEl("g", { class: "plc-edges" });
		const byPath = new Map(layout.placed.map((entry) => [entry.node.path, entry]));

		for (const edge of layout.edges) {
			const from = byPath.get(edge.from);
			const to = byPath.get(edge.to);
			if (!from || !to) continue;

			const x1 = from.x + from.width;
			const y1 = from.y + from.height / 2;
			const x2 = to.x;
			const y2 = to.y + to.height / 2;
			const reach = Math.max(40, Math.abs(x2 - x1) * 0.45);

			group.appendChild(
				svgEl("path", {
					d: `M ${x1} ${y1} C ${x1 + reach} ${y1}, ${x2 - reach} ${y2}, ${x2} ${y2}`,
					class: "plc-edge",
					"marker-end": "url(#plc-arrow)",
				}),
			);
		}

		scene.appendChild(group);
	}

	private drawNodes(scene: SVGGElement, layout: Layout) {
		const group = svgEl("g", { class: "plc-nodes" });

		for (const entry of layout.placed) {
			group.appendChild(this.drawNode(entry));
		}

		scene.appendChild(group);
	}

	private drawNode(entry: PlacedNode): SVGGElement {
		const { node } = entry;
		const t = (key: string, ...args: string[]) => this.plugin.i18n.t(key, ...args);

		const group = svgEl("g", {
			class: `plc-node is-${node.status}${node.uncertain ? " is-uncertain" : ""}`,
			transform: `translate(${entry.x}, ${entry.y})`,
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
		if (node.icon && node.iconType === "emoji") {
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

		const timeText = node.timeLabel || (node.time === null ? t("timeline.untimed") : String(node.time));
		const title = svgEl("title");
		title.textContent = [
			node.title,
			timeText,
			t(`status.${node.status}`),
			versioned ? t("timeline.hasVersions") : "",
		]
			.filter((line) => line.length > 0)
			.join("\n");
		group.appendChild(title);

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
				// Claim the gesture so the canvas does not start panning instead.
				event.stopPropagation();
				this.beginDrag(entry, group, event);
			});
		}

		return group;
	}

	private async openNode(file: TFile, event: MouseEvent) {
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
		const precision = frontmatter?.["time-precision"];
		const days = this.plugin.universe.readCalendar().calendarDays || 365;

		if (precision === "date") return 1 / days;
		if (precision === "datetime") return 1 / (days * 24);
		return 1;
	}

	private beginDrag(entry: PlacedNode, group: SVGGElement, event: PointerEvent) {
		const point = this.toScene(event.clientX, event.clientY);

		this.drag = {
			entry,
			group,
			startX: event.clientX,
			startY: event.clientY,
			offsetX: point.x - entry.x,
			offsetY: point.y - entry.y,
			moved: false,
			time: entry.node.time,
			lane: null,
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
		}

		const point = this.toScene(event.clientX, event.clientY);
		const x = point.x - drag.offsetX;
		const y = point.y - drag.offsetY;

		drag.lane = laneAt(layout, y + drag.entry.height / 2);

		// Dropping into the untimed lane would mean erasing a date, which is a
		// destructive edit disguised as a nudge; the time picker does that
		// explicitly instead.
		const intoUntimed = drag.lane?.untimed === true;
		drag.time = intoUntimed ? null : this.snapTime(timeAt(layout, x), drag.entry, event.shiftKey);

		drag.group.setAttribute("transform", `translate(${x}, ${y})`);
		this.showDragHint(drag, event, intoUntimed);
	}

	private snapTime(raw: number, entry: PlacedNode, fine: boolean): number {
		if (fine) return Number.parseFloat(raw.toFixed(6));
		const step = this.snapStep(entry);
		return Math.round(raw / step) * step;
	}

	private showDragHint(drag: NodeDrag, event: PointerEvent, intoUntimed: boolean) {
		const t = (key: string, ...args: string[]) => this.plugin.i18n.t(key, ...args);
		this.hintEl ??= this.canvasEl.createDiv({ cls: "plc-drag-hint" });

		const calendar = this.plugin.universe.readCalendar();
		const parts: string[] = [];

		if (intoUntimed) {
			parts.push(t("timeline.drag.blocked"));
		} else if (drag.time !== null) {
			parts.push(this.plugin.universe.formatTime(Number(drag.time.toFixed(4)), calendar));
		}
		if (drag.lane && !drag.lane.untimed && drag.lane.id !== drag.entry.node.flow) {
			parts.push(`→ ${drag.lane.name}`);
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

		if (!drag.moved || drag.cancelled || drag.time === null) {
			// Nothing committed, so put the box back where the layout had it.
			this.render();
			return;
		}

		const flow = drag.lane && !drag.lane.untimed ? drag.lane.id : drag.entry.node.flow;
		const timeChanged = drag.time !== drag.entry.node.time;
		const flowChanged = flow !== drag.entry.node.flow;

		if (!timeChanged && !flowChanged) {
			this.render();
			return;
		}

		try {
			await this.app.fileManager.processFrontMatter(drag.entry.node.file, (frontmatter) => {
				if (timeChanged) {
					frontmatter.time = drag.time;
					if (!isTimePrecision(frontmatter["time-precision"])) {
						frontmatter["time-precision"] = "year";
					}
					// A label written for the old date would now be a lie, and the
					// author's own wording is better lost than left wrong.
					delete frontmatter["time-label"];
				}
				if (flowChanged) frontmatter.flow = flow;
			});
		} catch (error) {
			console.error("Lore Creator: could not move the note", error);
			this.render();
		}
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
			if (this.drag) {
				this.updateDrag(event);
				return;
			}
			if (!pressed) return;

			if (!this.panned) {
				const travelled = Math.hypot(event.clientX - startX, event.clientY - startY);
				if (travelled < DRAG_THRESHOLD) return;
				this.panned = true;
				this.canvasEl.addClass("is-panning");
			}

			this.panX = event.clientX - originX;
			this.panY = event.clientY - originY;
			this.applyTransform();
		});

		this.registerDomEvent(window, "pointerup", () => {
			if (this.drag) {
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

	private applyTransform() {
		this.sceneEl?.setAttribute(
			"transform",
			`translate(${this.panX}, ${this.panY}) scale(${this.zoom})`,
		);
	}

	async onClose() {
		this.contentEl.empty();
	}
}
