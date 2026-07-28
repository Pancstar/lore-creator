import type { FlowDefinition, TimelineEdge, TimelineGraph, TimelineNode } from "./model";

export const NODE_HEIGHT = 36;
export const MIN_NODE_WIDTH = 140;
export const ROW_GAP = 24;
export const LANE_PADDING = 28;
export const AXIS_HEIGHT = 40;
export const LEFT_GUTTER = 160;
export const CANVAS_PADDING = 48;

/** Clear space kept between boxes sharing a row, so connectors stay readable. */
export const NODE_SPACING = 28;

/** Rough advance width per character — enough to size boxes without measuring. */
const CHAR_WIDTH = 7.4;
const ICON_WIDTH = 22;
const BOX_PADDING = 16;

/** Width the timeline aims to fill before the author adjusts the density. */
const TARGET_SPAN_WIDTH = 1600;

/**
 * Derives a horizontal scale from the span itself. A universe measured in
 * decades and one measured in hundreds of thousands of years both have to land
 * on screen, and no fixed pixels-per-unit manages that for both.
 */
export function autoPixelsPerUnit(span: number): number {
	if (!Number.isFinite(span) || span <= 0) return 60;
	return TARGET_SPAN_WIDTH / span;
}

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
	/** Earliest time on the canvas, and the scale used — dragging inverts these. */
	minTime: number;
	pixelsPerUnit: number;
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


/**
 * Assigns nodes to lanes and rows. Within a lane, boxes that would overlap get
 * stacked into extra rows rather than drawn on top of each other, which keeps
 * dense periods readable without moving anything in time.
 */
function packRows(entries: { node: TimelineNode; x: number; width: number }[]): number[] {
	const rowEnds: number[] = [];
	const rows: number[] = [];

	for (const entry of entries) {
		let row = rowEnds.findIndex((end) => entry.x >= end + NODE_SPACING);
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
			x += width + NODE_SPACING;
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

	// The axis marks the moments the story actually has, not regular calendar
	// intervals. A column and the events in it are then the same thing, so moving
	// an event moves its date with it.
	const moments = [...new Set(timed.map((node) => node.time as number))].sort((a, b) => a - b);
	const ticks: AxisTick[] = moments.map((value) => ({
		value,
		x: scale(value),
		label: options.formatTick(value),
	}));

	const rightMost = placed.reduce((max, entry) => Math.max(max, entry.x + entry.width), 0);
	const tickRight = ticks.reduce((max, tick) => Math.max(max, tick.x), 0);

	return {
		placed,
		lanes,
		edges: graph.edges,
		ticks,
		width: Math.max(rightMost, tickRight) + CANVAS_PADDING,
		height: cursorY,
		minTime,
		pixelsPerUnit: options.pixelsPerUnit,
	};
}

/** Turns a canvas x back into a time, for working out where a drag landed. */
export function timeAt(layout: Layout, x: number): number {
	return layout.minTime + (x - LEFT_GUTTER - CANVAS_PADDING) / layout.pixelsPerUnit;
}

/** The lane a y coordinate falls in, or null when it is between lanes. */
export function laneAt(layout: Layout, y: number): Lane | null {
	let closest: Lane | null = null;
	let bestDistance = Number.POSITIVE_INFINITY;

	for (const lane of layout.lanes) {
		const top = lane.y - LANE_PADDING;
		const bottom = lane.y + lane.height + LANE_PADDING;
		if (y >= top && y <= bottom) return lane;

		const distance = y < top ? top - y : y - bottom;
		if (distance < bestDistance) {
			bestDistance = distance;
			closest = lane;
		}
	}
	// Dragging past the top or bottom edge should still land somewhere sensible.
	return closest;
}
