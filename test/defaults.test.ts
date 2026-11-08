import { describe, expect, it } from "vitest";
import { buildVersionSetsNote, yamlValue } from "../src/setup/defaults";

describe("yamlValue", () => {
	it("quotes every value so YAML reads it back as the same text", () => {
		for (const value of ["yes", "- a", "Ana: 1", " x", "123", "Türler", "null", "a # b"]) {
			const written = yamlValue(value);
			expect(written.startsWith('"'), value).toBe(true);
			expect(JSON.parse(written)).toBe(value);
		}
	});
});

describe("buildVersionSetsNote", () => {
	it("is a system note with an empty list of sets", () => {
		const note = buildVersionSetsNote("en");
		expect(note).toMatch(/^---\ntype: system\n/);
		expect(note).toMatch(/^sets: \[\]$/m);
		expect(buildVersionSetsNote("tr")).toMatch(/Sürüm Setleri/);
	});
});

describe("timeline fields (v0.9.2)", () => {
	it("a template and a note made without one carry the same timeline keys", async () => {
		const { TIMELINE_FIELD_LINES, buildTemplate } = await import("../src/setup/defaults");
		const { buildNoteContent } = await import("../src/noteFactory");
		const type = { id: "event", tr: "Olay", en: "Event", icon: "⚡", folder: "", template: "", timeline: true, fields: [] };
		const keys = (text: string) =>
			text
				.split("\n")
				.map((line) => line.match(/^([a-z-]+):/)?.[1])
				.filter((key): key is string => Boolean(key) && TIMELINE_FIELD_LINES.some((field) => field.startsWith(`${key}:`)));
		const template = buildTemplate(type, "en");
		const note = await buildNoteContent({} as never, "Templates", { type, title: "X", icon: "", iconType: "emoji" });
		expect(keys(note).sort()).toEqual(keys(template).sort());
		expect(keys(template)).toHaveLength(TIMELINE_FIELD_LINES.length);
	});
});
