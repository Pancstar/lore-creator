/**
 * Frontmatter arrives as whatever YAML happened to parse, so every read goes
 * through one of these before the rest of the plugin is allowed to trust it.
 */

/** The empty string for anything that was not written as text. */
export function asString(value: unknown): string {
	return typeof value === "string" ? value : "";
}

/**
 * Numbers may be written as `1420` or as `"1420"`, both of which authors do.
 * Anything else — a list, a map, a stray boolean — reads as absent.
 */
export function asNumberOrNull(value: unknown): number | null {
	if (typeof value === "number") return Number.isFinite(value) ? value : null;
	if (typeof value !== "string" || value === "") return null;
	const parsed = Number.parseFloat(value);
	return Number.isFinite(parsed) ? parsed : null;
}

/** Same reading, with a stand-in for the fields that must always hold a number. */
export function asNumber(value: unknown, fallback: number): number {
	return asNumberOrNull(value) ?? fallback;
}
