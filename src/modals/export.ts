import { App, Modal, Notice, Setting, TFile, normalizePath } from "obsidian";
import type LorePlugin from "../main";
import { extractBody, ensureFolder, sanitiseFileName } from "../noteFactory";
import { TimelineModel } from "../timeline/model";
import { asNumberOrNull, asString } from "../frontmatter";

const ALL = "__all";

interface Entry {
	file: TFile;
	title: string;
	icon: string;
	type: string;
	time: number | null;
	timeLabel: string;
}

/**
 * Gathers the universe into one document. There is no per-note privacy flag by
 * design — what an outside reader sees is decided here, at the moment of
 * sharing, rather than carried around by every note forever.
 */
export class ExportModal extends Modal {
	private typeFilter = ALL;
	private timelineFilter = ALL;
	private includeDrafts = false;
	private includeUnfinished = true;
	private fileName: string;

	constructor(
		app: App,
		private plugin: LorePlugin,
	) {
		super(app);
		this.fileName = this.plugin.universe.name || "Evren";
	}

	onOpen() {
		const t = (key: string, ...args: string[]) => this.plugin.i18n.t(key, ...args);
		this.titleEl.setText(t("export.title"));
		this.contentEl.createEl("p", { cls: "setting-item-description", text: t("export.desc") });

		new Setting(this.contentEl).setName(t("export.types")).addDropdown((dropdown) => {
			dropdown.addOption(ALL, t("export.allTypes"));
			for (const type of this.plugin.types.creatable()) {
				if (type.id === "draft") continue;
				dropdown.addOption(type.id, this.plugin.types.label(type, this.plugin.language));
			}
			dropdown.setValue(this.typeFilter).onChange((value) => {
				this.typeFilter = value;
			});
		});

		const definitions = new TimelineModel(this.app).definitions();
		new Setting(this.contentEl).setName(t("export.timeline")).addDropdown((dropdown) => {
			dropdown.addOption(ALL, t("export.allTimelines"));
			for (const definition of definitions) dropdown.addOption(definition.id, definition.name);
			dropdown.setValue(this.timelineFilter).onChange((value) => {
				this.timelineFilter = value;
			});
		});

		new Setting(this.contentEl)
			.setName(t("export.unfinished"))
			.setDesc(t("export.unfinished.desc"))
			.addToggle((toggle) =>
				toggle.setValue(this.includeUnfinished).onChange((value) => {
					this.includeUnfinished = value;
				}),
			);

		new Setting(this.contentEl)
			.setName(t("export.drafts"))
			.setDesc(t("export.drafts.desc"))
			.addToggle((toggle) =>
				toggle.setValue(this.includeDrafts).onChange((value) => {
					this.includeDrafts = value;
				}),
			);

		new Setting(this.contentEl).setName(t("export.fileName")).addText((text) =>
			text.setValue(this.fileName).onChange((value) => {
				this.fileName = value;
			}),
		);

		new Setting(this.contentEl).addButton((button) =>
			button
				.setButtonText(t("export.run"))
				.setCta()
				.onClick(() => void this.run()),
		);
	}

	private collect(): Entry[] {
		const entries: Entry[] = [];

		for (const file of this.app.vault.getMarkdownFiles()) {
			const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter;
			if (!frontmatter || frontmatter["version-of"]) continue;

			const type = asString(frontmatter.type);
			if (!type || type === "system") continue;
			if (type === "draft" && !this.includeDrafts) continue;
			if (this.typeFilter !== ALL && type !== this.typeFilter) continue;

			const status = asString(frontmatter.status);
			if (!this.includeUnfinished && status !== "done") continue;

			const timeline = asString(frontmatter.timeline).trim();
			// A note with no timeline belongs to the universe rather than to one
			// reality, so it stays in even when a single timeline is selected.
			if (this.timelineFilter !== ALL && timeline && timeline !== this.timelineFilter) continue;

			entries.push({
				file,
				title: file.basename,
				icon: asString(frontmatter.icon),
				type,
				time: asNumberOrNull(frontmatter.time),
				timeLabel: asString(frontmatter["time-label"]),
			});
		}

		return entries;
	}

	private async run() {
		const t = (key: string, ...args: string[]) => this.plugin.i18n.t(key, ...args);
		const name = sanitiseFileName(this.fileName);

		if (!name) {
			new Notice(t("export.nameRequired"));
			return;
		}

		const entries = this.collect();
		if (entries.length === 0) {
			new Notice(t("export.nothing"));
			return;
		}

		try {
			const document = await this.buildDocument(entries);
			const folder = this.plugin.settings.exportFolder;
			await ensureFolder(this.app, folder);

			const path = await this.uniquePath(folder, name);
			const file = await this.app.vault.create(path, document);
			await this.app.workspace.getLeaf(false).openFile(file);

			new Notice(t("export.done", String(entries.length)));
			this.close();
		} catch (error) {
			console.error("Lore Creator: export failed", error);
			new Notice(t("export.failed"));
		}
	}

	/** Never overwrites a previous export; each run gets its own file. */
	private async uniquePath(folder: string, name: string): Promise<string> {
		let candidate = normalizePath(`${folder}/${name}.md`);
		let counter = 2;
		while (this.app.vault.getFileByPath(candidate)) {
			candidate = normalizePath(`${folder}/${name} ${counter++}.md`);
		}
		return candidate;
	}

	private async buildDocument(entries: Entry[]): Promise<string> {
		const t = (key: string, ...args: string[]) => this.plugin.i18n.t(key, ...args);
		const byType = new Map<string, Entry[]>();

		for (const entry of entries) {
			const bucket = byType.get(entry.type);
			if (bucket) {
				bucket.push(entry);
			} else {
				byType.set(entry.type, [entry]);
			}
		}

		const lines: string[] = [`# ${this.fileName}`, ""];

		const summary = this.plugin.universe.name
			? t("export.header", this.plugin.universe.name, String(entries.length))
			: t("export.headerPlain", String(entries.length));
		lines.push(`*${summary}*`, "", "## " + t("export.contents"), "");

		const ordered = [...byType.entries()].sort((a, b) => a[0].localeCompare(b[0]));

		for (const [typeId, group] of ordered) {
			const type = this.plugin.types.byId(typeId);
			const label = type ? this.plugin.types.label(type, this.plugin.language) : typeId;
			lines.push(`- ${label} (${group.length})`);
		}
		lines.push("");

		for (const [typeId, group] of ordered) {
			const type = this.plugin.types.byId(typeId);
			const label = type ? this.plugin.types.label(type, this.plugin.language) : typeId;
			lines.push(`## ${label}`, "");

			// Timed entries read best in story order; the rest fall back to name.
			group.sort((a, b) => {
				if (a.time !== null && b.time !== null) return a.time - b.time;
				if (a.time !== null) return -1;
				if (b.time !== null) return 1;
				return a.title.localeCompare(b.title);
			});

			for (const entry of group) {
				const heading = entry.icon ? `${entry.icon} ${entry.title}` : entry.title;
				lines.push(`### ${heading}`, "");
				if (entry.timeLabel) lines.push(`*${entry.timeLabel}*`, "");

				const content = await this.app.vault.cachedRead(entry.file);
				const body = extractBody(content).trim();
				if (body) lines.push(body, "");
			}
		}

		return lines.join("\n");
	}

	onClose() {
		this.contentEl.empty();
	}
}
