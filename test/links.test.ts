import { describe, expect, it } from "vitest";
import { linkPath, linkTarget, linkTargets, linkTo } from "../src/links";
import { makeApp } from "./fakeApp";

describe("linkPath", () => {
	it("strips a heading", () => {
		expect(linkPath("Scene#Part 2")).toBe("Scene");
	});

	it("strips a block reference", () => {
		expect(linkPath("Scene^blk")).toBe("Scene");
	});

	it("returns an empty path for a heading-only link", () => {
		expect(linkPath("#Heading only")).toBe("");
	});
});

describe("linkTarget", () => {
	it("reads a link with heading and alias", () => {
		expect(linkTarget("[[Scene#Part 2|the scene]]")).toBe("Scene");
	});

	it("reads bare text with a block reference", () => {
		expect(linkTarget("Scene^blk")).toBe("Scene");
	});

	it("gives nothing for a heading-only link", () => {
		expect(linkTarget("[[#Heading only]]")).toBe("");
	});

	it("keeps a plain link", () => {
		expect(linkTarget("[[Scene|alias]]")).toBe("Scene");
	});
});

describe("linkTargets", () => {
	it("flattens one nested array level (unquoted YAML [[X]])", () => {
		expect(linkTargets([["Scene"], "[[Other]]"])).toEqual(["Scene", "Other"]);
	});

	it("drops empty entries", () => {
		expect(linkTargets(["[[A]]", "", null])).toEqual(["A"]);
	});

	it("accepts a single value", () => {
		expect(linkTargets("[[A]]")).toEqual(["A"]);
	});
});

describe("review fixes", () => {
	it("flattens an unquoted YAML link list, which nests two levels deep", () => {
		expect(linkTargets([[["X"]], [["Y|al"]]])).toEqual(["X", "Y"]);
	});

	it("drops an alias from bare text too", () => {
		expect(linkTarget("X|al")).toBe("X");
	});
});

describe("linkTo", () => {
	it("names a note by its name when it is the only one", () => {
		const { app, file } = makeApp({ "Act 1/Scene.md": {}, "Other.md": {} });
		expect(linkTo(app, file("Act 1/Scene.md"), "Versions/x.md")).toBe("[[Scene]]");
	});

	it("uses the path when another note shares the name", () => {
		const { app, file } = makeApp({ "Act 1/Scene.md": {}, "Act 2/Scene.md": {} });
		expect(linkTo(app, file("Act 2/Scene.md"), "Versions/x.md")).toBe("[[Act 2/Scene]]");
	});
});

describe("ambiguous names", () => {
	const notes = {
		"Characters/Mira.md": {},
		"Places/Mira.md": {},
		"Tobin.md": {},
		"Lone.md": {},
		"Sub/Lone.md": {},
	};

	it("calls a bare name ambiguous only when several files answer to it", async () => {
		const { isAmbiguousLink } = await import("../src/links");
		const { app } = makeApp(notes);
		expect(isAmbiguousLink(app, "Mira")).toBe(true);
		expect(isAmbiguousLink(app, "mira")).toBe(true);
		expect(isAmbiguousLink(app, "Tobin")).toBe(false);
		// A path names one file.
		expect(isAmbiguousLink(app, "Places/Mira")).toBe(false);
		// A bare name shared with a root note may still mean either (v0.9.6);
		// the root note named with its extension is exact.
		expect(isAmbiguousLink(app, "Lone")).toBe(true);
		expect(isAmbiguousLink(app, "Lone.md")).toBe(false);
	});

	it("lists every file a bare name could mean", async () => {
		const { linkCandidates } = await import("../src/links");
		const { app } = makeApp(notes);
		expect(linkCandidates(app, "Mira").map((file) => file.path).sort()).toEqual(["Characters/Mira.md", "Places/Mira.md"]);
		expect(linkCandidates(app, "Tobin").map((file) => file.path)).toEqual(["Tobin.md"]);
	});
});

describe("recordLink (v0.9.6)", () => {
	it("names a note so no other note, root or not, can be read into it", async () => {
		const { recordLink, isAmbiguousLink } = await import("../src/links");
		const { app, file } = makeApp({ "Mira.md": {}, "Places/Mira.md": {}, "Tobin.md": {} });
		expect(recordLink(app, file("Mira.md"))).toBe("Mira.md");
		expect(recordLink(app, file("Places/Mira.md"))).toBe("Places/Mira");
		expect(recordLink(app, file("Tobin.md"))).toBe("Tobin");
		for (const path of ["Mira.md", "Places/Mira.md", "Tobin.md"]) {
			expect(isAmbiguousLink(app, recordLink(app, file(path)))).toBe(false);
		}
	});
});
