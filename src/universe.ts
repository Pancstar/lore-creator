import { App, TFile } from "obsidian";
import { asNumber, asNumberOrNull, asString } from "./frontmatter";

/**
 * Calendar definition, stored in the universe note's frontmatter rather than in
 * plugin settings so that the universe stays self-describing without the plugin.
 * A universe can hold several of these, each fully independent.
 */
export interface Calendar {
	/** Stable id notes reference in `calendar-id`; never shown to the reader. */
	id: string;
	calendarName: string;
	calendarUnit: string;
	/** Zero point of the in-universe calendar, expressed as a `time` value. */
	calendarEpoch: number;
	/** Days in one in-universe unit — used to place dates inside a year. */
	calendarDays: number;
	/**
	 * Marks a calendar whose pace an author must set by hand — no fixed
	 * Earth-time ratio applies, so `toEarthTime` never computes one for it.
	 */
	async: boolean;
	/** Earth year the epoch corresponds to. Null disables conversion. */
	earthEpoch: number | null;
	/** Earth years spanned by one in-universe unit. */
	earthRatio: number;
}

export const DEFAULT_CALENDAR_ID = "default";

export const DEFAULT_CALENDAR: Calendar = {
	id: DEFAULT_CALENDAR_ID,
	calendarName: "",
	calendarUnit: "",
	calendarEpoch: 0,
	calendarDays: 365,
	async: false,
	earthEpoch: null,
	earthRatio: 1,
};

/** Generates a short id that won't collide with the calendars already on hand. */
export function newCalendarId(existing: Calendar[]): string {
	const taken = new Set(existing.map((calendar) => calendar.id));
	let id: string;
	do {
		id = `cal-${Math.random().toString(36).slice(2, 8)}`;
	} while (taken.has(id));
	return id;
}

function parseCalendarEntry(raw: unknown, fallbackId: string): Calendar {
	const record = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {};
	return {
		id: asString(record.id).trim() || fallbackId,
		calendarName: asString(record["calendar-name"]),
		calendarUnit: asString(record["calendar-unit"]),
		calendarEpoch: asNumber(record["calendar-epoch"], 0),
		calendarDays: asNumber(record["calendar-days"], 365),
		async: record["async"] === true,
		earthEpoch: asNumberOrNull(record["earth-epoch"]),
		earthRatio: asNumber(record["earth-ratio"], 1),
	};
}

function calendarToRecord(calendar: Calendar): Record<string, unknown> {
	return {
		id: calendar.id,
		"calendar-name": calendar.calendarName,
		"calendar-unit": calendar.calendarUnit,
		"calendar-epoch": calendar.calendarEpoch,
		"calendar-days": calendar.calendarDays,
		async: calendar.async,
		"earth-epoch": calendar.earthEpoch,
		"earth-ratio": calendar.earthRatio,
	};
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

	/**
	 * All calendars defined on the universe. Falls back to a single legacy
	 * calendar read from the old singular fields, so vaults written before
	 * multi-calendar support keep working until the settings tab saves once
	 * and upgrades the frontmatter to the `calendars` list.
	 */
	readCalendars(): Calendar[] {
		const frontmatter = this.frontmatter();
		if (!frontmatter) return [{ ...DEFAULT_CALENDAR }];

		const list = frontmatter["calendars"];
		if (Array.isArray(list) && list.length > 0) {
			return list.map((entry, index) => parseCalendarEntry(entry, `cal-${index}`));
		}

		// Legacy single-calendar frontmatter — read it as the sole calendar.
		if (frontmatter["calendar-name"] !== undefined || frontmatter["calendar-days"] !== undefined) {
			return [
				{
					id: DEFAULT_CALENDAR_ID,
					calendarName: asString(frontmatter["calendar-name"]),
					calendarUnit: asString(frontmatter["calendar-unit"]),
					calendarEpoch: asNumber(frontmatter["calendar-epoch"], 0),
					calendarDays: asNumber(frontmatter["calendar-days"], 365),
					async: false,
					earthEpoch: asNumberOrNull(frontmatter["earth-epoch"]),
					earthRatio: asNumber(frontmatter["earth-ratio"], 1),
				},
			];
		}

		return [{ ...DEFAULT_CALENDAR }];
	}

	/** A single calendar by id — the first calendar when `id` is missing or unknown. */
	readCalendar(id?: string | null): Calendar {
		const calendars = this.readCalendars();
		if (id) {
			const found = calendars.find((calendar) => calendar.id === id);
			if (found) return found;
		}
		return calendars[0] ?? { ...DEFAULT_CALENDAR };
	}

	/**
	 * Replaces the whole calendar list, and clears the legacy singular fields so
	 * a vault only ever carries one calendar representation at a time.
	 */
	async writeCalendars(calendars: Calendar[]): Promise<boolean> {
		const file = this.file;
		if (!file) return false;

		await this.app.fileManager.processFrontMatter(file, (frontmatter: Record<string, unknown>) => {
			frontmatter["calendars"] = calendars.map(calendarToRecord);
			delete frontmatter["calendar-name"];
			delete frontmatter["calendar-unit"];
			delete frontmatter["calendar-epoch"];
			delete frontmatter["calendar-days"];
			delete frontmatter["earth-epoch"];
			delete frontmatter["earth-ratio"];
		});
		return true;
	}

	/**
	 * Converts an in-universe `time` value to its Earth-time reference.
	 * Returns null when the calendar has no Earth anchor — either because it is
	 * unset, or because the calendar is marked `async` and only moves at a pace
	 * its author sets by hand — in which case notes carry `earth-time` themselves.
	 */
	toEarthTime(time: number, calendar = this.readCalendar()): number | null {
		if (calendar.async || calendar.earthEpoch === null) return null;
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
