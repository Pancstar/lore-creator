import { ItemView, Platform, TAbstractFile, TFile, ViewStateResult, WorkspaceLeaf, setIcon } from "obsidian";
import type LorePlugin from "../main";
import { applyLang } from "../i18n";
import {
	DEFAULT_BOX,
	RelationLine,
	curveAround,
	curvePeak,
	layoutRings,
	mergePairs,
	neighbourhood,
	relationIndex,
} from "../relations";
import { isTemplate } from "../scope";

export const VIEW_TYPE_RELATIONS = "plc-relations";

/** Notes drawn besides the centre; the rest are counted, not drawn. */
const LIMIT = 60;
const NODE_WIDTH = DEFAULT_BOX.width;
const NODE_HEIGHT = DEFAULT_BOX.height;
const PADDING = 24;
/** Below this the text gets too small to read; the drawing scrolls instead. */
const MIN_SCALE = 0.7;
/** Hold this long on a touch screen to open a note instead of centring it. */
const LONG_PRESS_MS = 500;
const COLORS = 8;

/** Each view's arrowhead needs its own id: two relations views can be open at once. */
let viewCount = 0;

function svgEl<K extends keyof SVGElementTagNameMap>(
	tag: K,
	attrs: Record<string, string | number> = {},
): SVGElementTagNameMap[K] {
	const element = createSvg(tag);
	for (const [name, value] of Object.entries(attrs)) element.setAttribute(name, String(value));
	return element;
}

/** Where a line from a box's centre towards (dx, dy) leaves the box. */
function boxEdge(dx: number, dy: number): number {
	const halfW = NODE_WIDTH / 2;
	const halfH = NODE_HEIGHT / 2;
	const scale = Math.min(dx === 0 ? Infinity : halfW / Math.abs(dx), dy === 0 ? Infinity : halfH / Math.abs(dy));
	return Math.min(1, scale);
}

const shorten = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

/**
 * What a note is connected to: the open note in the middle, the notes its
 * fields and laws link it with around it, one or two steps out. Click a
 * note to move the centre there; Ctrl/Cmd-click (or a long press) opens it.
 */
export class RelationsView extends ItemView {
	private centerPath: string | null = null;
	private depth: 1 | 2 = 1;
	/** Stays on its note instead of following whichever note is opened. */
	private locked = false;
	/** The last note opened anywhere, for when the view is unlocked again. */
	private lastOpened: TFile | null = null;
	/** Something changed while the view was out of sight; draw when it is shown. */
	private stale = true;
	private markerId = `plc-rel-arrow-${++viewCount}`;

	constructor(
		leaf: WorkspaceLeaf,
		private plugin: LorePlugin,
	) {
		super(leaf);
	}

	getViewType(): string {
		return VIEW_TYPE_RELATIONS;
	}

	getDisplayText(): string {
		return this.plugin.i18n.t("view.relations");
	}

	getIcon(): string {
		return "waypoints";
	}

	getState(): Record<string, unknown> {
		return { ...super.getState(), center: this.centerPath, depth: this.depth, locked: this.locked };
	}

	async setState(state: unknown, result: ViewStateResult): Promise<void> {
		const saved = (state ?? {}) as Record<string, unknown>;
		if (typeof saved.center === "string") this.centerPath = saved.center;
		if (saved.depth === 1 || saved.depth === 2) this.depth = saved.depth;
		if (typeof saved.locked === "boolean") this.locked = saved.locked;
		await super.setState(state, result);
		this.render();
	}

	async onOpen() {
		applyLang(this.containerEl);
		this.contentEl.addClass("plc-relations-view");
		this.registerEvent(
			this.app.workspace.on("file-open", (file) => {
				if (file?.extension === "md") this.lastOpened = file;
				this.follow(file);
			}),
		);
		// A renamed centre keeps its place instead of turning the view blank.
		this.registerEvent(
			this.app.vault.on("rename", (file: TAbstractFile, oldPath: string) => {
				if (oldPath !== this.centerPath) return;
				this.centerPath = file.path;
				this.render();
				this.app.workspace.requestSaveLayout();
			}),
		);
		// Brought forward after changes it skipped while hidden.
		this.registerEvent(
			this.app.workspace.on("active-leaf-change", () => {
				if (this.stale) this.render();
			}),
		);
		if (!this.centerPath) this.follow(this.app.workspace.getActiveFile());
		this.render();
	}

