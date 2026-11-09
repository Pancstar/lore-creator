import type { Time } from "./universe";

export type TimePrecision = "year" | "date" | "datetime";

export const TIME_PRECISIONS: TimePrecision[] = ["year", "date", "datetime"];

export function isTimePrecision(value: unknown): value is TimePrecision {
	return typeof value === "string" && (TIME_PRECISIONS as string[]).includes(value);
}

/**
 * A point in the universe's own time system, before it is flattened into the
 * single sortable number that notes actually store.
 */
export interface TimeParts {
	year: number;
	/** 1-based day within the year. */
	day: number;
	hour: number;
	minute: number;
}

export const EMPTY_PARTS: TimeParts = { year: 0, day: 1, hour: 0, minute: 0 };

const MINUTES_PER_DAY = 24 * 60;

/** Only `timeDays` matters to the day maths; the rest just fills the shape. */
const DEFAULT_TIME_SHAPE: Time = {
	timeName: "",
	timeUnit: "",
	timeEpoch: 0,
	timeDays: 365,
	async: false,
	earthEpoch: null,
	earthRatio: 1,
};

export function daysPerYear(time: Time): number {
	return time.timeDays > 0 ? time.timeDays : 365;
}

/**
 * Flattens time parts into the sortable `time` value. Everything below the
 * year lives in the fractional part, so ordering works regardless of how exotic
 * the universe's time system is.
 */
export function partsToTime(parts: TimeParts, time: Time, precision: TimePrecision): number {
	if (precision === "year") return parts.year;

	const days = daysPerYear(time);
	const dayOffset = (Math.max(1, parts.day) - 1) / days;

	if (precision === "date") return parts.year + dayOffset;

	const minuteOffset = (parts.hour * 60 + parts.minute) / (days * MINUTES_PER_DAY);
	return parts.year + dayOffset + minuteOffset;
}

/** Inverse of `partsToTime`, for populating the editor with an existing value. */
export function timeToParts(value: number, time: Time, precision: TimePrecision): TimeParts {
	// Year precision keeps the whole value: a fractional time (e.g. written by a
	// timeline drag) must survive a round trip through the editor untouched.
	if (precision === "year") return { year: value, day: 1, hour: 0, minute: 0 };

	let year = Math.floor(value);
	const days = daysPerYear(time);
	const remainder = value - year;

	let totalMinutes = Math.round(remainder * days * MINUTES_PER_DAY);
	// Rounding a value just below the next year must not yield day `days + 1`.
	if (totalMinutes >= days * MINUTES_PER_DAY) {
		year += 1;
		totalMinutes = 0;
	}
	const dayIndex = Math.floor(totalMinutes / MINUTES_PER_DAY);
	const withinDay = totalMinutes - dayIndex * MINUTES_PER_DAY;

	return {
		year,
		day: dayIndex + 1,
		hour: precision === "datetime" ? Math.floor(withinDay / 60) : 0,
		minute: precision === "datetime" ? withinDay % 60 : 0,
	};
}

function pad(value: number): string {
	return value < 10 ? `0${value}` : String(value);
}

/**
 * Builds the human-readable label stored alongside `time`. Authors are free to
 * overwrite it; this is only the starting point. `dayLabel` is the interface
 * language's wording for a day, with `{0}` for its number (`time.dayLabel`).
 */
export function formatLabel(
	parts: TimeParts,
	time: Time,
	precision: TimePrecision,
	dayLabel: string,
): string {
	const name = time.timeName.trim();
	const unit = time.timeUnit.trim();

	const head = [name, unit, String(Math.floor(parts.year))].filter((piece) => piece.length > 0).join(" ");
	if (precision === "year") return head;

	const dayPart = dayLabel.split("{0}").join(String(parts.day));
	if (precision === "date") return `${head}, ${dayPart}`;

	return `${head}, ${dayPart} ${pad(parts.hour)}:${pad(parts.minute)}`;
}

/** A `time` value in the universe's own words, at the note's precision. */
export function formatTime(
	value: number,
	time: Time,
	precision: TimePrecision,
	dayLabel: string,
): string {
	return formatLabel(timeToParts(value, time, precision), time, precision, dayLabel);
}

/**
 * Re-encodes a stored value for a new day count so its year, day and clock
 * stay the same. Days past the new count land on the new last day. Year
 * precision has no day to keep: its fraction means the same under any count.
 */
export function rescaleTime(
	value: number,
	oldDays: number,
	newDays: number,
	precision: TimePrecision,
): number {
	if (precision === "year") return value;

	const parts = timeToParts(value, { ...DEFAULT_TIME_SHAPE, timeDays: oldDays }, precision);
	const days = newDays > 0 ? newDays : 365;
	parts.day = Math.min(days, Math.max(1, parts.day));
	return partsToTime(parts, { ...DEFAULT_TIME_SHAPE, timeDays: days }, precision);
}

/**
 * Reads a date typed in the universe's terms: `year` or `year/day`. Returns
 * null for empty or unreadable input, so callers can treat it as "no bound".
 */
export function parseUniverseDate(text: string, time: Time): number | null {
	const trimmed = text.trim();
	if (!trimmed) return null;

	const [yearText, dayText, ...rest] = trimmed.split("/").map((piece) => piece.trim());
	if (rest.length > 0 || !yearText) return null;

	const year = Number(yearText);
	if (!Number.isFinite(year)) return null;
	if (dayText === undefined) return year;

	const day = Number(dayText);
	if (!Number.isInteger(day) || !Number.isInteger(year)) return null;

	const clamped = Math.min(daysPerYear(time), Math.max(1, day));
	return partsToTime({ year, day: clamped, hour: 0, minute: 0 }, time, "date");
}

export type TimeIssue = "days" | "ratio" | "epoch" | "earthEpoch";

/** Everything that would make the time system unusable, for the editor and wizard. */
export function validateTime(time: Time): TimeIssue[] {
	const issues: TimeIssue[] = [];
	if (!Number.isInteger(time.timeDays) || time.timeDays < 1) issues.push("days");
	if (!Number.isFinite(time.timeEpoch)) issues.push("epoch");
	if (time.earthEpoch !== null && !Number.isFinite(time.earthEpoch)) issues.push("earthEpoch");

	const converts = !time.async && time.earthEpoch !== null;
	if (converts && (!Number.isFinite(time.earthRatio) || time.earthRatio <= 0)) issues.push("ratio");
	return issues;
}
