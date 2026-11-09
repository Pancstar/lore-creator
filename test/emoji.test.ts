import { describe, expect, it } from "vitest";
import { EMOJI_CATEGORIES, emojiTooltip } from "../src/emoji";

describe("emojiTooltip", () => {
	const entry = EMOJI_CATEGORIES[0].entries[0];

	it("uses the interface language's words", () => {
		expect(emojiTooltip(entry, "tr")).toBe(entry.tr);
		expect(emojiTooltip(entry, "en")).toBe(entry.en);
	});
});
