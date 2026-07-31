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

function daysPerYear(time: Time): number {
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
	const year = Math.floor(value);
	if (precision === "year") return { year, day: 1, hour: 0, minute: 0 };

	const days = daysPerYear(time);
	const remainder = value - year;

	const totalMinutes = Math.round(remainder * days * MINUTES_PER_DAY);
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
 * overwrite it; this is only the starting point.
 */
export function formatLabel(
	parts: TimeParts,
	time: Time,
	precision: TimePrecision,
	language: "tr" | "en",
): string {
	const name = time.timeName.trim();
	const unit = time.timeUnit.trim();

	const head = [name, unit, String(parts.year)].filter((piece) => piece.length > 0).join(" ");
	if (precision === "year") return head;

	const dayWord = language === "tr" ? "gün" : "day";
	const dayPart = language === "tr" ? `${parts.day}. ${dayWord}` : `${dayWord} ${parts.day}`;
	if (precision === "date") return `${head}, ${dayPart}`;

	return `${head}, ${dayPart} ${pad(parts.hour)}:${pad(parts.minute)}`;
}
