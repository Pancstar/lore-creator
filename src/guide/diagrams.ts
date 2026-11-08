import type { GuideDiagram } from "./chapters";

type T = (key: string) => string;

/** Builds an SVG element with attributes; text never goes through innerHTML. */
function svg<K extends keyof SVGElementTagNameMap>(
	tag: K,
	attrs: Record<string, string | number> = {},
	text?: string,
): SVGElementTagNameMap[K] {
	const element = createSvg(tag);
	for (const [name, value] of Object.entries(attrs)) element.setAttribute(name, String(value));
	if (text !== undefined) element.textContent = text;
	return element;
}

function frame(parent: HTMLElement, width: number, height: number, label: string): SVGSVGElement {
	const root = svg("svg", {
		viewBox: `0 0 ${width} ${height}`,
		class: "plc-guide-diagram",
		role: "img",
		"aria-label": label,
	});
	parent.createDiv({ cls: "plc-guide-diagram-wrap" }).appendChild(root);
	return root;
}

function box(root: SVGElement, x: number, y: number, w: number, h: number, label: string, cls = "") {
	root.appendChild(svg("rect", { x, y, width: w, height: h, rx: 6, class: `plc-gd-box ${cls}`.trim() }));
	root.appendChild(
		svg("text", { x: x + w / 2, y: y + h / 2, class: "plc-gd-text", "text-anchor": "middle", "dominant-baseline": "middle" }, label),
	);
}

/**
 * Marker ids live in one document namespace, so two diagrams (or two guide
 * tabs) sharing an id would borrow each other's arrowheads. Each diagram
 * gets its own id; `arrow` uses the one its `arrowHead` just made.
 */
let headCounter = 0;
let currentHead = "plc-gd-head-0";

function arrow(root: SVGElement, x1: number, y1: number, x2: number, y2: number) {
	root.appendChild(svg("line", { x1, y1, x2, y2, class: "plc-gd-arrow", "marker-end": `url(#${currentHead})` }));
}

function arrowHead(root: SVGElement) {
	currentHead = `plc-gd-head-${++headCounter}`;
	const defs = svg("defs");
	const marker = svg("marker", { id: currentHead, viewBox: "0 0 10 10", refX: 9, refY: 5, markerWidth: 6, markerHeight: 6, orient: "auto" });
	marker.appendChild(svg("path", { d: "M0 0 L10 5 L0 10 z", class: "plc-gd-head" }));
	defs.appendChild(marker);
	root.appendChild(defs);
}

/** A cupboard with shelves: the universe and its folders. */
function universeTree(parent: HTMLElement, t: T) {
	const root = frame(parent, 320, 190, t("guide.diagram.universe"));
	root.appendChild(svg("rect", { x: 70, y: 8, width: 180, height: 174, rx: 8, class: "plc-gd-cupboard" }));
	root.appendChild(svg("text", { x: 160, y: 28, class: "plc-gd-title", "text-anchor": "middle" }, `🌌 ${t("guide.diagram.universe")}`));
	const shelves = ["characters", "places", "events", "laws"];
	shelves.forEach((key, i) => box(root, 86, 42 + i * 34, 148, 26, t(`guide.diagram.${key}`), "is-shelf"));
}

/** Two lanes on a washing line, earlier on the left. */
function timelineLanes(parent: HTMLElement, t: T) {
	const root = frame(parent, 360, 170, t("guide.diagram.time"));
	arrowHead(root);
	root.appendChild(svg("text", { x: 8, y: 52, class: "plc-gd-lane" }, t("guide.diagram.laneA")));
	root.appendChild(svg("text", { x: 8, y: 122, class: "plc-gd-lane" }, t("guide.diagram.laneB")));
	root.appendChild(svg("line", { x1: 90, y1: 48, x2: 352, y2: 48, class: "plc-gd-line" }));
	root.appendChild(svg("line", { x1: 90, y1: 118, x2: 352, y2: 118, class: "plc-gd-line" }));
	box(root, 96, 34, 76, 28, t("guide.diagram.event1"));
	box(root, 196, 34, 76, 28, t("guide.diagram.event2"));
	box(root, 236, 104, 76, 28, t("guide.diagram.event3"));
	arrow(root, 172, 48, 194, 48);
	arrow(root, 160, 62, 240, 104);
	arrow(root, 96, 156, 300, 156);
	root.appendChild(svg("text", { x: 304, y: 160, class: "plc-gd-small" }, t("guide.diagram.time")));
}

/** Pages linked by next/prev arrows. */
function nextPrev(parent: HTMLElement, t: T) {
	const root = frame(parent, 360, 110, t("guide.diagram.next"));
	arrowHead(root);
	const xs = [10, 135, 260];
	["event1", "event2", "event3"].forEach((key, i) => box(root, xs[i], 36, 90, 34, t(`guide.diagram.${key}`)));
	arrow(root, 100, 46, 133, 46);
	arrow(root, 225, 46, 258, 46);
	arrow(root, 258, 62, 227, 62);
	root.appendChild(svg("text", { x: 180, y: 26, class: "plc-gd-small", "text-anchor": "middle" }, `${t("guide.diagram.next")} →`));
	root.appendChild(svg("text", { x: 242, y: 90, class: "plc-gd-small", "text-anchor": "middle" }, `← ${t("guide.diagram.prev")}`));
}

/** The active draft on the desk, older ones in the drawer. */
function versionDrawer(parent: HTMLElement, t: T) {
	const root = frame(parent, 340, 150, t("guide.diagram.drawer"));
	root.appendChild(svg("text", { x: 70, y: 20, class: "plc-gd-small", "text-anchor": "middle" }, t("guide.diagram.desk")));
	box(root, 30, 32, 80, 50, t("guide.diagram.draft2"), "is-active");
	root.appendChild(svg("rect", { x: 170, y: 60, width: 160, height: 80, rx: 6, class: "plc-gd-cupboard" }));
	root.appendChild(svg("text", { x: 250, y: 52, class: "plc-gd-small", "text-anchor": "middle" }, t("guide.diagram.drawer")));
	box(root, 190, 82, 56, 40, t("guide.diagram.draft1"), "is-old");
}

export function renderDiagram(parent: HTMLElement, diagram: GuideDiagram, t: T): void {
	switch (diagram) {
		case "universeTree":
			return universeTree(parent, t);
		case "timelineLanes":
			return timelineLanes(parent, t);
		case "nextPrev":
			return nextPrev(parent, t);
		case "versionDrawer":
			return versionDrawer(parent, t);
	}
}