	/** Shown again, or the pane changed size: the fit depends on it. */
	onResize() {
		this.render();
	}

	/** Moves the centre to the note just opened, unless locked or not a lore note. */
	private follow(file: TFile | null) {
		if (this.locked || !file || file.extension !== "md" || file.path === this.centerPath || isTemplate(file)) return;
		const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter;
		if (!frontmatter?.type || frontmatter["version-of"]) return;
		this.centerPath = file.path;
		this.render();
	}

	private setCenter(file: TFile, focus = false) {
		this.centerPath = file.path;
		this.render();
		this.app.workspace.requestSaveLayout();
		if (focus) this.contentEl.querySelector<SVGGElement>(".plc-rel-node.is-center")?.focus();
	}

	private async openNote(file: TFile) {
		await this.app.workspace.getLeaf(false).openFile(file);
	}

	/**
	 * Draws the view. Skipped while the view is out of sight (a background
	 * tab), and drawn once it is shown: the vault scan behind it is not free.
	 */
	render() {
		if (!this.contentEl.isConnected || !this.contentEl.isShown()) {
			this.stale = true;
			return;
		}
		this.stale = false;

		const t = (key: string, ...args: string[]) => this.plugin.i18n.t(key, ...args);
		this.contentEl.empty();

		const center = this.centerPath ? this.app.vault.getFileByPath(this.centerPath) : null;
		this.renderToolbar(center);

		if (!center) {
			this.contentEl.createDiv({ cls: "plc-relations-empty", text: t("relations.empty.none") });
			return;
		}

		const edges = relationIndex(
			this.app,
			this.plugin.types,
			(field) => this.plugin.types.fieldLabel(field, this.plugin.language),
			{ laws: t("relations.laws"), breaks: t("relations.breaks") },
		);
		const near = neighbourhood(edges, center, this.depth, LIMIT, (path) => this.app.vault.getFileByPath(path));
		if (near.nodes.length === 1) {
			this.contentEl.createDiv({ cls: "plc-relations-empty", text: t("relations.empty.alone", center.basename) });
			return;
		}

		this.renderGraph(near.nodes, mergePairs(near.edges), center);

		const footer = this.contentEl.createDiv({ cls: "plc-relations-footer" });
		if (near.hidden > 0) footer.createSpan({ cls: "plc-relations-more", text: t("relations.more", String(near.hidden)) });
		footer.createSpan({ cls: "plc-relations-hint", text: t(Platform.isMacOS ? "relations.hintMac" : "relations.hint") });
	}

	private renderToolbar(center: TFile | null) {
		const t = (key: string, ...args: string[]) => this.plugin.i18n.t(key, ...args);
		const bar = this.contentEl.createDiv({ cls: "plc-relations-toolbar" });
		bar.createDiv({ cls: "plc-relations-title", text: center?.basename ?? t("view.relations") });

		const depths = bar.createDiv({ cls: "plc-relations-depth" });
		for (const [value, key] of [
			[1, "relations.depth1"],
			[2, "relations.depth2"],
		] as const) {
			const button = depths.createEl("button", {
				text: String(value),
				cls: value === this.depth ? "is-active" : "",
				attr: { "aria-label": t(key), title: t(key), "aria-pressed": String(value === this.depth) },
			});
			button.addEventListener("click", () => {
				this.depth = value;
				this.render();
				this.app.workspace.requestSaveLayout();
			});
		}

		const lock = bar.createEl("button", {
			cls: `clickable-icon${this.locked ? " is-active" : ""}`,
			attr: {
				"aria-label": t(this.locked ? "relations.unlock" : "relations.lock"),
				title: t(this.locked ? "relations.unlock" : "relations.lock"),
				"aria-pressed": String(this.locked),
			},
		});
		setIcon(lock, this.locked ? "lock" : "lock-open");
		lock.addEventListener("click", () => {
			this.locked = !this.locked;
			// The relations tab is the active one now, so follow the last note
			// opened rather than asking which file is active.
			if (!this.locked) this.follow(this.lastOpened ?? this.app.workspace.getActiveFile());
			this.render();
			this.app.workspace.requestSaveLayout();
		});

		if (center) {
			const open = bar.createEl("button", {
				cls: "clickable-icon",
				attr: { "aria-label": t("relations.open"), title: t("relations.open") },
			});
			setIcon(open, "file-text");
			open.addEventListener("click", () => void this.openNote(center));
		}
	}

