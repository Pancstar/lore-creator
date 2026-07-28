import { App, Modal, Notice, Setting, TFile } from "obsidian";
import type LorePlugin from "../main";
import { ConfirmModal } from "./confirm";
import { asString } from "../frontmatter";

interface FlowEntry {
	id: string;
	name: string;
}

/** Flow entries are `id`, `id: Display name`, or an object with both. */
function parseEntry(raw: unknown): FlowEntry | null {
	if (typeof raw === "object" && raw !== null) {
		const record = raw as Record<string, unknown>;
		const id = asString(record.id).trim();
		return id ? { id, name: asString(record.name).trim() || id } : null;
	}

	const text = asString(raw).trim();
	if (!text) return null;

	const separator = text.indexOf(":");
	if (separator > 0) {
		const id = text.slice(0, separator).trim();
		const name = text.slice(separator + 1).trim();
		return { id, name: name || id };
	}
	return { id: text, name: text };
}

function formatEntry(entry: FlowEntry): string {
	return entry.name && entry.name !== entry.id ? `${entry.id}: ${entry.name}` : entry.id;
}

/**
 * Renames a lane from the canvas. The display name is only a label, but the id
 * is what every note in the lane points at — changing it rewrites them all, so
 * the two are edited separately and the second one asks first.
 */
export class LaneEditModal extends Modal {
	private id: string;
	private name: string;

	constructor(
		app: App,
		private plugin: LorePlugin,
		private timelineFile: TFile,
		private original: FlowEntry,
		private members: TFile[],
		private onDone: () => void,
	) {
		super(app);
		this.id = original.id;
		this.name = original.name;
	}

	onOpen() {
		const t = (key: string, ...args: string[]) => this.plugin.i18n.t(key, ...args);
		this.titleEl.setText(t("lane.title"));

		new Setting(this.contentEl)
			.setName(t("lane.name"))
			.setDesc(t("lane.name.desc"))
			.addText((text) =>
				text.setValue(this.name).onChange((value) => {
					this.name = value;
				}),
			);

		new Setting(this.contentEl)
			.setName(t("lane.id"))
			.setDesc(t("lane.id.desc", String(this.members.length)))
			.addText((text) =>
				text.setValue(this.id).onChange((value) => {
					this.id = value;
				}),
			);

		new Setting(this.contentEl).addButton((button) =>
			button
				.setButtonText(t("lane.save"))
				.setCta()
				.onClick(() => void this.submit()),
		);
	}

	private async submit() {
		const t = (key: string, ...args: string[]) => this.plugin.i18n.t(key, ...args);
		const id = this.id.trim();
		const name = this.name.trim() || id;

		if (!id) {
			new Notice(t("lane.idRequired"));
			return;
		}

		if (id !== this.original.id && this.existingIds().includes(id)) {
			new Notice(t("lane.idTaken", id));
			return;
		}

		if (id === this.original.id) {
			await this.applyChanges(id, name);
			return;
		}

		// Renaming the id detaches every note in the lane unless they are rewritten
		// with it, so the count is spelled out before anything moves.
		new ConfirmModal(
			this.app,
			{
				title: t("lane.title"),
				body: t("lane.rename.body", this.original.id, id, String(this.members.length)),
				details: this.members.slice(0, 12).map((file) => file.basename),
				confirmLabel: t("lane.save"),
				cancelLabel: t("common.cancel"),
			},
			() => void this.applyChanges(id, name),
		).open();
	}

	private existingIds(): string[] {
		return this.readFlows()
			.filter((entry) => entry.id !== this.original.id)
			.map((entry) => entry.id);
	}

	private readFlows(): FlowEntry[] {
		const raw: unknown = this.app.metadataCache.getFileCache(this.timelineFile)?.frontmatter?.flows;
		if (!Array.isArray(raw)) return [];
		return raw.map(parseEntry).filter((entry): entry is FlowEntry => entry !== null);
	}

	private async applyChanges(id: string, name: string) {
		const t = (key: string, ...args: string[]) => this.plugin.i18n.t(key, ...args);

		try {
			const flows = this.readFlows();
			const index = flows.findIndex((entry) => entry.id === this.original.id);

			if (index >= 0) {
				flows[index] = { id, name };
			} else {
				// A lane can exist only because notes mention it; naming it adds it.
				flows.push({ id, name });
			}

			await this.app.fileManager.processFrontMatter(this.timelineFile, (frontmatter: Record<string, unknown>) => {
				frontmatter.flows = flows.map(formatEntry);
			});

			if (id !== this.original.id) {
				for (const file of this.members) {
					await this.app.fileManager.processFrontMatter(file, (frontmatter: Record<string, unknown>) => {
						frontmatter.flow = id;
					});
				}
			}

			new Notice(t("lane.saved"));
			this.onDone();
			this.close();
		} catch (error) {
			console.error("Lore Creator: could not rename the lane", error);
			new Notice(t("lane.failed"));
		}
	}

	onClose() {
		this.contentEl.empty();
	}
}
