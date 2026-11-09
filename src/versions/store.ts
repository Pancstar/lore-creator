import { App, TFile, normalizePath } from "obsidian";
import { isAmbiguousLink, linkCandidates, linkTarget, recordLink, sharedBasenames } from "../links";
import { asString } from "../frontmatter";
import { isTemplate, loreFiles } from "../scope";

export interface VersionInfo {
	number: number;
	name: string;
	note: string;
}

export interface VersionEntry extends VersionInfo {
	file: TFile;
	/** True for the note sitting at its real path rather than in the archive. */
	active: boolean;
}

export class VersionError extends Error {}

/**
 * Resolves once Obsidian has re-read `file` after a write, so the next lookup
 * sees the new frontmatter. Gives up after two seconds rather than hang.
 */
export function settledMetadata(app: App, file: TFile): Promise<void> {
	return new Promise((resolve) => {
		const done = () => {
			window.clearTimeout(timer);
			app.metadataCache.offref(ref);
			resolve();
		};
		const ref = app.metadataCache.on("changed", (changed) => {
			if (changed.path === file.path) done();
		});
		const timer = window.setTimeout(done, 2000);
	});
}

/** Version ids are written as `v3`; anything else counts as the first version. */
function parseNumber(value: unknown): number {
	const text = asString(value).trim();
	const match = text.match(/^v?(\d+)$/i);
	return match ? Number.parseInt(match[1], 10) : 1;
}

/**
 * Keeps the active version at the note's real path and older ones in an archive
 * folder. Links elsewhere in the vault always point at the active version, so
 * switching versions never leaves a dangling `[[link]]` behind.
 */
export class VersionStore {
	/** Active note path → its archives. Built on demand, dropped on any change. */
	private index: Map<string, TFile[]> | null = null;

	constructor(
		private app: App,
		private versionsFolder: string,
	) {}

	/** Forgets the archive index; the next lookup rebuilds it in one vault pass. */
	invalidate() {
		this.index = null;
	}

	setFolder(folder: string) {
		this.versionsFolder = folder;
	}

	private frontmatter(file: TFile): Record<string, unknown> {
		return this.app.metadataCache.getFileCache(file)?.frontmatter ?? {};
	}

	info(file: TFile): VersionInfo {
		const frontmatter = this.frontmatter(file);
		return {
			number: parseNumber(frontmatter.version),
			name: asString(frontmatter["version-name"]),
			note: asString(frontmatter["version-note"]),
		};
	}

	isArchived(file: TFile): boolean {
		return Boolean(this.frontmatter(file)["version-of"]);
	}

	/** The live note an archived version belongs to. */
	activeFileFor(file: TFile): TFile | null {
		const frontmatter = this.frontmatter(file);
		const target = linkTarget(frontmatter["version-of"]);
		if (!target) return file;
		return this.app.metadataCache.getFirstLinkpathDest(target, file.path);
	}

	/**
	 * The notes an archive's record could mean when it names its note by a name
	 * several notes share (records written before v0.9.0). Obsidian would pick
	 * one of them, possibly the wrong one, so the author is asked instead.
	 * Empty when the record names exactly one note.
	 */
	ownerCandidates(archive: TFile): TFile[] {
		const target = linkTarget(this.frontmatter(archive)["version-of"]);
		if (!target || !isAmbiguousLink(this.app, target)) return [];
		return linkCandidates(this.app, target).filter((file) => !isTemplate(file) && !this.isArchived(file));
	}

	/**
	 * Old archives whose record names `name` bare while several notes carry
	 * that name. Obsidian files each under one of them, so some may sit under
	 * the wrong note and never show up in the right one's list.
	 */
	ambiguousArchivesNamed(name: string): TFile[] {
		const wanted = name.toLowerCase();
		const shared = sharedBasenames(this.app);
		return loreFiles(this.app).filter((file) => {
			const target = linkTarget(this.frontmatter(file)["version-of"]);
			return target.toLowerCase() === wanted && isAmbiguousLink(this.app, target, shared);
		});
	}

