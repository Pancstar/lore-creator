import { App, Modal, Notice, Setting } from "obsidian";
import type LorePlugin from "../main";
import type { Time } from "../universe";
import { TimeIssue, formatTime, validateTime } from "../time";
import { findDatedNotes, rescaleNotes, undoRescale } from "../timeRescale";
import { SetupModal } from "../setup/wizard";
import { enterSubmits } from "./enterSubmits";

/** Empty text is "not a number", never a silent 0. */
function parseNumber(text: string): number {
	const trimmed = text.trim();
	return trimmed ? Number(trimmed) : Number.NaN;
}

/** Opens the editor, or steers to setup when there is no universe to edit. */
export function openTimeSystemEditor(plugin: LorePlugin, overrides: Partial<Time> = {}): void {
	if (!plugin.universe.file) {
		new Notice(plugin.i18n.t("time.editor.noUniverse"));
		new SetupModal(plugin.app, plugin).open();
		return;
	}
	new TimeSystemModal(plugin.app, plugin, overrides).open();
}

/**
 * One place to shape the universe's time, instead of six hand-typed
 * properties. Built with plain `Setting` rows in a modal on purpose: the
 * declarative settings API breaks when lists inside it update.
 */
export class TimeSystemModal extends Modal {
	private original: Time;
	private draft: Time;
	/** Raw texts, so a half-typed number is shown as an error, not swallowed. */
	private texts: { days: string; earthYear: string; epoch: string; ratio: string };

	private earthEl!: HTMLElement;
	private previewEl!: HTMLElement;
	private errorEls = new Map<TimeIssue, HTMLElement>();
	private inputEls = new Map<TimeIssue, HTMLInputElement>();
	/** "Enter an Earth year first" — shown while epoch and ratio cannot matter. */
	private earthHintEl: HTMLElement | null = null;
	private saveButton: HTMLButtonElement | null = null;
	/** True from Save until the outcome is known, so notes are never rescaled twice. */
	private busy = false;

	constructor(
		app: App,
		private plugin: LorePlugin,
		/** Values newer than the metadata cache, e.g. a just-typed name. */
		overrides: Partial<Time> = {},
	) {
		super(app);
		this.original = { ...this.plugin.universe.readTime(), ...overrides };
		this.draft = { ...this.original };
		this.texts = {
			days: String(this.original.timeDays),
			earthYear: this.original.earthEpoch === null ? "" : String(this.original.earthEpoch),
			epoch: String(this.original.timeEpoch),
			ratio: String(this.original.earthRatio),
		};
	}

	private t(key: string, ...args: string[]): string {
		return this.plugin.i18n.t(key, ...args);
	}

	onOpen() {
		enterSubmits(this.contentEl);
		this.titleEl.setText(this.t("time.editor.title"));
		this.contentEl.addClass("plc-time-system");

		new Setting(this.contentEl)
			.setName(this.t("time.editor.name"))
			.setDesc(this.t("time.editor.name.desc"))
			.addText((text) =>
				text.setValue(this.draft.timeName).onChange((value) => {
					this.draft.timeName = value;
					this.refresh();
				}),
			);

		new Setting(this.contentEl)
			.setName(this.t("time.editor.unit"))
			.setDesc(this.t("time.editor.unit.desc"))
			.addText((text) =>
				text.setValue(this.draft.timeUnit).onChange((value) => {
					this.draft.timeUnit = value;
					this.refresh();
				}),
			);

		this.numberRow(this.contentEl, "days", "time.editor.days", (value) => {
			this.texts.days = value;
		});

		new Setting(this.contentEl)
			.setName(this.t("time.editor.async"))
			.setDesc(this.t("time.editor.async.desc"))
			.addToggle((toggle) =>
				toggle.setValue(this.draft.async).onChange((value) => {
					this.draft.async = value;
					this.refresh();
				}),
			);

		// Earth fields only mean something when the pace is steady.
		this.earthEl = this.contentEl.createDiv({ cls: "plc-time-system-earth" });
		this.numberRow(this.earthEl, "earthEpoch", "time.editor.earthYear", (value) => {
			this.texts.earthYear = value;
		});
		this.numberRow(this.earthEl, "epoch", "time.editor.epoch", (value) => {
			this.texts.epoch = value;
		});
		this.numberRow(this.earthEl, "ratio", "time.editor.ratio", (value) => {
			this.texts.ratio = value;
		});
		this.earthHintEl = this.earthEl.createDiv({
			cls: "setting-item-description plc-time-system-hint",
			text: this.t("time.editor.earthFirst"),
		});

		this.previewEl = this.contentEl.createDiv({ cls: "plc-time-system-preview" });

		new Setting(this.contentEl).addButton((button) => {
			this.saveButton = button.buttonEl;
			button
				.setButtonText(this.t("time.editor.save"))
				.setCta()
				.onClick(() => void this.save());
		});

		this.refresh();
	}

