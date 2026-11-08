import { describe, expect, it } from "vitest";
import { isUnfinished, tracksStatus } from "../src/status";
import { buildTemplate } from "../src/setup/defaults";
import { FALLBACK_TYPES } from "../src/types";

describe("status tracking", () => {
	it("leaves timeline and system notes out of the unfinished list", () => {
		expect(tracksStatus("timeline")).toBe(false);
		expect(tracksStatus("system")).toBe(false);
		expect(tracksStatus("event")).toBe(true);
		expect(isUnfinished({ type: "timeline" })).toBe(false);
		expect(isUnfinished({ type: "timeline", status: "draft" })).toBe(false);
		expect(isUnfinished({ type: "system", status: "partial" })).toBe(false);
	});

	it("counts a story note with no status as a draft, and done as finished", () => {
		expect(isUnfinished({ type: "event" })).toBe(true);
		expect(isUnfinished({ type: "event", status: "partial" })).toBe(true);
		expect(isUnfinished({ type: "event", status: "done" })).toBe(false);
	});

	it("writes no status into a timeline template", () => {
		const timeline = { id: "timeline", tr: "Zaman Çizgisi", en: "Timeline", icon: "🕰️", folder: "", template: "", timeline: false, fields: [] };
		expect(buildTemplate(timeline, "en")).not.toMatch(/^status:/m);
		expect(buildTemplate(FALLBACK_TYPES[0], "en")).toMatch(/^status: draft$/m);
	});
});
