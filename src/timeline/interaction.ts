import type { NodeStatus, TimelineEdge, TimelineNode } from "./model";
import type { Layout, PlacedNode } from "./layout";

/**
 * Decisions the timeline canvas makes about what to show and where focus goes,
 * kept free of the DOM so they can be tested on their own.
 */

/** What the author narrowed the canvas to. An empty list means "no restriction". */
export interface TimelineFilter {
	statuses: NodeStatus[];
	flows: string[];
	types: string[];
}

export const EMPTY_FILTER: TimelineFilter = { statuses: [], flows: [], types: [] };

/**
 * Lowercases for matching across English and Turkish names alike: `İ`, `I`,
 * `ı` and `i` all fold to `i`, so "istanbul" finds "İstanbul" and "KIRIK"
 * finds "Kırık" whatever the system locale is.
 */
export function foldCase(text: string): string {
	return text.toLowerCase().replace(/̇/g, "").replace(/ı/g, "i");
}

/**
 * Flow ids belong to one timeline. After switching, ids the shown timeline
 * does not have would dim every note with nothing checked to explain it, so
 * they are dropped. Returns the same object when nothing changes.
 */
export function pruneFilter(filter: TimelineFilter, laneIds: string[]): TimelineFilter {
	const flows = filter.flows.filter((flow) => laneIds.includes(flow));
	return flows.length === filter.flows.length ? filter : { ...filter, flows };
}

export function isFiltering(filter: TimelineFilter, query: string): boolean {
	return (
		filter.statuses.length > 0 || filter.flows.length > 0 || filter.types.length > 0 || query.trim().length > 0
	);
}

function matchesQuery(node: TimelineNode, query: string): boolean {
	const wanted = foldCase(query.trim());
	if (!wanted) return true;
	return foldCase(node.title).includes(wanted) || foldCase(node.timeLabel).includes(wanted);
}

export function nodeMatches(node: TimelineNode, filter: TimelineFilter, query: string): boolean {
	if (filter.statuses.length > 0 && !filter.statuses.includes(node.status)) return false;
	if (filter.flows.length > 0 && !filter.flows.includes(node.flow)) return false;
	if (filter.types.length > 0 && !filter.types.includes(node.type)) return false;
	return matchesQuery(node, query);
}

/**
 * Notes the search finds, in reading order: left to right, then top to bottom.
 * Notes the filter leaves out are not hits — they are dimmed out of sight.
 */
export function searchMatches(placed: PlacedNode[], query: string, filter: TimelineFilter = EMPTY_FILTER): string[] {
	if (!query.trim()) return [];
	return placed
		.filter((entry) => matchesQuery(entry.node, query) && nodeMatches(entry.node, filter, ""))
		.sort((a, b) => a.x - b.x || a.y - b.y)
		.map((entry) => entry.node.path);
}

function centreX(entry: PlacedNode): number {
	return entry.x + entry.width / 2;
}

function laneIndexOf(layout: Layout, entry: PlacedNode): number {
	return layout.lanes.findIndex(
		(lane) => entry.y >= lane.y - 1 && entry.y <= lane.y + lane.height + 1,
	);
}

/**
 * Where an arrow key takes focus. Left and right walk the lane by time; up
 * and down jump to the neighbouring lane, landing on the box closest in time.
 */
export function neighbour(
	layout: Layout,
	path: string,
	direction: "left" | "right" | "up" | "down",
): string | null {
	const from = layout.placed.find((entry) => entry.node.path === path);
	if (!from) return null;
	const fromLane = laneIndexOf(layout, from);
	const x = centreX(from);

	if (direction === "left" || direction === "right") {
		const sign = direction === "right" ? 1 : -1;
		let best: PlacedNode | null = null;
		let bestScore = Number.POSITIVE_INFINITY;
		for (const entry of layout.placed) {
			if (entry === from || laneIndexOf(layout, entry) !== fromLane) continue;
			const dx = (centreX(entry) - x) * sign;
			if (dx <= 0) continue;
			const score = dx + Math.abs(entry.y - from.y) * 0.5;
			if (score < bestScore) {
				bestScore = score;
				best = entry;
			}
		}
		return best?.node.path ?? null;
	}

	const step = direction === "down" ? 1 : -1;
	for (let lane = fromLane + step; lane >= 0 && lane < layout.lanes.length; lane += step) {
		const candidates = layout.placed.filter((entry) => laneIndexOf(layout, entry) === lane);
		if (candidates.length === 0) continue; // an empty declared lane is skipped, not a dead end
		candidates.sort((a, b) => Math.abs(centreX(a) - x) - Math.abs(centreX(b) - x));
		return candidates[0].node.path;
	}
	return null;
}

/** The moment a parallel timeline split off: the point note's time, if it has one. */
export function divergenceMoment(point: TimelineNode | undefined): number | null {
	return point?.time ?? null;
}

/** Edges worth drawing on a map that shows only some of the notes. */
export function visibleEdges(edges: TimelineEdge[], drawn: Set<string>): TimelineEdge[] {
	return edges.filter((edge) => drawn.has(edge.from) && drawn.has(edge.to));
}