	/** A text row for a number, with its own error line under the description. */
	private numberRow(parent: HTMLElement, issue: TimeIssue, key: string, store: (value: string) => void) {
		const initial =
			issue === "days"
				? this.texts.days
				: issue === "earthEpoch"
					? this.texts.earthYear
					: issue === "epoch"
						? this.texts.epoch
						: this.texts.ratio;

		const setting = new Setting(parent)
			.setName(this.t(key))
			.setDesc(this.t(`${key}.desc`))
			.addText((text) => {
				text.inputEl.inputMode = "decimal";
				this.inputEls.set(issue, text.inputEl);
				text.setValue(initial).onChange((value) => {
					store(value);
					this.refresh();
				});
			});
		this.errorEls.set(issue, setting.descEl.createDiv({ cls: "plc-time-system-error" }));
	}

	/** Re-reads the texts into the draft, then redraws errors, preview and Save. */
	private refresh() {
		this.draft.timeDays = parseNumber(this.texts.days);
		// While async hides the Earth fields, their half-typed contents must not
		// block Save from out of sight.
		this.draft.earthEpoch = this.draft.async
			? this.original.earthEpoch
			: this.texts.earthYear.trim()
				? parseNumber(this.texts.earthYear)
				: null;
		// Epoch and ratio are only read when they can matter; otherwise keep
		// whatever was there so switching async on and off loses nothing.
		const linked = !this.draft.async && this.draft.earthEpoch !== null;
		this.draft.timeEpoch = linked ? parseNumber(this.texts.epoch) : this.original.timeEpoch;
		this.draft.earthRatio = linked ? parseNumber(this.texts.ratio) : this.original.earthRatio;

		this.earthEl.toggleClass("is-hidden", this.draft.async);
		// Without an Earth year the epoch and ratio are ignored, so they cannot
		// be typed into until there is one.
		const hasEarthYear = this.texts.earthYear.trim().length > 0;
		for (const issue of ["epoch", "ratio"] as TimeIssue[]) {
			const input = this.inputEls.get(issue);
			if (input) input.disabled = !hasEarthYear;
		}
		this.earthHintEl?.toggleClass("is-hidden", hasEarthYear);

		const issues = validateTime(this.draft);
		for (const [issue, el] of this.errorEls) {
			el.setText(issues.includes(issue) ? this.t(`time.editor.error.${issue}`) : "");
		}
		this.saveButton?.toggleAttribute("disabled", issues.length > 0 || this.busy);

		this.renderPreview(issues.length === 0);
	}

	private renderPreview(valid: boolean) {
		this.previewEl.empty();
		if (!valid) return;

		const year = this.draft.timeEpoch !== 0 ? Math.floor(this.draft.timeEpoch) : 1;
		const day = Math.min(100, this.draft.timeDays);
		const sample = year + (day - 1) / this.draft.timeDays;

		const parts = [
			this.t("time.editor.preview", formatTime(sample, this.draft, "date", this.plugin.language)),
			this.t("time.editor.previewStored", String(Number(sample.toFixed(6)))),
		];
		const earth = this.plugin.universe.toEarthTime(sample, this.draft);
		if (earth !== null) parts.push(`${this.t("time.earth")} ${Number(earth.toFixed(2))}`);
		this.previewEl.setText(parts.join(" · "));
	}

