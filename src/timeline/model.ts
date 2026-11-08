import { App, TFile } from "obsidian";
import { linkTarget, linkTargets } from "../links";
import { asNumberOrNull, asString } from "../frontmatter";
import { TimePrecision, isTimePrecision } from "../time";
import { loreFiles } from "../scope";

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
	/** Link text of the timeline this one split from (`diverges-from`). */
	divergesFrom: string;
	/** Link text of the note, on the parent timeline, where it split (`divergence-point`). */
	divergencePoint: string;
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
	/** How finely `time` was set; missing or invalid counts as `year`. */
	precision: TimePrecision;
	uncertain: boolean;
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

/** Missing or unknown reads as `draft`: untouched is the default state of a note. */
export function asStatus(value: unknown): NodeStatus {
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

/** Everything one pass over the vault yields, reused until something changes. */
interface Snapshot {
	definitions: TimelineDefinition[];
	referenced: string[];
	nodesByTimeline: Map<string, TimelineNode[]>;
	graphs: Map<string, TimelineGraph>;
}

/**
 * Shared by every model instance: the vault is one, so is its snapshot. The
 * plugin drops it on every metadata change, delete and rename.
 */
let snapshot: Snapshot | null = null;

export class TimelineModel {
	constructor(private app: App) {}

	/** Forgets the cached snapshot; the next read rescans the vault once. */
	static invalidate() {
		snapshot = null;
	}

	/** Timeline notes declare the realities the author can switch between. */
	definitions(): TimelineDefinition[] {
		return [...this.snapshot().definitions];
	}

	/**
	 * A timeline named either by id (`main`) or by a link to its note
	 * (`[[Main timeline]]`) comes back as the id, so fields like
	 * `timeline-scope` accept both spellings. Anything else is returned as text.
	 */
	resolveTimelineId(text: string, sourcePath: string): string {
		const target = linkTarget(text);
		const { definitions } = this.snapshot();
		// A bare id that names a timeline is that timeline, even when a note
		// happens to share the name; only `[[...]]` asks for file resolution.
		const bracketed = text.trim().startsWith("[[");
		if (!bracketed && definitions.some((entry) => entry.id === target)) return target;
		const file = this.app.metadataCache.getFirstLinkpathDest(target, sourcePath);
		if (file) {
			const definition = definitions.find((entry) => entry.file.path === file.path);
			if (definition) return definition.id;
		}
		return target;
	}

	/** Every timeline id referenced by a note, including ones with no definition note. */
	referencedTimelineIds(): string[] {
		return [...this.snapshot().referenced];
	}

	graph(timelineId: string): TimelineGraph {
		const current = this.snapshot();
		const cached = current.graphs.get(timelineId);
		if (cached) return cached;

		const nodes = current.nodesByTimeline.get(timelineId) ?? [];
		const byPath = new Map(nodes.map((node) => [node.path, node]));
		const graph = { nodes, edges: this.collectEdges(nodes, byPath) };
		current.graphs.set(timelineId, graph);
		return graph;
	}

	private snapshot(): Snapshot {
		snapshot ??= this.scan();
		return snapshot;
	}

	/** The single vault pass behind every read above. */
	private scan(): Snapshot {
		const definitions: TimelineDefinition[] = [];
		const referenced = new Set<string>();
		const nodesByTimeline = new Map<string, TimelineNode[]>();

		for (const file of loreFiles(this.app)) {
			const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter;
			if (!frontmatter) continue;

			if (frontmatter.type === "timeline") definitions.push(this.definition(file, frontmatter));

			const timelineId = asString(frontmatter.timeline).trim();
			if (!timelineId) continue;
			referenced.add(timelineId);

			// Archived versions live alongside their note; drawing them too would
			// double every fragment the author has ever revised.
			if (frontmatter["version-of"]) continue;

			let nodes = nodesByTimeline.get(timelineId);
			if (!nodes) {
				nodes = [];
				nodesByTimeline.set(timelineId, nodes);
			}
			nodes.push(this.node(file, frontmatter, timelineId));
		}

		// Primary realities first, then alphabetical, so the main universe leads.
		definitions.sort((a, b) => {
			if (a.kind !== b.kind) return a.kind === "primary" ? -1 : 1;
			return a.name.localeCompare(b.name);
		});

		return { definitions, referenced: [...referenced].sort(), nodesByTimeline, graphs: new Map() };
	}

	private definition(file: TFile, frontmatter: Record<string, unknown>): TimelineDefinition {
		const id = asString(frontmatter["timeline-id"]).trim() || file.basename;
		return {
				id,
				name: file.basename,
				file,
				kind: frontmatter["timeline-kind"] === "parallel" ? "parallel" : "primary",
				flows: parseFlows(frontmatter.flows),
				divergesFrom: linkTargets(frontmatter["diverges-from"])[0] ?? "",
				divergencePoint: linkTargets(frontmatter["divergence-point"])[0] ?? "",
		};
	}

	private node(file: TFile, frontmatter: Record<string, unknown>, timelineId: string): TimelineNode {
		return {
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
			precision: isTimePrecision(frontmatter["time-precision"]) ? frontmatter["time-precision"] : "year",
			uncertain: frontmatter["time-uncertain"] === true,
			next: linkTargets(frontmatter.next),
			prev: linkTargets(frontmatter.prev),
		};
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
		const nodes = this.graph(timelineId).nodes;
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