	/** Rewrites an archive's record so it names `owner` and nothing else. */
	async setOwner(archive: TFile, owner: TFile): Promise<void> {
		const settled = settledMetadata(this.app, archive);
		await this.app.fileManager.processFrontMatter(archive, (frontmatter: Record<string, unknown>) => {
			frontmatter["version-of"] = `[[${recordLink(this.app, owner)}]]`;
		});
		await settled;
		this.invalidate();
	}

	/**
	 * Archives are discovered by following `version-of` rather than by reading a
	 * list off the active note, so the two can never drift apart.
	 */
	archivesOf(active: TFile): TFile[] {
		return [...(this.buildIndex().get(active.path) ?? [])];
	}

	private buildIndex(): Map<string, TFile[]> {
		if (this.index) return this.index;

		const index = new Map<string, TFile[]>();
		for (const file of loreFiles(this.app)) {
			const target = linkTarget(this.frontmatter(file)["version-of"]);
			if (!target) continue;
			const activePath = this.app.metadataCache.getFirstLinkpathDest(target, file.path)?.path;
			if (!activePath) continue;

			const archives = index.get(activePath);
			if (archives) archives.push(file);
			else index.set(activePath, [file]);
		}
		this.index = index;
		return index;
	}

	list(file: TFile): VersionEntry[] {
		const active = this.activeFileFor(file) ?? file;
		const entries: VersionEntry[] = [{ file: active, active: true, ...this.info(active) }];

		for (const archive of this.archivesOf(active)) {
			entries.push({ file: archive, active: false, ...this.info(archive) });
		}

		entries.sort((a, b) => a.number - b.number);
		return entries;
	}

	hasMultiple(file: TFile): boolean {
		return this.list(file).length > 1;
	}

	/**
	 * `Mira — v2.md`, unless another note is called Mira too: then the note's
	 * folder tells the two apart (`Mira (Characters) — v2.md`), and a number
	 * when there is no folder name to use or it is taken as well. A path that
	 * already exists is never chosen.
	 */
	private archivePath(active: TFile, info: VersionInfo): string {
		const suffix = info.name.trim() ? ` ${info.name.trim()}` : "";
		const pathFor = (label: string) =>
			normalizePath(`${this.versionsFolder}/${label} — v${info.number}${suffix}.md`);
		// Windows and macOS file names ignore case, so neither does this check.
		const taken = new Set(this.app.vault.getMarkdownFiles().map((file) => file.path.toLowerCase()));
		const free = (path: string) => !taken.has(path.toLowerCase());

		const base = active.basename;
		const plain = pathFor(base);
		const shared = (sharedBasenames(this.app).get(base.toLowerCase()) ?? 0) > 1;
		if (!shared && free(plain)) return plain;

		const folder = active.parent && !active.parent.isRoot() ? active.parent.name : "";
		if (folder) {
			const withFolder = pathFor(`${base} (${folder})`);
			if (free(withFolder)) return withFolder;
		}
		for (let n = 2; ; n++) {
			const numbered = pathFor(`${base} (${n})`);
			if (free(numbered)) return numbered;
		}
	}

	private async ensureFolder() {
		const folder = normalizePath(this.versionsFolder);
		if (!this.app.vault.getFolderByPath(folder)) {
			await this.app.vault.createFolder(folder);
		}
	}

	/** Describes what `createVersion` would do, for the confirmation dialog. */
	previewCreate(active: TFile): { archivePath: string; nextNumber: number } {
		const info = this.info(active);
		const highest = this.list(active).reduce((max, entry) => Math.max(max, entry.number), 0);
		return { archivePath: this.archivePath(active, info), nextNumber: highest + 1 };
	}

