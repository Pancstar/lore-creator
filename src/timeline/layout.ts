import type { FlowDefinition, TimelineEdge, TimelineGraph, TimelineNode } from "./model";

export const NODE_HEIGHT = 34;
export const MIN_NODE_WIDTH = 120;
export const ROW_GAP = 14;
export const LANE_PADDING = 18;
export const AXIS_HEIGHT = 34;
export const LEFT_GUTTER = 150;
export const CANVAS_PADDING = 40;

/** Rough advance width per character — enough to size boxes without measuring. */
const CHAR_WIDTH = 7.4;
const ICON_WIDTH = 22;
const BOX_PADDING = 14;

export interface PlacedNode {
	node: TimelineNode;
	x: number;
	y: number;
	width: number;
	height: number;
}

export interface Lane {
	id: string;
	name: string;
	y: number;
	height: number;
	/** True for the lane holding notes whose time is not yet known. */
	untimed: boolean;
}

export interface AxisTick {
	value: number;
	x: number;
	label: string;
}

export interface Layout {
	placed: PlacedNode[];
	lanes: Lane[];
	edges: TimelineEdge[];
	ticks: AxisTick[];
	width: number;
	height: number;
}

export interface LayoutOptions {
	/** Declared lanes, so empty ones still show and ordering stays intentional. */
	flows: FlowDefinition[];
	/** Horizontal pixels per unit of in-universe time. */
	pixelsPerUnit: number;
	unnamedFlowLabel: string;
	untimedLabel: string;
	formatTick: (value: number) => string;
}

function estimateWidth(node: TimelineNode): number {
	const iconSpace = node.icon ? ICON_WIDTH : 0;
	return Math.max(MIN_NODE_WIDTH, node.title.length * CHAR_WIDTH + iconSpace + BOX_PADDING * 2);
}

/** Picks a 1/2/5×10ⁿ step so axis labels land on values people recognise. */
function niceStep(span: number, targetTicks: number): number {
	if (span <= 0) return 1;
	const rough = span / Math.max(1, targetTicks);
	const magnitude = Math.pow(10, Math.floor(Math.log10(rough)));
	const normalised = rough / magnitude;

	if (normalised <= 1) return magnitude;
	if (normalised <= 2) return 2 * magnitude;
	if (normalised <= 5) return 5 * magnitude;
	return 10 * magnitude;
}

/**
 * Assigns nodes to lanes and rows. Within a lane, boxes that would overlap get
 * stacked into extra rows rather than drawn on top of each other, which keeps
 * dense periods readable without moving anything in time.
 */
function packRows(entries: { node: TimelineNode; x: number; width: number }[]): number[] {
	const rowEnds: number[] = [];
	const rows: number[] = [];

	for (const entry of entries) {
		let row = rowEnds.findIndex((end) => entry.x >= end + 12);
		if (row === -1) {
			row = rowEnds.length;
			rowEnds.push(0);
		}
		rowEnds[row] = entry.x + entry.width;
		rows.push(row);
	}
	return rows;
}

export function computeLayout(graph: TimelineGraph, options: LayoutOptions): Layout {
	const timed = graph.nodes.filter((node) => node.time !== null);
	const untimed = graph.nodes.filter((node) => node.time === null);

	const times = timed.flatMap((node) => [node.time as number, node.timeEnd ?? (node.time as number)]);
	const minTime = times.length > 0 ? Math.min(...times) : 0;
	const maxTime = times.length > 0 ? Math.max(...times) : 0;
	const span = maxTime - minTime;

	const scale = (value: number) => LEFT_GUTTER + CANVAS_PADDING + (value - minTime) * options.pixelsPerUnit;

	// Lane order: declared flows first, then any flow only the notes know about,
	// then a lane for notes with no flow, and finally the untimed lane.
	const laneIds: string[] = options.flows.map((flow) => flow.id);
	const laneNames = new Map(options.flows.map((flow) => [flow.id, flow.name]));

	for (const node of timed) {
		if (node.flow && !laneIds.includes(node.flow)) {
			laneIds.push(node.flow);
			laneNames.set(node.flow, node.flow);
		}
	}
	if (timed.some((node) => !node.flow)) {
		laneIds.push("");
		laneNames.set("", options.unnamedFlowLabel);
	}

	const lanes: Lane[] = [];
	const placed: PlacedNode[] = [];
	let cursorY = AXIS_HEIGHT + LANE_PADDING;

	for (const laneId of laneIds) {
		const members = timed
			.filter((node) => node.flow === laneId)
			.map((node) => {
				const time = node.time as number;
				const x = scale(time);
				const spanWidth = node.timeEnd !== null ? scale(node.timeEnd) - x : 0;
				return { node, x, width: Math.max(estimateWidth(node), spanWidth) };
			})
			.sort((a, b) => a.x - b.x);

		const rows = packRows(members);
		const rowCount = Math.max(1, rows.length > 0 ? Math.max(...rows) + 1 : 1);

		members.forEach((entry, index) => {
			placed.push({
				node: entry.node,
				x: entry.x,
				y: cursorY + rows[index] * (NODE_HEIGHT + ROW_GAP),
				width: entry.width,
				height: NODE_HEIGHT,
			});
		});

		const laneHeight = rowCount * NODE_HEIGHT + (rowCount - 1) * ROW_GAP;
		lanes.push({
			id: laneId,
			name: laneNames.get(laneId) ?? laneId,
			y: cursorY,
			height: laneHeight,
			untimed: false,
		});
		cursorY += laneHeight + LANE_PADDING * 2;
	}

	// Notes with no time still belong to the story, so they get their own lane
	// laid out left to right rather than being hidden until a date exists.
	if (untimed.length > 0) {
		let x = LEFT_GUTTER + CANVAS_PADDING;
		for (const node of untimed) {
			const width = estimateWidth(node);
			placed.push({ node, x, y: cursorY, width, height: NODE_HEIGHT });
			x += width + 24;
		}
		lanes.push({
			id: "__untimed",
			name: options.untimedLabel,
			y: cursorY,
			height: NODE_HEIGHT,
			untimed: true,
		});
		cursorY += NODE_HEIGHT + LANE_PADDING * 2;
	}

	const ticks: AxisTick[] = [];
	if (timed.length > 0) {
		const step = niceStep(span, 8);
		const first = Math.floor(minTime / step) * step;
		for (let value = first; value <= maxTime + step; value += step) {
			ticks.push({ value, x: scale(value), label: options.formatTick(value) });
		}
	}

	const rightMost = placed.reduce((max, entry) => Math.max(max, entry.x + entry.width), 0);
	const tickRight = ticks.reduce((max, tick) => Math.max(max, tick.x), 0);

	return {
		placed,
		lanes,
		edges: graph.edges,
		ticks,
		width: Math.max(rightMost, tickRight) + CANVAS_PADDING,
		height: cursorY,
	};
}