	private renderGraph(nodes: { file: TFile; depth: number; parent?: string }[], lines: RelationLine[], center: TFile) {
		const positions = layoutRings(nodes.map((node) => ({ id: node.file.path, depth: node.depth, parent: node.parent })));

		// Work out every line's shape first: bent lines reach outside the ring
		// of boxes, and the drawing has to make room for them.
		const xs = [...positions.values()].map((point) => point.x);
		const ys = [...positions.values()].map((point) => point.y);
		const shapes = lines.flatMap((line) => {
			const from = positions.get(line.from);
			const to = positions.get(line.to);
			if (!from || !to) return [];
			const atCenter = line.from === center.path || line.to === center.path;
			const bend = atCenter ? null : curveAround(from, to, NODE_WIDTH);
			if (bend) {
				const peak = curvePeak(from, bend, to);
				xs.push(peak.x);
				ys.push(peak.y);
			}
			return [{ line, from, to, bend, atCenter }];
		});

		const minX = Math.min(...xs) - NODE_WIDTH / 2 - PADDING;
		const minY = Math.min(...ys) - NODE_HEIGHT / 2 - PADDING;
		const width = Math.max(...xs) - Math.min(...xs) + NODE_WIDTH + 2 * PADDING;
		const height = Math.max(...ys) - Math.min(...ys) + NODE_HEIGHT + 2 * PADDING;

		const svg = svgEl("svg", {
			class: "plc-relations-svg",
			viewBox: `${minX} ${minY} ${width} ${height}`,
			preserveAspectRatio: "xMidYMid meet",
			role: "group",
		});
		const defs = svgEl("defs");
		const marker = svgEl("marker", {
			id: this.markerId,
			viewBox: "0 0 10 10",
			refX: 10,
			refY: 5,
			markerWidth: 7,
			markerHeight: 7,
			orient: "auto-start-reverse",
		});
		marker.appendChild(svgEl("path", { d: "M 0 0 L 10 5 L 0 10 z", class: "plc-rel-arrow" }));
		defs.appendChild(marker);
		svg.appendChild(defs);
		const arrow = `url(#${this.markerId})`;

		const edgeLayer = svgEl("g", { class: "plc-rel-edges" });
		for (const { line, from, to, bend, atCenter } of shapes) {
			const group = svgEl("g", { class: "plc-rel-edge" });
			const ends = { "marker-end": arrow, ...(line.both ? { "marker-start": arrow } : {}) };
			const dx = to.x - from.x;
			const dy = to.y - from.y;
			if (!bend) {
				const start = boxEdge(dx, dy);
				const end = boxEdge(-dx, -dy);
				group.appendChild(
					svgEl("line", {
						x1: from.x + dx * start,
						y1: from.y + dy * start,
						x2: to.x - dx * end,
						y2: to.y - dy * end,
						...ends,
					}),
				);
			} else {
				// Between two outer notes the line bends outward, so it is never
				// hidden under the centre note.
				const out = boxEdge(bend.x - from.x, bend.y - from.y);
				const back = boxEdge(bend.x - to.x, bend.y - to.y);
				const x1 = from.x + (bend.x - from.x) * out;
				const y1 = from.y + (bend.y - from.y) * out;
				const x2 = to.x + (bend.x - to.x) * back;
				const y2 = to.y + (bend.y - to.y) * back;
				group.appendChild(svgEl("path", { d: `M ${x1} ${y1} Q ${bend.x} ${bend.y} ${x2} ${y2}`, ...ends }));
			}
			const words = line.labels.join(" · ");
			const title = svgEl("title");
			title.textContent = `${this.nameOf(line.from)} ${line.both ? "↔" : "→"} ${this.nameOf(line.to)}: ${words}`;
			group.appendChild(title);
			// Lines at the centre carry their words; further out they only say it on hover.
			if (atCenter) {
				const label = svgEl("text", { x: from.x + dx / 2, y: from.y + dy / 2 - 4, class: "plc-rel-label" });
				label.textContent = shorten(words, 30);
				group.appendChild(label);
			}
			edgeLayer.appendChild(group);
		}
		svg.appendChild(edgeLayer);

		const typeOrder = this.plugin.types.all().map((type) => type.id);
		const nodeLayer = svgEl("g", { class: "plc-rel-nodes" });
		for (const node of nodes) {
			const at = positions.get(node.file.path);
			if (!at) continue;
			const typeId: unknown = this.app.metadataCache.getFileCache(node.file)?.frontmatter?.type;
			const type = this.plugin.types.byId(typeof typeId === "string" ? typeId : undefined);
			const color = type ? typeOrder.indexOf(type.id) % COLORS : 0;
			const icon = type?.icon && !/^[a-z0-9-]+$/.test(type.icon) ? `${type.icon} ` : "";
			const group = svgEl("g", {
				class: `plc-rel-node is-c${color}${node.depth === 0 ? " is-center" : ""}`,
				transform: `translate(${at.x - NODE_WIDTH / 2} ${at.y - NODE_HEIGHT / 2})`,
				tabindex: 0,
				role: "button",
				"aria-label": node.file.basename,
			});
			group.appendChild(svgEl("rect", { width: NODE_WIDTH, height: NODE_HEIGHT, rx: 6 }));
			const text = svgEl("text", { x: NODE_WIDTH / 2, y: NODE_HEIGHT / 2 + 4 });
			text.textContent = icon + shorten(node.file.basename, 18);
			group.appendChild(text);
			const title = svgEl("title");
			title.textContent = type ? `${node.file.basename} · ${this.plugin.types.label(type, this.plugin.language)}` : node.file.basename;
			group.appendChild(title);
			this.bindNode(group, node.file);
			nodeLayer.appendChild(group);
		}
		svg.appendChild(nodeLayer);

		const canvas = this.contentEl.createDiv({ cls: "plc-relations-canvas" });
		canvas.appendChild(svg);
		// Fit the drawing to the pane, but not below a readable size: a large
		// web scrolls instead of shrinking to unreadable text.
		const fit = Math.min(canvas.clientWidth / width, canvas.clientHeight / height);
		if (fit > 0 && fit < MIN_SCALE) {
			svg.addClass("is-scrolling");
			svg.setAttribute("width", String(Math.round(width * MIN_SCALE)));
			svg.setAttribute("height", String(Math.round(height * MIN_SCALE)));
			// Start with the centre note in view rather than the top-left corner.
			canvas.scrollLeft = -minX * MIN_SCALE - canvas.clientWidth / 2;
			canvas.scrollTop = -minY * MIN_SCALE - canvas.clientHeight / 2;
		}
	}