	/**
	 * Files the current content into the archive and leaves a copy at the note's
	 * own path as the next version, so the author edits forward from what they
	 * already had rather than starting from a blank note.
	 */
	async createVersion(active: TFile, name: string, note: string, expectedPath?: string): Promise<void> {
		if (this.isArchived(active)) {
			throw new VersionError("archived");
		}

		const { archivePath, nextNumber } = this.previewCreate(active);
		// The dialog named a path; if something has changed since, stop rather
		// than file the note somewhere the author was not shown.
		if ((expectedPath && archivePath !== expectedPath) || this.app.vault.getFileByPath(archivePath)) {
			throw new VersionError(expectedPath ?? archivePath);
		}

		const content = await this.app.vault.read(active);
		const previous = this.info(active);

		await this.ensureFolder();
		const archive = await this.app.vault.create(archivePath, content);

		await this.app.fileManager.processFrontMatter(archive, (frontmatter: Record<string, unknown>) => {
			frontmatter.version = `v${previous.number}`;
			frontmatter["version-of"] = `[[${recordLink(this.app, active)}]]`;
			if (previous.name) frontmatter["version-name"] = previous.name;
			if (previous.note) frontmatter["version-note"] = previous.note;
		});

		await this.app.fileManager.processFrontMatter(active, (frontmatter: Record<string, unknown>) => {
			frontmatter.version = `v${nextNumber}`;
			delete frontmatter["version-of"];
			if (name.trim()) {
				frontmatter["version-name"] = name.trim();
			} else {
				delete frontmatter["version-name"];
			}
			if (note.trim()) {
				frontmatter["version-note"] = note.trim();
			} else {
				delete frontmatter["version-note"];
			}
		});
	}

	/** Describes what `switchTo` would do, for the confirmation dialog. */
	previewSwitch(active: TFile, target: TFile): { archivePath: string } {
		return { archivePath: this.archivePath(active, this.info(active)) };
	}

	/**
	 * Swaps an archived version into the note's real path. Ordered so the current
	 * content is safely on disk in its new home before anything overwrites it:
	 * a failure partway through leaves a duplicate, never a hole.
	 */
	async switchTo(active: TFile, target: TFile, expectedPath?: string): Promise<void> {
		if (target.path === active.path) return;

		const archivePath = this.archivePath(active, this.info(active));
		if ((expectedPath && archivePath !== expectedPath) || this.app.vault.getFileByPath(archivePath)) {
			throw new VersionError(expectedPath ?? archivePath);
		}

		const activeContent = await this.app.vault.read(active);
		const targetContent = await this.app.vault.read(target);
		const activeInfo = this.info(active);

		await this.ensureFolder();
		const archive = await this.app.vault.create(archivePath, activeContent);
		await this.app.fileManager.processFrontMatter(archive, (frontmatter: Record<string, unknown>) => {
			frontmatter.version = `v${activeInfo.number}`;
			frontmatter["version-of"] = `[[${recordLink(this.app, active)}]]`;
		});

		await this.app.vault.process(active, () => targetContent);
		await this.app.fileManager.processFrontMatter(active, (frontmatter: Record<string, unknown>) => {
			delete frontmatter["version-of"];
		});

		await this.app.fileManager.trashFile(target);
	}

	async rename(file: TFile, name: string, note: string): Promise<void> {
		await this.app.fileManager.processFrontMatter(file, (frontmatter: Record<string, unknown>) => {
			if (name.trim()) {
				frontmatter["version-name"] = name.trim();
			} else {
				delete frontmatter["version-name"];
			}
			if (note.trim()) {
				frontmatter["version-note"] = note.trim();
			} else {
				delete frontmatter["version-note"];
			}
		});
	}

	/** Only ever called on archives, and only behind an explicit confirmation. */
	async deleteVersion(archive: TFile): Promise<void> {
		if (!this.isArchived(archive)) {
			throw new VersionError("active");
		}
		await this.app.fileManager.trashFile(archive);
	}

	label(entry: VersionEntry): string {
		const name = entry.name.trim();
		return name ? `v${entry.number} · ${name}` : `v${entry.number}`;
	}
}
