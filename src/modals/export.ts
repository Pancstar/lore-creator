import { App, ButtonComponent, Modal, Notice, Platform, Setting, TFile, normalizePath } from "obsidian";
import type LorePlugin from "../main";
import { extractBody, ensureFolder, sanitiseFileName } from "../noteFactory";
import { TimelineModel } from "../timeline/model";
import { asNumberOrNull, asString } from "../frontmatter";
import { isTimePrecision } from "../time";
import { loreFiles } from "../scope";
import { enterSubmits } from "./enterSubmits";
import { applyLang } from "../i18n";
import { ConfirmModal } from "./confirm";
import {
	BookEntry,
	BookText,
	SectionMode,
	groupEntries,
	htmlBook,
	htmlWikiIndex,
	htmlWikiPage,
	markdownBook,
	uniqueSlugs,
} from "../export/book";
import { RenderTarget, RenderedNote, imageDataUri, renderNote } from "../export/render";

const ALL = "__all";

type ExportFormat = "markdown" | "book" | "wiki" | "pdf";

/** A single-page book above this size asks first: it is mostly embedded pictures by then. */
const LARGE_BYTES = 20 * 1024 * 1024;

/** Parts of Obsidian's app that are not in the plugin API; each is checked before use. */
interface AppInternals {
	commands?: { executeCommandById(id: string): boolean };
	openWithDefaultApp?(path: string): void;
	showInFolder?(path: string): void;
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
	private format: ExportFormat = "markdown";
	private sections: SectionMode = "type";
	/** An export is running; a second press waits instead of racing it. */
	private busy = false;
	private runButton: ButtonComponent | null = null;

	constructor(
		app: App,
		private plugin: LorePlugin,
	) {
		super(app);
		this.fileName = this.plugin.universe.name || this.plugin.i18n.t("export.defaultName");
	}

	onOpen() {
		applyLang(this.modalEl);
		enterSubmits(this.contentEl);
		const t = (key: string, ...args: string[]) => this.plugin.i18n.t(key, ...args);
		this.titleEl.setText(t("export.title"));
		this.contentEl.createEl("p", { cls: "setting-item-description", text: t("export.desc") });

		new Setting(this.contentEl).setName(t("export.format")).addDropdown((dropdown) => {
			dropdown.addOption("markdown", t("export.format.markdown"));
			dropdown.addOption("book", t("export.format.book"));
			dropdown.addOption("wiki", t("export.format.wiki"));
			// Obsidian's PDF export lives in the desktop app only.
			if (Platform.isDesktopApp) dropdown.addOption("pdf", t("export.format.pdf"));
			dropdown.setValue(this.format).onChange((value) => {
				this.format = value as ExportFormat;
			});
		});

		new Setting(this.contentEl).setName(t("export.sections")).addDropdown((dropdown) => {
			dropdown.addOption("type", t("export.sections.type"));
			dropdown.addOption("timeline", t("export.sections.timeline"));
			dropdown.setValue(this.sections).onChange((value) => {
				this.sections = value === "timeline" ? "timeline" : "type";
			});
		});

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

		new Setting(this.contentEl).addButton((button) => {
			this.runButton = button;
			button
				.setButtonText(t("export.run"))
				.setCta()
				.onClick(() => void this.run());
		});
	}

	/** The notes the choices above let through, read and described for the book. */
	private async collect(): Promise<BookEntry[]> {
		const entries: BookEntry[] = [];

		for (const file of loreFiles(this.app)) {
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

			const time = asNumberOrNull(frontmatter.time);
			const precision = isTimePrecision(frontmatter["time-precision"]) ? frontmatter["time-precision"] : "year";
			const typeDefinition = this.plugin.types.byId(type);
			entries.push({
				path: file.path,
				title: file.basename,
				icon: asString(frontmatter.icon),
				type,
				typeLabel: typeDefinition ? this.plugin.types.label(typeDefinition, this.plugin.language) : type,
				timeline,
				time,
				when:
					asString(frontmatter["time-label"]) ||
					(time === null
						? ""
						: this.plugin.universe.formatTime(time, precision, this.plugin.i18n.t("time.dayLabel"))),
				body: extractBody(await this.app.vault.cachedRead(file)),
			});
		}

		return entries;
	}

