import { TFile } from "obsidian";
import type LorePlugin from "../main";
import { TimelineModel, TimelineNode } from "../timeline/model";
import { computeLayout } from "../timeline/layout";

export type MinimapMode = "wide" | "near";

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

interface Box {
	node: TimelineNode;
	x: number;
	y: number;
	width: number;
	height: number;
}

/**
 * The small map shown beside a note. Wide mode answers "where am I in the whole
 * story", near mode answers "what is one step away" — both questions come up
 * while writing, and neither view answers the other one well.
 */
export class Minimap {
	private model: TimelineModel;

	constructor(private plugin: LorePlugin) {
		this.model = new TimelineModel(this.plugin.app);
	}

	/**
	 * @param highlight A file to mark as the pending destination, drawn while the
	 * author hovers a navigation button.
	 */
	render(container: HTMLElement, current: TFile, mode: MinimapMode, highlight: TFile | null) {
		container.empty();

		const frontmatter = this.plugin.app.metadataCache.getFileCache(current)?.frontmatter;
		const timelineId = typeof frontmatter?.timeline === "string" ? frontmatter.timeline.trim() : "";
		if (!timelineId) return;

		const graph = this.model.graph(timelineId);
		if (graph.nodes.length === 0) return;

		const boxes = mode === "wide" ? this.wideBoxes(graph, timelineId) : this.nearBoxes(graph, current);
		if (boxes.length === 0) return;

		this.draw(container, boxes, current, highlight);
	}

	private wideBoxes(
		graph: ReturnType<TimelineModel["graph"]>,
		timelineId: string,
	): Box[] {
		const definition = this.model.definitions().find((entry) => entry.id === timelineId);
		const layout = computeLayout(graph, {
			flows: definition?.flows ?? [],
			pixelsPerUnit: 6,
			unnamedFlowLabel: "",
			untimedLabel: "",
			formatTick: () => "",
		});

		return layout.placed.map((entry) => ({
			node: entry.node,
			x: entry.x,
			y: entry.y,
			width: entry.width,
			height: entry.height,
		}));
	}

	/**
	 * Lays the immediate neighbours out in three columns around the current note,
	 * which stays readable no matter how tangled the wider timeline is.
	 */
	private nearBoxes(graph: ReturnType<TimelineModel["graph"]>, current: TFile): Box[] {
		const byPath = new Map(graph.nodes.map((node) => [node.path, node]));
		const centre = byPath.get(current.path);
		if (!centre) return [];

		const incoming = graph.edges.filter((edge) => edge.to === current.path).map((edge) => edge.from);
		const outgoing = graph.edges.filter((edge) => edge.from === current.path).map((edge) => edge.to);

		const columnWidth = 150;
		const rowHeight = 44;
		const boxWidth = 130;
		const boxHeight = 28;

		const column = (paths: string[], x: number): Box[] =>
			paths
				.map((path) => byPath.get(path))
				.filter((node): node is TimelineNode => node !== undefined)
				.map((node, index) => ({
					node,
					x,
					y: index * rowHeight,
					width: boxWidth,
					height: boxHeight,
				}));

		const rows = Math.max(1, incoming.length, outgoing.length);
		const centreY = ((rows - 1) * rowHeight) / 2;

		return [
			...column(incoming, 0),
			{ node: centre, x: columnWidth, y: centreY, width: boxWidth, height: boxHeight },
			...column(outgoing, columnWidth * 2),
		];
	}

	private draw(container: HTMLElement, boxes: Box[], current: TFile, highlight: TFile | null) {
		const minX = Math.min(...boxes.map((box) => box.x));
		const minY = Math.min(...boxes.map((box) => box.y));
		const maxX = Math.max(...boxes.map((box) => box.x + box.width));
		const maxY = Math.max(...boxes.map((box) => box.y + box.height));

		const pad = 12;
		const svg = svgEl("svg", {
			class: "plc-minimap-svg",
			viewBox: `${minX - pad} ${minY - pad} ${maxX - minX + pad * 2} ${maxY - minY + pad * 2}`,
			preserveAspectRatio: "xMidYMid meet",
		});

		const byPath = new Map(boxes.map((box) => [box.node.path, box]));

		// Connectors are drawn from the boxes actually on screen, so near mode does
		// not sprout lines heading off to nodes it left out.
		for (const box of boxes) {
			for (const link of box.node.next) {
				const target = this.plugin.app.metadataCache.getFirstLinkpathDest(link, box.node.path);
				const targetBox = target ? byPath.get(target.path) : undefined;
				if (!targetBox) continue;

				const x1 = box.x + box.width;
				const y1 = box.y + box.height / 2;
				const x2 = targetBox.x;
				const y2 = targetBox.y + targetBox.height / 2;
				const reach = Math.max(20, Math.abs(x2 - x1) * 0.4);

				svg.appendChild(
					svgEl("path", {
						d: `M ${x1} ${y1} C ${x1 + reach} ${y1}, ${x2 - reach} ${y2}, ${x2} ${y2}`,
						class: "plc-minimap-edge",
					}),
				);
			}
		}

		for (const box of boxes) {
			const isCurrent = box.node.path === current.path;
			const isHighlight = highlight !== null && box.node.path === highlight.path;

			const group = svgEl("g", {
				class: `plc-minimap-node${isCurrent ? " is-current" : ""}${isHighlight ? " is-target" : ""}`,
			});

			group.appendChild(
				svgEl("rect", {
					x: box.x,
					y: box.y,
					width: box.width,
					height: box.height,
					rx: 4,
					ry: 4,
					class: "plc-minimap-box",
				}),
			);

			const label = svgEl("text", {
				x: box.x + 8,
				y: box.y + box.height / 2,
				class: "plc-minimap-label",
				"dominant-baseline": "middle",
			});
			label.textContent = box.node.title;
			group.appendChild(label);

			const title = svgEl("title");
			title.textContent = box.node.timeLabel
				? `${box.node.title} · ${box.node.timeLabel}`
				: box.node.title;
			group.appendChild(title);

			if (!isCurrent) {
				group.addEventListener("click", () => {
					void this.plugin.app.workspace.getLeaf(false).openFile(box.node.file);
				});
			}

			svg.appendChild(group);
		}

		container.appendChild(svg);
	}
}