	private bindNode(el: SVGGElement, file: TFile) {
		let pressTimer: number | null = null;
		let pressed = false;
		el.addEventListener("pointerdown", (event) => {
			if (event.pointerType !== "touch") return;
			pressed = false;
			pressTimer = window.setTimeout(() => {
				pressed = true;
				void this.openNote(file);
			}, LONG_PRESS_MS);
		});
		const cancel = () => {
			if (pressTimer !== null) window.clearTimeout(pressTimer);
			pressTimer = null;
		};
		el.addEventListener("pointerup", cancel);
		el.addEventListener("pointerleave", cancel);
		el.addEventListener("pointercancel", cancel);
		el.addEventListener("click", (event) => {
			if (pressed) {
				pressed = false;
				return;
			}
			if (event.ctrlKey || event.metaKey) void this.openNote(file);
			else if (file.path !== this.centerPath) this.setCenter(file);
		});
		el.addEventListener("keydown", (event) => {
			if (event.key !== "Enter" && event.key !== " ") return;
			event.preventDefault();
			if (event.ctrlKey || event.metaKey) void this.openNote(file);
			else if (file.path !== this.centerPath) this.setCenter(file, true);
		});
	}

	private nameOf(path: string): string {
		return this.app.vault.getFileByPath(path)?.basename ?? path;
	}

	async onClose() {
		this.contentEl.empty();
	}
}
