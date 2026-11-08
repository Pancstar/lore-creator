import { describe, expect, it } from "vitest";
import { collectLaws } from "../src/lawsModel";
import { TimelineModel } from "../src/timeline/model";
import { makeApp, registryNote } from "./fakeApp";

describe("collectLaws", () => {
	it("lists a note once even when it names the same law twice", () => {
		TimelineModel.invalidate();
		const { app } = makeApp({
			"System/Types.md": registryNote(),
			"Law.md": { type: "law" },
			"Kai.md": { type: "character", laws: ["[[Law]]", "[[Law]]"], "breaks-law": ["[[Law]]", "[[Law]]"] },
		});
		const [law] = collectLaws(app, new TimelineModel(app));
		expect(law.boundBy.map((file) => file.basename)).toEqual(["Kai"]);
		expect(law.brokenBy.map((file) => file.basename)).toEqual(["Kai"]);
	});

	it("resolves timeline-scope links to timeline ids", () => {
		TimelineModel.invalidate();
		const { app } = makeApp({
			"System/Types.md": registryNote(),
			"Alt line.md": { type: "timeline", "timeline-id": "alt" },
			"Law.md": { type: "law", "timeline-scope": ["[[Alt line]]", "main"] },
		});
		const [law] = collectLaws(app, new TimelineModel(app));
		expect(law.timelineScope).toEqual(["alt", "main"]);
	});
});

describe("TimelineModel.resolveTimelineId", () => {
	it("maps a link to a timeline note onto its id and leaves bare ids alone", () => {
		TimelineModel.invalidate();
		const { app } = makeApp({
			"Alt line.md": { type: "timeline", "timeline-id": "alt" },
			"Scene.md": { type: "event" },
		});
		const model = new TimelineModel(app);
		expect(model.resolveTimelineId("[[Alt line]]", "Law.md")).toBe("alt");
		expect(model.resolveTimelineId("main", "Law.md")).toBe("main");
		expect(model.resolveTimelineId("[[Scene]]", "Law.md")).toBe("Scene");
	});
});

describe("resolveTimelineId: bare ids win over same-named files", () => {
	it("keeps a bare id that is a known timeline even when a file shares the name", () => {
		TimelineModel.invalidate();
		const { app } = makeApp({
			"main.md": { type: "timeline", "timeline-id": "primary" },
			"Other.md": { type: "timeline", "timeline-id": "main" },
		});
		const model = new TimelineModel(app);
		expect(model.resolveTimelineId("main", "Law.md")).toBe("main");
		expect(model.resolveTimelineId("[[main]]", "Law.md")).toBe("primary");
	});
});
