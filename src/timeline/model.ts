import { App, TFile } from "obsidian";
import { linkTargets } from "../links";
import { asNumberOrNull, asString } from "../frontmatter";

export type NodeStatus = "draft" | "partial" | "done";

export interface FlowDefinition {
	id: string;
	name: string;
}

export interface TimelineDefinition {
	id: string;
	name: string;
	file: TFile;
	kind: "primary" | "parallel";
	flows: FlowDefinition[];
	divergesFrom: string;
}

export interface TimelineNode {
	path: string;
	file: TFile;
	title: string;
	icon: string;
	iconType: "emoji" | "lucide";
	type: string;
	status: NodeStatus;
	timeline: string;
	flow: string;
	time: number | null;
	timeEnd: number | null;
	timeLabel: string;
	uncertain: boolean;
	/** Calendar this node's `time` was entered in; empty means the universe's first calendar. */
	calendarId: string;
	next: string[];
	prev: string[];
}

export interface TimelineEdge {
	from: string;
	to: string;
}

export interface TimelineGraph {
	nodes: TimelineNode[];
	edges: TimelineEdge[];
}

function asStatus(value: unknown): NodeStatus {
	return value === "partial" || value === "done" ? value : "draft";
}

/**
 * Flow entries are a plain list so they stay easy to hand-edit. An entry can be
 * a bare id, or `id: Display name` when the author wants a prettier lane label.
 */
function parseFlows(value: unknown): FlowDefinition[] {
	if (!Array.isArray(value)) return [];
	const flows: FlowDefinition[] = [];

	for (const entry of value) {
		if (typeof entry === "object" && entry !== null) {
			const record = entry as Record<string, unknown>;
			const id = asString(record.id).trim();
			if (id) flows.push({ id, name: asString(record.name).trim() || id });
			continue;
		}

		const text = asString(entry).trim();
		if (!text) continue;
		const separator = text.indexOf(":");
		if (separator > 0) {
			const id = text.slice(0, separator).trim();
			const name = text.slice(separator + 1).trim();
			flows.push({ id, name: name || id });
		} else {
			flows.push({ id: text, name: text });
		}
	}
	return flows;
}

export class TimelineModel {
	constructor(private app: App) {}

	/** Timeline notes declare the realities the author can switch between. */
	definitions(): TimelineDefinition[] {
		const definitions: TimelineDefinition[] = [];

		for (const file of this.app.vault.getMarkdownFiles()) {
			const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter;
			if (!frontmatter || frontmatter.type !== "timeline") continue;

			const id = asString(frontmatter["timeline-id"]).trim() || file.basename;
			definitions.push({
				id,
				name: file.basename,
				file,
				kind: frontmatter["timeline-kind"] === "parallel" ? "parallel" : "primary",
				flows: parseFlows(frontmatter.flows),
				divergesFrom: linkTargets(frontmatter["diverges-from"])[0] ?? "",
			});
		}

		// Primary realities first, then alphabetical, so the main universe leads.
		definitions.sort((a, b) => {
			if (a.kind !== b.kind) return a.kind === "primary" ? -1 : 1;
			return a.name.localeCompare(b.name);
		});
		return definitions;
	}

	/** Every timeline id referenced by a note, including ones with no definition note. */
	referencedTimelineIds(): string[] {
		const ids = new Set<string>();
		for (const file of this.app.vault.getMarkdownFiles()) {
			const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter;
			const id = asString(frontmatter?.timeline).trim();
			if (id) ids.add(id);
		}
		return [...ids].sort();
	}

	graph(timelineId: string): TimelineGraph {
		const nodes = this.collectNodes(timelineId);
		const byPath = new Map(nodes.map((node) => [node.path, node]));
		return { nodes, edges: this.collectEdges(nodes, byPath) };
	}

	private collectNodes(timelineId: string): TimelineNode[] {
		const nodes: TimelineNode[] = [];

		for (const file of this.app.vault.getMarkdownFiles()) {
			const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter;
			if (!frontmatter) continue;

			// Archived versions live alongside their note; drawing them too would
			// double every fragment the author has ever revised.
			if (frontmatter["version-of"]) continue;
			if (asString(frontmatter.timeline).trim() !== timelineId) continue;

			nodes.push({
				path: file.path,
				file,
				title: file.basename,
				icon: asString(frontmatter.icon),
				iconType: frontmatter["icon-type"] === "lucide" ? "lucide" : "emoji",
				type: asString(frontmatter.type),
				status: asStatus(frontmatter.status),
				timeline: timelineId,
				flow: asString(frontmatter.flow).trim(),
				time: asNumberOrNull(frontmatter.time),
				timeEnd: asNumberOrNull(frontmatter["time-end"]),
				timeLabel: asString(frontmatter["time-label"]),
				uncertain: frontmatter["time-uncertain"] === true,
				calendarId: asString(frontmatter["calendar-id"]),
				next: linkTargets(frontmatter.next),
				prev: linkTargets(frontmatter.prev),
			});
		}

		return nodes;
	}

	/**
	 * Builds edges from both `next` and `prev`, so a connection declared on only
	 * one side of a pair still draws instead of silently vanishing.
	 */
	private collectEdges(nodes: TimelineNode[], byPath: Map<string, TimelineNode>): TimelineEdge[] {
		const seen = new Set<string>();
		const edges: TimelineEdge[] = [];

		const add = (from: string, to: string) => {
			if (from === to) return;
			// A newline cannot appear in a path, so it separates the pair safely.
			const key = `${from}\n${to}`;
			if (seen.has(key)) return;
			seen.add(key);
			edges.push({ from, to });
		};

		for (const node of nodes) {
			for (const link of node.next) {
				const target = this.resolve(link, node.path);
				if (target && byPath.has(target)) add(node.path, target);
			}
			for (const link of node.prev) {
				const source = this.resolve(link, node.path);
				if (source && byPath.has(source)) add(source, node.path);
			}
		}

		return edges;
	}

	private resolve(linkpath: string, sourcePath: string): string | null {
		return this.app.metadataCache.getFirstLinkpathDest(linkpath, sourcePath)?.path ?? null;
	}

	/** Connections pointing at notes outside this timeline, reported not fixed. */
	danglingLinks(timelineId: string): { node: TimelineNode; link: string }[] {
		const nodes = this.collectNodes(timelineId);
		const paths = new Set(nodes.map((node) => node.path));
		const dangling: { node: TimelineNode; link: string }[] = [];

		for (const node of nodes) {
			for (const link of [...node.next, ...node.prev]) {
				const target = this.resolve(link, node.path);
				if (!target || !paths.has(target)) dangling.push({ node, link });
			}
		}
		return dangling;
	}
}
