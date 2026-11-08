import { describe, expect, it } from "vitest";
import { linkPath, linkTarget, linkTargets } from "../src/links";

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
