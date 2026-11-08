import { describe, expect, it } from "vitest";
import { keepExistingPaths, sanitizeSettings } from "../src/settingsData";

const DEFAULTS = {
	language: "auto",
	universeFile: "Universe.md",
	showEarthTime: true,
	timeDensity: 1,
	minimapMode: "wide",
	guideRead: [] as string[],
	auditHidden: [] as string[],
};

describe("sanitizeSettings", () => {
	it("keeps values of the right type", () => {
		const stored = { language: "tr", universeFile: "Evren.md", timeDensity: 2.5, auditHidden: ["orphan"], minimapMode: "near" };
		expect(sanitizeSettings(stored, DEFAULTS)).toEqual({ ...DEFAULTS, ...stored });
	});

	it("falls back to the default for anything damaged", () => {
		const stored = {
			language: "klingon",
			universeFile: 5,
			showEarthTime: "yes",
			timeDensity: "big",
			minimapMode: "huge",
			guideRead: null,
			auditHidden: "x",
		};
		expect(sanitizeSettings(stored, DEFAULTS)).toEqual(DEFAULTS);
	});

	it("drops non-text entries from lists and survives no data at all", () => {
		expect(sanitizeSettings({ guideRead: ["intro", 3, null] }, DEFAULTS).guideRead).toEqual(["intro"]);
		expect(sanitizeSettings(null, DEFAULTS)).toEqual(DEFAULTS);
		expect(sanitizeSettings({ timeDensity: Number.NaN }, DEFAULTS).timeDensity).toBe(1);
	});
});

describe("keepExistingPaths", () => {
	it("keeps a setting whose file or folder still exists and fills in the rest", () => {
		const current = { registryFile: "Sistem/Türler.md", versionsFolder: "Sürümler", exportFolder: "Exports" };
		const proposed = { registryFile: "System/Types.md", versionsFolder: "Versions", exportFolder: "Exports" };
		const exists = (path: string) => path === "Sistem/Türler.md";
		expect(keepExistingPaths(current, proposed, exists)).toEqual({
			registryFile: "Sistem/Türler.md",
			versionsFolder: "Versions",
			exportFolder: "Exports",
		});
	});
});

describe("sanitizeSettings with the plugin's real defaults", () => {
	it("opens a damaged data file with defaults for the damaged fields", async () => {
		const { DEFAULT_SETTINGS } = await import("../src/settingsData");
		const loaded = sanitizeSettings({ auditHidden: "x", guideRead: null, timeDensity: "big", language: "tr" }, DEFAULT_SETTINGS);
		expect(loaded).toEqual({ ...DEFAULT_SETTINGS, language: "tr" });
	});

	it("handles every kind of default the settings use", async () => {
		const { DEFAULT_SETTINGS } = await import("../src/settingsData");
		for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
			const handled = Array.isArray(value) || ["string", "number", "boolean"].includes(typeof value);
			expect(handled, key).toBe(true);
		}
	});
});
