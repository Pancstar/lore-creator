import { LANGUAGES, Language } from "./i18n";

export interface LoreSettings {
	language: Language;
	universeFile: string;
	registryFile: string;
	versionsFolder: string;
	templatesFolder: string;
	versionSetsFile: string;
	exportFolder: string;
	showEarthTime: boolean;
	minimapPinned: boolean;
	minimapMode: "wide" | "near";
	/** Multiplier on the automatic time scale, so the axis can be spread out. */
	timeDensity: number;
	timelineLocked: boolean;
	/** Cleared once the vault has been set up, so the offer is made only once. */
	setupOffered: boolean;
	/** The guide opens by itself once; after that only on request. */
	guideShown: boolean;
	/** Guide chapters already opened, for the ✅ marks in its menu. */
	guideRead: string[];
	/** Consistency report kinds the author switched off; they leave the count too. */
	auditHidden: string[];
}


/**
 * Paths default to English so the plugin reads sensibly in a fresh vault. Every
 * one of them is a setting — a vault is free to name these folders in whatever
 * language it is written in.
 */
export const DEFAULT_SETTINGS: LoreSettings = {
	language: "auto",
	universeFile: "Universe.md",
	registryFile: "System/Types.md",
	versionsFolder: "Versions",
	templatesFolder: "Templates",
	versionSetsFile: "System/Version sets.md",
	exportFolder: "Exports",
	showEarthTime: true,
	minimapPinned: false,
	minimapMode: "near",
	timeDensity: 1,
	timelineLocked: false,
	setupOffered: false,
	guideShown: false,
	guideRead: [],
	auditHidden: [],
};

/**
 * Settings fields whose value must be one of a few words. Anything else in the
 * data file falls back to the default rather than reaching the views.
 */
const CHOICES: Record<string, string[]> = {
	language: [...LANGUAGES],
	minimapMode: ["wide", "near"],
};

/**
 * Merges what was stored over the defaults, keeping a stored value only when
 * it has the same shape as the default. A hand-edited or damaged `data.json`
 * (a string where a list belongs, `null`, a word for a number) then opens with
 * defaults for those fields instead of breaking a view later.
 */
export function sanitizeSettings<T extends object>(stored: unknown, defaults: T): T {
	const source = (typeof stored === "object" && stored !== null ? stored : {}) as Record<string, unknown>;
	const result = { ...defaults } as Record<string, unknown>;

	for (const [key, fallback] of Object.entries(defaults)) {
		if (!(key in source)) continue;
		const value = source[key];

		if (Array.isArray(fallback)) {
			if (Array.isArray(value)) result[key] = value.filter((entry): entry is string => typeof entry === "string");
		} else if (typeof fallback === "number") {
			if (typeof value === "number" && Number.isFinite(value)) result[key] = value;
		} else if (typeof fallback === "boolean") {
			if (typeof value === "boolean") result[key] = value;
		} else if (typeof fallback === "string") {
			const allowed = CHOICES[key];
			if (typeof value === "string" && (!allowed || allowed.includes(value))) result[key] = value;
		}
	}
	return result as T;
}

/**
 * Path settings for a re-run of the setup: a path whose file or folder is
 * still there is the author's working setup and stays; only paths that point
 * at nothing take the newly proposed name.
 */
export function keepExistingPaths<T extends Record<string, string>>(
	current: T,
	proposed: T,
	exists: (path: string) => boolean,
): T {
	const result = { ...proposed };
	for (const key of Object.keys(proposed) as (keyof T)[]) {
		const path = current[key];
		if (typeof path === "string" && path.trim() && exists(path)) result[key] = path;
	}
	return result;
}
