import { describe, expect, it } from "vitest";
import { TimeNameEdits } from "../src/timeNameEdits";

/** A universe name held in memory; `lagging` keeps reads on the old value, like a slow index. */
function universe(initial: string, options: { fail?: boolean; lagging?: boolean } = {}) {
	let saved = initial;
	let visible = initial;
	const writes: string[] = [];
	return {
		writes,
		read: () => visible,
		write: async (name: string) => {
			if (options.fail) return false;
			writes.push(name);
			saved = name;
			if (!options.lagging) visible = saved;
			return true;
		},
	};
}

describe("TimeNameEdits", () => {
	it("reports the name before typing began and the one finally saved, once", async () => {
		const u = universe("Xen");
		const edits = new TimeNameEdits(u.read, u.write);
		edits.type("Xe");
		await edits.flush();
		edits.type("Isles");

		expect(await edits.finish()).toEqual({ before: "Xen", after: "Isles" });
		expect(await edits.finish()).toBeNull();
		expect(u.writes).toEqual(["Xe", "Isles"]);
	});

	it("knows the saved name even when the index has not caught up", async () => {
		const u = universe("Xen", { lagging: true });
		const edits = new TimeNameEdits(u.read, u.write);
		edits.type("Isles");
		await edits.flush();

		expect(edits.current).toBe("Isles");
		expect(await edits.finish()).toEqual({ before: "Xen", after: "Isles" });
	});

	it("waits for a write already under way before finishing", async () => {
		const u = universe("Xen", { lagging: true });
		const edits = new TimeNameEdits(u.read, u.write);
		edits.type("Isles");
		const debounced = edits.flush();
		const finished = edits.finish();
		await debounced;
		expect(await finished).toEqual({ before: "Xen", after: "Isles" });
	});

	it("reports nothing when the name was typed back or never touched", async () => {
		const u = universe("Xen");
		const edits = new TimeNameEdits(u.read, u.write);
		expect(await edits.finish()).toBeNull();

		edits.type("Isles");
		await edits.flush();
		edits.type("Xen");
		expect(await edits.finish()).toBeNull();
	});

	it("throws when the name could not be saved, and reports no change", async () => {
		const u = universe("Xen", { fail: true });
		const edits = new TimeNameEdits(u.read, u.write);
		edits.type("Isles");
		await expect(edits.finish()).rejects.toThrow();
		expect(edits.current).toBe("Xen");
	});

	it("names what the labels were written under while typing goes on", () => {
		const u = universe("Xen");
		const edits = new TimeNameEdits(u.read, u.write);
		expect(edits.labelName).toBe("Xen");
		edits.type("Isles");
		expect(edits.labelName).toBe("Xen");
		expect(edits.current).toBe("Isles");
	});
});

describe("TimeNameEdits hand-off (review)", () => {
	it("forgets the visit once the time editor takes over the labels", async () => {
		const u = universe("Xen");
		const edits = new TimeNameEdits(u.read, u.write);
		edits.type("Isles");
		await edits.handOff();
		expect(u.writes).toEqual(["Isles"]);
		expect(await edits.finish()).toBeNull();
	});
});

describe("TimeNameEdits after a failed save (review)", () => {
	it("still saves what is typed next", async () => {
		let fail = true;
		const writes: string[] = [];
		const edits = new TimeNameEdits(
			() => "Xen",
			async (name) => {
				if (fail) return false;
				writes.push(name);
				return true;
			},
		);
		edits.type("Isles");
		await expect(edits.flush()).rejects.toThrow();
		fail = false;
		edits.type("Isles");
		await edits.flush();
		expect(writes).toEqual(["Isles"]);
	});
});
