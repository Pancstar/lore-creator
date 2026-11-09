import { describe, expect, it } from "vitest";
import { VersionStore } from "../src/versions/store";
import { makeApp } from "./fakeApp";

const archiveFor = (notes: Record<string, Record<string, unknown>>, path: string) => {
	const { app, file } = makeApp(notes);
	return new VersionStore(app, "Versions").previewCreate(file(path)).archivePath;
};

describe("archive names", () => {
	it("keeps the plain name when the note's name is its own", () => {
		expect(archiveFor({ "Characters/Mira.md": { version: "v1" } }, "Characters/Mira.md")).toBe("Versions/Mira — v1.md");
	});

	it("adds the folder when another note shares the name, so both can be versioned", () => {
		const notes = { "Characters/Mira.md": { version: "v1" }, "Places/Mira.md": { version: "v1" } };
		expect(archiveFor(notes, "Characters/Mira.md")).toBe("Versions/Mira (Characters) — v1.md");
		expect(archiveFor(notes, "Places/Mira.md")).toBe("Versions/Mira (Places) — v1.md");
	});

	it("keeps the version name after the number", () => {
		const notes = { "Characters/Mira.md": { version: "v2", "version-name": "Draft" }, "Places/Mira.md": {} };
		expect(archiveFor(notes, "Characters/Mira.md")).toBe("Versions/Mira (Characters) — v2 Draft.md");
	});

	it("falls back to a number when the note sits at the root or the folder name is taken too", () => {
		const atRoot = { "Mira.md": { version: "v1" }, "Places/Mira.md": {} };
		expect(archiveFor(atRoot, "Mira.md")).toBe("Versions/Mira (2) — v1.md");

		const sameFolderName = {
			"A/Places/Mira.md": { version: "v1" },
			"B/Places/Mira.md": { version: "v1" },
			"Versions/Mira (Places) — v1.md": { version: "v1", "version-of": "[[A/Places/Mira]]" },
		};
		expect(archiveFor(sameFolderName, "B/Places/Mira.md")).toBe("Versions/Mira (2) — v1.md");
	});

	it("never picks a path that is already taken", () => {
		const notes = {
			"Characters/Mira.md": { version: "v1" },
			"Versions/Mira — v1.md": { version: "v1", "version-of": "[[Old/Mira]]" },
		};
		expect(archiveFor(notes, "Characters/Mira.md")).toBe("Versions/Mira (Characters) — v1.md");
	});
});

describe("old records naming a shared name", () => {
	const notes = {
		"Characters/Mira.md": { version: "v2" },
		"Places/Mira.md": { version: "v1" },
		"Tobin.md": { version: "v2" },
		"Versions/Mira — v1.md": { version: "v1", "version-of": "[[Mira]]" },
		"Versions/Tobin — v1.md": { version: "v1", "version-of": "[[Tobin]]" },
		"Versions/Mira (Places) — v0.md": { version: "v0", "version-of": "[[Places/Mira]]" },
	};

	it("offers every note an old bare record could mean, archives left out", () => {
		const { app, file } = makeApp(notes);
		const store = new VersionStore(app, "Versions");
		expect(store.ownerCandidates(file("Versions/Mira — v1.md")).map((f) => f.path).sort()).toEqual([
			"Characters/Mira.md",
			"Places/Mira.md",
		]);
	});

	it("offers nothing when the record already names one note", () => {
		const { app, file } = makeApp(notes);
		const store = new VersionStore(app, "Versions");
		expect(store.ownerCandidates(file("Versions/Tobin — v1.md"))).toEqual([]);
		expect(store.ownerCandidates(file("Versions/Mira (Places) — v0.md"))).toEqual([]);
		expect(store.ownerCandidates(file("Characters/Mira.md"))).toEqual([]);
	});
});

describe("version sets naming a shared name", () => {
	it("lists the set entries several notes answer to", async () => {
		const { VersionSetStore } = await import("../src/versions/sets");
		const { app } = makeApp({
			"Characters/Mira.md": {},
			"Places/Mira.md": {},
			"Tobin.md": {},
			"System/Sets.md": {},
		});
		const sets = new VersionSetStore(app, new VersionStore(app, "Versions"), "System/Sets.md", () => "en");
		const set = {
			id: "a",
			name: "A",
			entries: [
				{ note: "Mira", version: 1 },
				{ note: "Tobin", version: 1 },
				{ note: "Places/Mira", version: 1 },
			],
		};
		expect(sets.ambiguousNotes(set)).toEqual(["Mira"]);
	});
});