	private async run() {
		const t = (key: string, ...args: string[]) => this.plugin.i18n.t(key, ...args);
		if (this.busy) return;
		const name = sanitiseFileName(this.fileName);

		if (!name) {
			new Notice(t("export.nameRequired"));
			return;
		}

		this.busy = true;
		this.runButton?.setDisabled(true);
		try {
			const entries = await this.collect();
			if (entries.length === 0) {
				new Notice(t("export.nothing"));
				return;
			}

			const definitions = new TimelineModel(this.app).definitions();
			const book: BookText = {
				title: this.fileName,
				summary: this.plugin.universe.name
					? t("export.header", this.plugin.universe.name, String(entries.length))
					: t("export.headerPlain", String(entries.length)),
				contentsTitle: t("export.contents"),
				sections: groupEntries(entries, this.sections, definitions, t("export.noTimeline")),
			};

			const folder = this.plugin.settings.exportFolder;
			await ensureFolder(this.app, folder);

			if (this.format === "book") await this.writeBook(book, folder, name);
			else if (this.format === "wiki") await this.writeWiki(book, folder, name);
			else await this.writeMarkdown(book, folder, name, this.format === "pdf");
		} catch (error) {
			console.error("Lore Creator: export failed", error);
			new Notice(t("export.failed"));
		} finally {
			this.busy = false;
			this.runButton?.setDisabled(false);
		}
	}

	/**
	 * Renders every note for an HTML export, saying how far it has got: a
	 * large universe takes a while, and silence looks like nothing happening.
	 */
	private async renderAll(book: BookText, target: RenderTarget): Promise<Map<string, RenderedNote>> {
		const t = (key: string, ...args: string[]) => this.plugin.i18n.t(key, ...args);
		const entries = book.sections.flatMap((section) => section.entries);
		const progress = new Notice(t("export.rendering", "0", String(entries.length)), 0);
		const rendered = new Map<string, RenderedNote>();
		try {
			for (const [index, entry] of entries.entries()) {
				rendered.set(entry.path, await renderNote(this.app, entry.path, entry.body, target));
				if (index % 10 === 9) progress.setMessage(t("export.rendering", String(index + 1), String(entries.length)));
			}
		} finally {
			progress.hide();
		}
		return rendered;
	}

	private count(book: BookText): number {
		return book.sections.reduce((sum, section) => sum + section.entries.length, 0);
	}

	private async writeMarkdown(book: BookText, folder: string, name: string, thenPdf: boolean) {
		const t = (key: string, ...args: string[]) => this.plugin.i18n.t(key, ...args);
		const file = await this.app.vault.create(this.uniquePath(folder, name, "md"), markdownBook(book));
		const leaf = this.app.workspace.getLeaf(false);
		await leaf.openFile(file, { active: true });
		this.close();

		if (!thenPdf) {
			new Notice(t("export.done", String(this.count(book))));
			return;
		}
		// Obsidian's PDF export works on the active note, so it runs only when
		// that is the book: anything else would export the wrong note.
		this.app.workspace.setActiveLeaf(leaf, { focus: true });
		if (this.app.workspace.getActiveFile()?.path !== file.path) {
			new Notice(t("export.pdf.manual"), 10000);
			return;
		}
		const commands = (this.app as unknown as AppInternals).commands;
		if (commands?.executeCommandById("workspace:export-pdf")) new Notice(t("export.pdf.next"));
		else new Notice(t("export.pdf.unavailable"), 8000);
	}

	private async writeBook(book: BookText, folder: string, name: string) {
		const t = (key: string, ...args: string[]) => this.plugin.i18n.t(key, ...args);
		const paths = book.sections.flatMap((section) => section.entries.map((entry) => entry.path));
		const anchors = uniqueSlugs(paths);
		// A picture used in many notes is read and encoded once.
		const images = new Map<string, Promise<string>>();
		const target: RenderTarget = {
			hrefFor: (path) => (anchors.has(path) ? `#${anchors.get(path)}` : null),
			imageSrc: (file) => {
				let src = images.get(file.path);
				if (!src) {
					src = imageDataUri(this.app, file);
					images.set(file.path, src);
				}
				return src;
			},
		};
		const rendered = await this.renderAll(book, target);
		const bodies = new Map([...rendered].map(([path, note]) => [path, note.html]));

		const html = htmlBook({ ...book, lang: this.plugin.language, bodies, anchors });
		const bytes = new TextEncoder().encode(html).length;
		const write = async () => {
			const path = this.uniquePath(folder, name, "html");
			await this.app.vault.create(path, html);
			this.close();
			this.announce(t("export.written", path), path, path);
		};

		if (bytes <= LARGE_BYTES) {
			await write();
			return;
		}
		new ConfirmModal(
			this.app,
			{
				title: t("export.tooLarge.title"),
				body: t("export.tooLarge.body", String(Math.round(bytes / (1024 * 1024)))),
				confirmLabel: t("export.tooLarge.go"),
				cancelLabel: t("common.cancel"),
			},
			() => void write().catch((error) => {
				console.error("Lore Creator: export failed", error);
				new Notice(t("export.failed"));
			}),
		).open();
	}

