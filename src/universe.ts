import { App, TFile } from "obsidian";
import { asNumber, asNumberOrNull, asString } from "./frontmatter";

/**
 * The universe's single time system, stored in the universe note's frontmatter
 * rather than in plugin settings so that the universe stays self-describing
 * without the plugin.
 */
export interface Time {
	timeName: string;
	timeUnit: string;
	/** Zero point of the in-universe time, expressed as a `time` value. */
	timeEpoch: number;
	/** Days in one in-universe unit — used to place dates inside a year. */
	timeDays: number;
	/**
	 * Marks a time system whose pace an author must set by hand — no fixed
	 * Earth-time ratio applies, so `toEarthTime` never computes one for it.
	 */
	async: boolean;
	/** Earth year the epoch corresponds to. Null disables conversion. */
	earthEpoch: number | null;
	/** Earth years spanned by one in-universe unit. */
	earthRatio: number;
}

export const DEFAULT_TIME: Time = {
	timeName: "",
	timeUnit: "",
	timeEpoch: 0,
	timeDays: 365,
	async: false,
	earthEpoch: null,
	earthRatio: 1,
};

export class Universe {
	constructor(
		private app: App,
		private universeFilePath: string,
	) {}

	setPath(path: string) {
		this.universeFilePath = path;
	}

	get file(): TFile | null {
		return this.app.vault.getFileByPath(this.universeFilePath);
	}

	get name(): string {
		const frontmatter = this.frontmatter();
		const raw = frontmatter?.["universe-name"];
		return typeof raw === "string" && raw.length > 0 ? raw : "";
	}

	private frontmatter(): Record<string, unknown> | undefined {
		const file = this.file;
		if (!file) return undefined;
		return this.app.metadataCache.getFileCache(file)?.frontmatter;
	}

	/** The universe's time system. Falls back to defaults when the universe file or fields are missing. */
	readTime(): Time {
		const frontmatter = this.frontmatter();
		if (!frontmatter) return { ...DEFAULT_TIME };

		return {
			timeName: asString(frontmatter["time-name"]),
			timeUnit: asString(frontmatter["time-unit"]),
			timeEpoch: asNumber(frontmatter["time-epoch"], 0),
			timeDays: asNumber(frontmatter["time-days"], 365),
			async: frontmatter["time-async"] === true,
			earthEpoch: asNumberOrNull(frontmatter["time-earth-epoch"]),
			earthRatio: asNumber(frontmatter["time-earth-ratio"], 1),
		};
	}

	/**
	 * Persists the universe's time system, and clears the old multi-calendar
	 * list so a vault only ever carries one time representation at a time.
	 */
	async writeTime(time: Time): Promise<boolean> {
		const file = this.file;
		if (!file) return false;

		await this.app.fileManager.processFrontMatter(file, (frontmatter: Record<string, unknown>) => {
			frontmatter["time-name"] = time.timeName;
			frontmatter["time-unit"] = time.timeUnit;
			frontmatter["time-epoch"] = time.timeEpoch;
			frontmatter["time-days"] = time.timeDays;
			frontmatter["time-async"] = time.async;
			frontmatter["time-earth-epoch"] = time.earthEpoch;
			frontmatter["time-earth-ratio"] = time.earthRatio;
			delete frontmatter["calendars"];
		});
		return true;
	}

	/**
	 * Converts an in-universe `time` value to its Earth-time reference.
	 * Returns null when the time system has no Earth anchor — either because it
	 * is unset, or because it is marked `async` and only moves at a pace its
	 * author sets by hand — in which case notes carry `earth-time` themselves.
	 */
	toEarthTime(time: number, universeTime = this.readTime()): number | null {
		if (universeTime.async || universeTime.earthEpoch === null) return null;
		return universeTime.earthEpoch + (time - universeTime.timeEpoch) * universeTime.earthRatio;
	}

	/** Default display label for a `time` value when a note has no `time-label`. */
	formatTime(time: number, universeTime = this.readTime()): string {
		const unit = universeTime.timeUnit.trim();
		const name = universeTime.timeName.trim();
		if (name && unit) return `${name} ${unit} ${time}`;
		if (unit) return `${unit} ${time}`;
		return String(time);
	}
}
