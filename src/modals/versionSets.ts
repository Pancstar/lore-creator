import { App, Modal, Notice, Setting, TFile, setIcon } from "obsidian";
import type LorePlugin from "../main";
import type { VersionSet, VersionSetStore } from "../versions/sets";
import { ConfirmModal } from "./confirm";
import { askOwner } from "./resolveOwner";
import { LiveRefresh } from "./liveRefresh";
import { enterSubmits } from "./enterSubmits";
import { applyLang } from "../i18n";
import { linkCandidates } from "../links";
import { isTemplate } from "../scope";

type ApplyResult = Awaited<ReturnType<VersionSetStore["apply"]>>;

/**
 * Manages named snapshots of which version of each note is active, so a whole
 * revision of the story can be stepped into and out of in one move.
 */
export class VersionSetsModal extends Modal {
	private live = new LiveRefresh(this.app, () => this.renderBody());
	/** Old records are being settled with the author; another apply waits. */
	private resolving = false;
	private closed = false;

	constructor(
		app: App,
		private plugin: LorePlugin,
	) {
		super(app);
	}

	onOpen() {
		applyLang(this.modalEl);
		enterSubmits(this.contentEl);
		this.titleEl.setText(this.plugin.i18n.t("sets.title"));
		this.contentEl.addClass("plc-versions");
		this.live.start();
		this.renderBody();
	}

	private renderBody() {
		const t = (key: string, ...args: string[]) => this.plugin.i18n.t(key, ...args);
		this.contentEl.empty();

		const versioned = this.plugin.versionSets.versionedNotes();
		this.contentEl.createEl("p", {
			text: t("sets.subtitle", String(versioned.length)),
			cls: "setting-item-description",
		});

		const sets = this.plugin.versionSets.list();
		if (sets.length === 0) {
			this.contentEl.createEl("p", { text: t("sets.empty"), cls: "plc-version-note" });
		} else {
			const listEl = this.contentEl.createDiv({ cls: "plc-version-list" });
			for (const set of sets) this.renderSet(listEl, set);
		}

		let name = "";
		new Setting(this.contentEl)
			.setName(t("sets.capture"))
			.setDesc(t("sets.capture.desc"))
			.addText((text) =>
				text.setPlaceholder(t("sets.capturePlaceholder")).onChange((value) => {
					name = value;
				}),
			)
			.addButton((button) =>
				button
					.setButtonText(t("sets.captureButton"))
					.setCta()
					.onClick(() => void this.runCapture(name, versioned.length)),
			);
	}

	private renderSet(parent: HTMLElement, set: VersionSet) {
		const t = (key: string, ...args: string[]) => this.plugin.i18n.t(key, ...args);
		const plan = this.plugin.versionSets.plan(set);

		const rowEl = parent.createDiv({ cls: "plc-version-row" });
		const textEl = rowEl.createDiv({ cls: "plc-version-text" });
		textEl.createDiv({ cls: "plc-version-label", text: set.name });

		const summary =
			plan.changes.length === 0
				? t("sets.alreadyActive")
				: t("sets.wouldChange", String(plan.changes.length));
		textEl.createDiv({ cls: "plc-version-note", text: summary });

		if (plan.missing.length > 0) {
			textEl.createDiv({
				cls: "plc-version-note plc-warning",
				text: t("sets.missing", plan.missing.join(", ")),
			});
		}

		const actionsEl = rowEl.createDiv({ cls: "plc-version-actions" });

		// Old records may hide changes this plan cannot see yet, so the button
		// stays reachable while they wait to be settled.
		if (plan.changes.length > 0 || this.plugin.versionSets.needsSettling(set)) {
			const applyButton = actionsEl.createEl("button", {
				cls: "clickable-icon",
				attr: { "aria-label": t("sets.apply"), title: t("sets.apply") },
			});
			setIcon(applyButton, "play");
			applyButton.addEventListener("click", () => this.confirmApply(set));
		}

		const deleteButton = actionsEl.createEl("button", {
			cls: "clickable-icon",
			attr: { "aria-label": t("sets.delete"), title: t("sets.delete") },
		});
		setIcon(deleteButton, "trash-2");
		deleteButton.addEventListener("click", () => this.confirmDelete(set));
	}

	private async runCapture(name: string, count: number) {
		const t = (key: string, ...args: string[]) => this.plugin.i18n.t(key, ...args);

		if (!name.trim()) {
			new Notice(t("sets.nameRequired"));
			return;
		}
		if (count === 0) {
			new Notice(t("sets.nothingToCapture"));
			return;
		}

		try {
			const ran = await this.live.run(async () => {
				await this.plugin.versionSets.capture(name);
			});
			if (ran) new Notice(t("sets.captured", name));
		} catch (error) {
			console.error("Lore Creator: could not capture version set", error);
			new Notice(t("version.error.generic"));
		}
	}

	private confirmApply(set: VersionSet) {
		if (this.live.busy || this.resolving) return;
		this.resolving = true;
		void this.settleOwners(set).finally(() => (this.resolving = false));
	}

