import { App, Modal, Notice, Setting, TFile, TFolder, normalizePath } from "obsidian";
import type LorePlugin from "../main";
import { ConfirmModal } from "../modals/confirm";
import { SetupModal } from "../setup/wizard";
import { ensureFolder } from "../noteFactory";
import { TimelineView, VIEW_TYPE_TIMELINE } from "../timeline/view";
import {
	EXAMPLE_MARKER,
	EXAMPLE_TIMELINE_ID,
	EXAMPLE_TYPES,
	ExampleLang,
	buildExampleNotes,
	foldersToTidy,
	exampleFolder,
	isExampleBasename,
} from "./exampleContent";
import { applyLang } from "../i18n";

/** True for a note the example story wrote, wherever it has been moved since. */
export function isExampleNote(frontmatter: Record<string, unknown> | undefined): boolean {
	return frontmatter?.[EXAMPLE_MARKER] === true;
}

/**
 * Every example note: it carries the marker **and** still has a name the
 * example wrote. Found by marker rather than folder, so a moved note is
 * still found; by name too, so a copy the author made stays theirs.
 */
export function findExampleFiles(app: App): TFile[] {
	return app.vault
		.getMarkdownFiles()
		.filter(
			(file) =>
				isExampleBasename(file.basename) && isExampleNote(app.metadataCache.getFileCache(file)?.frontmatter),
		);
}

function insideExampleFolder(file: TFile): boolean {
	return (["en", "tr"] as ExampleLang[]).some((lang) => file.path.startsWith(`${exampleFolder(lang)}/`));
}

export function exampleExists(app: App): boolean {
	return findExampleFiles(app).length > 0;
}

/** Entry point for the guide's "Make an example story" button. */
export function confirmCreateExample(plugin: LorePlugin): void {
	const t = (key: string, ...args: string[]) => plugin.i18n.t(key, ...args);
	if (!plugin.universe.file) {
		new Notice(t("example.needUniverse"));
		new SetupModal(plugin.app, plugin).open();
		return;
	}
	// A second press offers removal instead of writing a duplicate story.
	if (exampleExists(plugin.app)) {
		confirmRemoveExample(plugin);
		return;
	}
	new CreateExampleModal(plugin.app, plugin).open();
}

export function confirmRemoveExample(plugin: LorePlugin): void {
	const t = (key: string, ...args: string[]) => plugin.i18n.t(key, ...args);
	const files = findExampleFiles(plugin.app);
	if (files.length === 0) {
		new Notice(t("example.nothingToRemove"));
		return;
	}

	new ConfirmModal(
		plugin.app,
		{
			title: t("example.remove.title"),
			body: t("example.remove.body", String(files.length)),
			// Notes that left the example folder are named one by one, so nothing
			// the author moved or kept is trashed without being shown.
			details: [
				t("example.remove.folderCount", String(files.filter(insideExampleFolder).length)),
				...files.filter((file) => !insideExampleFolder(file)).map((file) => t("example.remove.outside", file.path)),
			],
			confirmLabel: t("example.remove.confirm"),
			cancelLabel: t("common.cancel"),
			destructive: true,
		},
		() => void removeExample(plugin),
	).open();
}

async function removeExample(plugin: LorePlugin) {
	const t = (key: string, ...args: string[]) => plugin.i18n.t(key, ...args);
	const { app } = plugin;
	// Re-read now: notes may have changed while the dialog was open.
	const files = findExampleFiles(app);
	let removed = 0;
	let failed = false;
	const removedPaths: string[] = [];
	for (const file of files) {
		try {
			const path = file.path;
			await app.fileManager.trashFile(file);
			removedPaths.push(path);
			removed++;
		} catch (error) {
			console.error("Lore Creator: could not remove", file.path, error);
			failed = true;
		}
	}
	try {
		// Only folders this removal emptied go, and only if the author put
		// nothing of their own in them. A same-named folder of theirs stays.
		const roots = (["en", "tr"] as ExampleLang[]).map((lang) => normalizePath(exampleFolder(lang)));
		for (const folder of foldersToTidy(removedPaths, roots)) {
			await trashIfEmpty(app, folder);
		}
	} catch (error) {
		console.error("Lore Creator: could not tidy the example folder", error);
	}
	new Notice(failed ? t("example.failed") : t("example.removed", String(removed)));
}

async function trashIfEmpty(app: App, path: string) {
	const folder = app.vault.getAbstractFileByPath(path);
	if (folder instanceof TFolder && folder.children.length === 0) await app.fileManager.trashFile(folder);
}

class CreateExampleModal extends Modal {
	private lang: ExampleLang;

	constructor(
		app: App,
		private plugin: LorePlugin,
	) {
		super(app);
		this.lang = plugin.language;
	}

	private t(key: string, ...args: string[]) {
		return this.plugin.i18n.t(key, ...args);
	}

	onOpen() {
		applyLang(this.modalEl);
		this.titleEl.setText(this.t("example.create.title"));
		this.contentEl.addClass("plc-confirm");
		this.contentEl.createEl("p", { text: this.t("example.create.body") });

		new Setting(this.contentEl)
			.setName(this.t("example.create.language"))
			.addDropdown((dropdown) =>
				dropdown
					.addOption("en", "English")
					.addOption("tr", "Türkçe")
					.setValue(this.lang)
					.onChange((value) => {
						this.lang = value as ExampleLang;
						this.renderDetails();
					}),
			);

		this.detailsEl = this.contentEl.createDiv();
		this.renderDetails();

		new Setting(this.contentEl)
			.addButton((button) => button.setButtonText(this.t("common.cancel")).onClick(() => this.close()))
			.addButton((button) =>
				button
					.setButtonText(this.t("example.create.confirm"))
					.setCta()
					.onClick(() => void this.create()),
			);
	}

	private detailsEl: HTMLElement | null = null;

	private renderDetails() {
		if (!this.detailsEl) return;
		this.detailsEl.empty();
		const notes = buildExampleNotes(this.lang);
		const list = this.detailsEl.createEl("ul", { cls: "plc-confirm-details" });
		list.createEl("li", { text: this.t("example.create.where", exampleFolder(this.lang), String(notes.length)) });

		// Nothing outside the example folder is touched, so missing types are
		// reported, not added to the registry.
		const missing = EXAMPLE_TYPES.filter((id) => id !== "timeline" && !this.plugin.types.byId(id));
		if (missing.length > 0) {
			list.createEl("li", { text: this.t("example.create.missingTypes", missing.join(", ")) });
		}
	}

	private async create() {
		const notes = buildExampleNotes(this.lang);
		const { app } = this.plugin;
		this.close();
		try {
			for (const entry of notes) {
				const path = normalizePath(entry.path);
				if (app.vault.getFileByPath(path)) continue;
				await ensureFolder(app, path.split("/").slice(0, -1).join("/"));
				await app.vault.create(path, entry.content);
			}
			new Notice(this.t("example.created"));
			const view = (await this.plugin.activateView(VIEW_TYPE_TIMELINE))?.view;
			if (view instanceof TimelineView) view.showTimeline(EXAMPLE_TIMELINE_ID);
		} catch (error) {
			console.error("Lore Creator: could not create the example story", error);
			new Notice(this.t("example.failed"));
		}
	}

	onClose() {
		this.contentEl.empty();
	}
}
