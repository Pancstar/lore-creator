import { asStatus } from "./timeline/model";

/**
 * Notes that hold the universe together rather than tell its story: a
 * timeline's definition, the registry, the universe note. They are never
 * "unfinished", so they carry no status and stay off the dashboard's list.
 */
const UNTRACKED_TYPES = new Set(["timeline", "system"]);

export function tracksStatus(type: string): boolean {
	return !UNTRACKED_TYPES.has(type);
}

/** On the dashboard's "unfinished" list: a story note not marked done (no status counts as draft). */
export function isUnfinished(frontmatter: Record<string, unknown>): boolean {
	const type = typeof frontmatter.type === "string" ? frontmatter.type : "";
	return tracksStatus(type) && asStatus(frontmatter.status) !== "done";
}