	/**
	 * Old sets and archives may name a note by a name several notes share.
	 * Each one is settled with the author first, so the plan below switches
	 * the notes they mean. Backing out of any question applies nothing.
	 */
	private async settleOwners(set: VersionSet) {
		const t = (key: string, ...args: string[]) => this.plugin.i18n.t(key, ...args);
		const { versions, versionSets } = this.plugin;
		const ask = (body: string, candidates: TFile[]) =>
			askOwner(this.app, {
				title: t("owner.title"),
				body,
				candidates,
				chooseLabel: t("owner.choose"),
				cancelLabel: t("common.cancel"),
			});

		try {
			// The set is carried forward in memory as it is fixed, so what is
			// applied is what was chosen, whenever Obsidian's index catches up.
			let current = set;
			for (const note of versionSets.ambiguousNotes(current)) {
				const candidates = linkCandidates(this.app, note).filter(
					(file) => !isTemplate(file) && !versions.isArchived(file),
				);
				// Nothing to choose from: the plan lists the entry as missing.
				if (candidates.length === 0) continue;
				const owner = await ask(t("owner.set.body", set.name, note), candidates);
				if (!owner || this.closed) return;
				const exact = await versionSets.setEntryNote(current.id, note, owner);
				current = {
					...current,
					entries: current.entries.map((entry) => (entry.note === note ? { ...entry, note: exact } : entry)),
				};
			}

			// Every old archive that could belong to a note this set switches,
			// including ones Obsidian filed under another note of the same name.
			const asked = new Set<string>();
			for (const entry of current.entries) {
				const active = versionSets.noteFor(entry);
				if (!active) continue;
				for (const archive of versions.ambiguousArchivesNamed(active.basename)) {
					if (asked.has(archive.path)) continue;
					asked.add(archive.path);
					const candidates = versions.ownerCandidates(archive);
					if (candidates.length === 0) continue;
					const owner = await ask(t("owner.archive.body", archive.path, active.basename), candidates);
					if (!owner || this.closed) return;
					await versions.setOwner(archive, owner);
				}
			}
			if (!this.closed) this.showApplyConfirm(current);
		} catch (error) {
			console.error("Lore Creator: could not fix an old record", error);
			new Notice(t("owner.fixFailed"));
		}
	}

	private showApplyConfirm(set: VersionSet) {
		const t = (key: string, ...args: string[]) => this.plugin.i18n.t(key, ...args);
		if (this.live.busy) return;
		const plan = this.plugin.versionSets.plan(set);
		if (plan.changes.length === 0) {
			// Settling the records showed there is nothing to switch.
			const missing = plan.missing.length > 0 ? ` ${t("sets.missing", plan.missing.join(", "))}` : "";
			new Notice(t("sets.alreadyActive") + missing);
			this.renderBody();
			return;
		}

		// Applying a set moves several files at once, so the dialog spells out
		// every note it will touch rather than just counting them.
		const details = plan.changes.map((change) =>
			t("sets.detail.change", change.active.basename, `v${change.from}`, `v${change.to}`),
		);
		if (plan.unchanged > 0) details.push(t("sets.detail.unchanged", String(plan.unchanged)));
		if (plan.missing.length > 0) details.push(t("sets.detail.skipped", plan.missing.join(", ")));

		new ConfirmModal(
			this.app,
			{
				title: t("sets.apply"),
				body: t("sets.apply.body", set.name, String(plan.changes.length)),
				details,
				confirmLabel: t("sets.apply"),
				cancelLabel: t("common.cancel"),
			},
			() => void this.runApply(set),
		).open();
	}

	private async runApply(set: VersionSet) {
		const t = (key: string, ...args: string[]) => this.plugin.i18n.t(key, ...args);
		const outcome: { result: ApplyResult | null } = { result: null };
		try {
			await this.live.run(async () => {
				outcome.result = await this.plugin.versionSets.apply(this.plugin.versionSets.plan(set));
			});
		} catch (error) {
			console.error("Lore Creator: could not apply version set", error);
			new Notice(t("version.error.generic"));
			return;
		}
		const result = outcome.result;
		if (!result) return;

		if (result.failed) {
			console.error("Lore Creator: applying set stopped early", result.error);
			new Notice(
				t("sets.partial", String(result.applied), result.failed.active.basename),
				8000,
			);
		} else {
			new Notice(t("sets.applied", String(result.applied)));
		}
	}

	private confirmDelete(set: VersionSet) {
		const t = (key: string, ...args: string[]) => this.plugin.i18n.t(key, ...args);
		if (this.live.busy) return;

		new ConfirmModal(
			this.app,
			{
				title: t("sets.delete"),
				body: t("sets.delete.body", set.name),
				details: [t("sets.delete.detail")],
				confirmLabel: t("sets.delete"),
				cancelLabel: t("common.cancel"),
				destructive: true,
			},
			() => void this.runDelete(set),
		).open();
	}

	private async runDelete(set: VersionSet) {
		const t = (key: string, ...args: string[]) => this.plugin.i18n.t(key, ...args);
		try {
			const ran = await this.live.run(() => this.plugin.versionSets.remove(set.id));
			if (ran) new Notice(t("sets.deleted"));
		} catch (error) {
			console.error("Lore Creator: could not delete version set", error);
			new Notice(t("version.error.generic"));
		}
	}

	onClose() {
		this.closed = true;
		this.live.stop();
		this.contentEl.empty();
	}
}