	private setBusy(busy: boolean) {
		this.busy = busy;
		this.refresh();
	}

	private async save() {
		if (this.busy || validateTime(this.draft).length > 0) return;
		const next: Time = { ...this.draft };
		this.setBusy(true);

		const daysChanged = next.timeDays !== this.original.timeDays;
		const dated = daysChanged ? findDatedNotes(this.app) : [];
		if (dated.length === 0) {
			await this.finish(next, this.t("time.editor.saved"));
			return;
		}

		new RescaleChoiceModal(this.app, this.plugin, dated.length, (choice) => {
			if (choice === "rescale") void this.rescaleAndWrite(next, dated);
			else if (choice === "keep") void this.finish(next, this.t("time.editor.saved"));
			else this.setBusy(false);
		}).open();
	}

	private async rescaleAndWrite(next: Time, dated: ReturnType<typeof findDatedNotes>) {
		const result = await rescaleNotes(this.app, dated, this.original.timeDays, next.timeDays);
		if (result.failed) {
			console.error("Lore Creator: rescaling notes failed", result.error);
			this.reportStuck(result.unrestored);
			new Notice(this.t("time.editor.rescaleFailed", result.failed.path), 8000);
			this.setBusy(false);
			return;
		}

		const saved = await this.trySave(next);
		if (!saved) {
			// The notes now speak the new day count but the universe does not:
			// put them back so the two agree again.
			this.reportStuck(await undoRescale(this.app, result));
			new Notice(this.t("time.editor.saveFailed"), 8000);
			this.setBusy(false);
			return;
		}
		new Notice(this.t("time.editor.rescaled", String(result.updated)));
		this.close();
	}

	/** Saves without touching notes, then closes, or reports and stays open. */
	private async finish(next: Time, message: string) {
		if (await this.trySave(next)) {
			new Notice(message);
			this.close();
			return;
		}
		new Notice(this.t("time.editor.saveFailed"), 8000);
		this.setBusy(false);
	}

	/** False when the universe note is gone or the write throws. */
	private async trySave(next: Time): Promise<boolean> {
		try {
			return await this.plugin.universe.writeTime(next);
		} catch (error) {
			console.error("Lore Creator: could not save the time system", error);
			return false;
		}
	}

	private reportStuck(files: ReturnType<typeof findDatedNotes>) {
		if (files.length === 0) return;
		const paths = files.map((file) => file.path).join(", ");
		new Notice(this.t("time.editor.unrestored", paths), 0);
	}

	onClose() {
		this.contentEl.empty();
	}
}

type RescaleChoice = "rescale" | "keep" | "cancel";

/** Three-way question: a plain confirm cannot offer "save but leave notes". */
class RescaleChoiceModal extends Modal {
	private chosen: RescaleChoice = "cancel";

	constructor(
		app: App,
		private plugin: LorePlugin,
		private count: number,
		private onChoose: (choice: RescaleChoice) => void,
	) {
		super(app);
	}

	onOpen() {
		const t = (key: string, ...args: string[]) => this.plugin.i18n.t(key, ...args);
		this.titleEl.setText(t("time.editor.rescale.title"));
		this.contentEl.createEl("p", { text: t("time.editor.rescale.body", String(this.count)) });

		new Setting(this.contentEl)
			.addButton((button) =>
				button.setButtonText(t("common.cancel")).onClick(() => this.choose("cancel")),
			)
			.addButton((button) =>
				button.setButtonText(t("time.editor.rescale.keep")).onClick(() => this.choose("keep")),
			)
			.addButton((button) =>
				button
					.setButtonText(t("time.editor.rescale.do"))
					.setCta()
					.onClick(() => this.choose("rescale")),
			);
	}

	private choose(choice: RescaleChoice) {
		this.chosen = choice;
		this.close();
	}

	onClose() {
		this.contentEl.empty();
		this.onChoose(this.chosen);
	}
}