	private async writeWiki(book: BookText, folder: string, name: string) {
		const t = (key: string, ...args: string[]) => this.plugin.i18n.t(key, ...args);
		const root = this.uniqueFolder(folder, name);
		await ensureFolder(this.app, root);

		const paths = book.sections.flatMap((section) => section.entries.map((entry) => entry.path));
		const pages = uniqueSlugs(paths);
		const entries = new Map(book.sections.flatMap((section) => section.entries.map((entry) => [entry.path, entry])));
		// Copied pictures by note path; names compared without case, as Windows and macOS do.
		const copied = new Map<string, Promise<string>>();
		const usedNames = new Set<string>();
		const copy = async (file: TFile): Promise<string> => {
			await ensureFolder(this.app, `${root}/assets`);
			let assetName = file.name;
			for (let n = 2; usedNames.has(assetName.toLowerCase()); n++) assetName = `${file.basename} ${n}.${file.extension}`;
			usedNames.add(assetName.toLowerCase());
			await this.app.vault.createBinary(normalizePath(`${root}/assets/${assetName}`), await this.app.vault.readBinary(file));
			return `assets/${encodeURIComponent(assetName)}`;
		};
		const target: RenderTarget = {
			hrefFor: (path) => (pages.has(path) ? `${pages.get(path)}.html` : null),
			imageSrc: (file) => {
				let src = copied.get(file.path);
				if (!src) {
					src = copy(file);
					copied.set(file.path, src);
				}
				return src;
			},
		};

		const rendered = await this.renderAll(book, target);

		// Who links to each page, for its "linked from" list.
		const linkedFrom = new Map<string, string[]>();
		for (const [path, note] of rendered) {
			for (const to of note.links) {
				if (to === path) continue;
				const list = linkedFrom.get(to);
				if (list) list.push(path);
				else linkedFrom.set(to, [path]);
			}
		}

		for (const path of paths) {
			const entry = entries.get(path);
			if (!entry) continue;
			const backlinks = (linkedFrom.get(path) ?? [])
				.map((from) => ({ title: entries.get(from)?.title ?? from, href: `${pages.get(from)}.html` }))
				.sort((a, b) => a.title.localeCompare(b.title));
			const html = htmlWikiPage({
				bookTitle: book.title,
				lang: this.plugin.language,
				entry,
				body: rendered.get(path)?.html ?? "",
				backlinks,
				labels: { back: t("export.contents"), linkedFrom: t("export.linkedFrom") },
			});
			await this.app.vault.create(normalizePath(`${root}/${pages.get(path)}.html`), html);
		}
		const index = normalizePath(`${root}/index.html`);
		await this.app.vault.create(index, htmlWikiIndex({ ...book, lang: this.plugin.language, pages }));

		this.close();
		this.announce(t("export.written", root), index, root);
	}

	/**
	 * Says where the export went; on the desktop also offers to open it in the
	 * browser and to show it in its folder.
	 */
	private announce(message: string, openPath: string, folderPath: string) {
		const t = (key: string, ...args: string[]) => this.plugin.i18n.t(key, ...args);
		const app = this.app as unknown as AppInternals;
		const fragment = createFragment((frag) => {
			frag.createDiv({ text: message });
			if (!Platform.isDesktopApp) return;
			const row = frag.createDiv({ cls: "plc-export-actions" });
			if (app.openWithDefaultApp) {
				row.createEl("button", { text: t("export.openBrowser") }).addEventListener("click", () =>
					app.openWithDefaultApp?.(openPath),
				);
			}
			if (app.showInFolder) {
				row.createEl("button", { text: t("export.showFolder") }).addEventListener("click", () =>
					app.showInFolder?.(folderPath),
				);
			}
		});
		new Notice(fragment, 12000);
	}

	/** Whether anything already sits at `path`, ignoring case as Windows and macOS do. */
	private taken(path: string): boolean {
		const wanted = path.toLowerCase();
		return this.app.vault.getAllLoadedFiles().some((file) => file.path.toLowerCase() === wanted);
	}

	/** Never overwrites a previous export; each run gets its own file. */
	private uniquePath(folder: string, name: string, extension: string): string {
		let candidate = normalizePath(`${folder}/${name}.${extension}`);
		let counter = 2;
		while (this.taken(candidate)) {
			candidate = normalizePath(`${folder}/${name} ${counter++}.${extension}`);
		}
		return candidate;
	}

	/** A wiki gets a folder of its own, never one that already exists. */
	private uniqueFolder(folder: string, name: string): string {
		let candidate = normalizePath(`${folder}/${name}`);
		let counter = 2;
		while (this.taken(candidate)) {
			candidate = normalizePath(`${folder}/${name} ${counter++}`);
		}
		return candidate;
	}

	onClose() {
		this.contentEl.empty();
	}
}

