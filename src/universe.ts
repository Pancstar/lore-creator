import { App, TFile } from "obsidian";

/**
 * Calendar definition, stored in the universe note's frontmatter rather than in
 * plugin settings so that the universe stays self-describing without the plugin.
 */
export interface Calendar {
	calendarName: string;
	calendarUnit: string;
	/** Zero point of the in-universe calendar, expressed as a `time` value. */
	calendarEpoch: number;
	/** Days in one in-universe unit — used to place dates inside a year. */
	calendarDays: number;
	/** Earth year the epoch corresponds to. Null disables conversion. */
	earthEpoch: number | null;
	/** Earth years spanned by one in-universe unit. */
	earthRatio: number;
}

export const DEFAULT_CALENDAR: Calendar = {
	calendarName: "",
	calendarUnit: "",
	calendarEpoch: 0,
	calendarDays: 365,
	earthEpoch: null,
	earthRatio: 1,
};

function asNumber(value: unknown, fallback: number): number {
	const parsed = typeof value === "number" ? value : Number.parseFloat(String(value ?? ""));
	return Number.isFinite(parsed) ? parsed : fallback;
}

function asOptionalNumber(value: unknown): number | null {
	if (value === null || value === undefined || value === "") return null;
	const parsed = typeof value === "number" ? value : Number.parseFloat(String(value));
	return Number.isFinite(parsed) ? parsed : null;
}

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

	readCalendar(): Calendar {
		const frontmatter = this.frontmatter();
		if (!frontmatter) return { ...DEFAULT_CALENDAR };
		return {
			calendarName: String(frontmatter["calendar-name"] ?? ""),
			calendarUnit: String(frontmatter["calendar-unit"] ?? ""),
			calendarEpoch: asNumber(frontmatter["calendar-epoch"], 0),
			calendarDays: asNumber(frontmatter["calendar-days"], 365),
			earthEpoch: asOptionalNumber(frontmatter["earth-epoch"]),
			earthRatio: asNumber(frontmatter["earth-ratio"], 1),
		};
	}

	/** Writes calendar fields back into the universe note's frontmatter. */
	async writeCalendar(calendar: Partial<Calendar>): Promise<boolean> {
		const file = this.file;
		if (!file) return false;

		await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
			if (calendar.calendarName !== undefined) frontmatter["calendar-name"] = calendar.calendarName;
			if (calendar.calendarUnit !== undefined) frontmatter["calendar-unit"] = calendar.calendarUnit;
			if (calendar.calendarEpoch !== undefined) frontmatter["calendar-epoch"] = calendar.calendarEpoch;
			if (calendar.calendarDays !== undefined) frontmatter["calendar-days"] = calendar.calendarDays;
			if (calendar.earthEpoch !== undefined) frontmatter["earth-epoch"] = calendar.earthEpoch;
			if (calendar.earthRatio !== undefined) frontmatter["earth-ratio"] = calendar.earthRatio;
		});
		return true;
	}

	/**
	 * Converts an in-universe `time` value to its Earth-time reference.
	 * Returns null when the calendar has no Earth anchor, in which case notes
	 * carry `earth-time` by hand instead.
	 */
	toEarthTime(time: number, calendar = this.readCalendar()): number | null {
		if (calendar.earthEpoch === null) return null;
		return calendar.earthEpoch + (time - calendar.calendarEpoch) * calendar.earthRatio;
	}

	/** Default display label for a `time` value when a note has no `time-label`. */
	formatTime(time: number, calendar = this.readCalendar()): string {
		const unit = calendar.calendarUnit.trim();
		const name = calendar.calendarName.trim();
		if (name && unit) return `${name} ${unit} ${time}`;
		if (unit) return `${unit} ${time}`;
		return String(time);
	}
}