describe("fixing old records (review)", () => {
	// settledMetadata times out through window; the fake index answers at once.
	(globalThis as unknown as { window: typeof globalThis }).window ??= globalThis;

	const setsNote = () => ({
		type: "system",
		sets: [
			{ id: "a", name: "A", entries: [{ note: "[[Mira]]", version: "v1" }, { note: "[[Tobin]]", version: "v2" }] },
			{ id: "b", name: "B", entries: [{ note: "[[Mira]]", version: "v3" }] },
		],
	});

	it("rewrites only the chosen set's matching entries, from the note itself, and returns the exact link", async () => {
		const { VersionSetStore } = await import("../src/versions/sets");
		const notes = { "Characters/Mira.md": {}, "Places/Mira.md": {}, "Tobin.md": {}, "System/Sets.md": setsNote() };
		const { app, file } = makeApp(notes);
		const sets = new VersionSetStore(app, new VersionStore(app, "Versions"), "System/Sets.md", () => "en");

		const exact = await sets.setEntryNote("a", "Mira", file("Places/Mira.md"));

		expect(exact).toBe("Places/Mira");
		const stored = notes["System/Sets.md"].sets as { id: string; entries: { note: string }[] }[];
		expect(stored[0].entries.map((entry) => entry.note)).toEqual(["[[Places/Mira]]", "[[Tobin]]"]);
		expect(stored[1].entries.map((entry) => entry.note)).toEqual(["[[Mira]]"]);
	});

	it("keeps an earlier fix when a second one follows before the index catches up", async () => {
		const { VersionSetStore } = await import("../src/versions/sets");
		const notes = {
			"Characters/Mira.md": {},
			"Places/Mira.md": {},
			"A/Tobin.md": {},
			"B/Tobin.md": {},
			"System/Sets.md": setsNote(),
		};
		const { app, file } = makeApp(notes);
		const sets = new VersionSetStore(app, new VersionStore(app, "Versions"), "System/Sets.md", () => "en");

		await sets.setEntryNote("a", "Mira", file("Places/Mira.md"));
		await sets.setEntryNote("a", "Tobin", file("B/Tobin.md"));

		const stored = notes["System/Sets.md"].sets as { entries: { note: string }[] }[];
		expect(stored[0].entries.map((entry) => entry.note)).toEqual(["[[Places/Mira]]", "[[B/Tobin]]"]);
	});

	it("writes an archive's owner as a link no other note can be read into", async () => {
		const notes: Record<string, Record<string, unknown>> = {
			"Mira.md": { version: "v2" },
			"Places/Mira.md": { version: "v1" },
			"Versions/Mira — v1.md": { version: "v1", "version-of": "[[Mira]]" },
		};
		const { app, file } = makeApp(notes);
		const store = new VersionStore(app, "Versions");
		expect(store.ownerCandidates(file("Versions/Mira — v1.md"))).toHaveLength(2);

		await store.setOwner(file("Versions/Mira — v1.md"), file("Mira.md"));

		expect(notes["Versions/Mira — v1.md"]["version-of"]).toBe("[[Mira.md]]");
		expect(store.ownerCandidates(file("Versions/Mira — v1.md"))).toEqual([]);
	});
});

describe("old archives filed under the wrong note (review)", () => {
	it("finds every old archive whose bare record could mean a note of that name", () => {
		const { app } = makeApp({
			"Characters/Mira.md": { version: "v3" },
			"Places/Mira.md": { version: "v3" },
			"Versions/Mira — v1.md": { version: "v1", "version-of": "[[Mira]]" },
			"Versions/Mira — v2.md": { version: "v2", "version-of": "[[mira]]" },
			"Versions/Mira (Places) — v0.md": { version: "v0", "version-of": "[[Places/Mira]]" },
			"Versions/Tobin — v1.md": { version: "v1", "version-of": "[[Tobin]]" },
		});
		const store = new VersionStore(app, "Versions");
		expect(store.ambiguousArchivesNamed("Mira").map((file) => file.path).sort()).toEqual([
			"Versions/Mira — v1.md",
			"Versions/Mira — v2.md",
		]);
		expect(store.ambiguousArchivesNamed("Tobin")).toEqual([]);
	});
});

describe("archive paths (review minors)", () => {
	it("treats a path that differs only in case as taken", () => {
		const notes = {
			"A/Places/Mira.md": { version: "v1" },
			"B/places/mira.md": { version: "v1" },
			"Versions/Mira (Places) — v1.md": { version: "v1", "version-of": "[[A/Places/Mira]]" },
		};
		expect(archiveFor(notes, "B/places/mira.md")).toBe("Versions/mira (2) — v1.md");
	});

	it("refuses to switch when the archive path is no longer the one the dialog showed", async () => {
		const { VersionError } = await import("../src/versions/store");
		const { app, file } = makeApp({
			"Characters/Mira.md": { version: "v2" },
			"Versions/Mira — v1.md": { version: "v1", "version-of": "[[Characters/Mira]]" },
		});
		const store = new VersionStore(app, "Versions");
		await expect(
			store.switchTo(file("Characters/Mira.md"), file("Versions/Mira — v1.md"), "Versions/Somewhere else — v2.md"),
		).rejects.toBeInstanceOf(VersionError);
		await expect(
			store.createVersion(file("Characters/Mira.md"), "", "", "Versions/Somewhere else — v2.md"),
		).rejects.toBeInstanceOf(VersionError);
	});
});

describe("sets that need settling first (live test)", () => {
	it("says so when an entry or an archive of its note has an old shared-name record", async () => {
		const { VersionSetStore } = await import("../src/versions/sets");
		const { app } = makeApp({
			"A/Mira.md": { version: "v2" },
			"B/Mira.md": { version: "v2" },
			"Tobin.md": { version: "v2" },
			"Versions/Mira — v1.md": { version: "v1", "version-of": "[[Mira]]" },
			"Versions/Tobin — v1.md": { version: "v1", "version-of": "[[Tobin]]" },
		});
		const sets = new VersionSetStore(app, new VersionStore(app, "Versions"), "System/Sets.md", () => "en");
		expect(sets.needsSettling({ id: "a", name: "A", entries: [{ note: "Mira", version: 1 }] })).toBe(true);
		expect(sets.needsSettling({ id: "b", name: "B", entries: [{ note: "B/Mira", version: 1 }] })).toBe(true);
		expect(sets.needsSettling({ id: "c", name: "C", entries: [{ note: "Tobin", version: 1 }] })).toBe(false);
	});
});
