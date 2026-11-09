import { App, TFile, normalizePath } from "obsidian";
import { isAmbiguousLink, linkTarget, recordLink, sharedBasenames } from "../links";
import { VersionStore, settledMetadata } from "./store";
import { asString } from "../frontmatter";
import { loreFiles } from "../scope";
import { buildVersionSetsNote } from "../setup/defaults";

export interface VersionSetEntry {
	/** Link text pointing at the active note, e.g. `Yükseliş`. */
	note: string;
	version: number;
}

export interface VersionSet {
	id: string;
	name: string;
	entries: VersionSetEntry[];
}

export interface PlannedChange {
	active: TFile;
	from: number;
	to: number;
	target: TFile;
}

export interface SetPlan {
	changes: PlannedChange[];
	/** Entries naming a note or version that no longer exists. */
	missing: string[];
	/** Notes already on the requested version. */
	unchanged: number;
}

function parseNumber(value: unknown): number {
	const text = asString(value).trim();
	const match = text.match(/^v?(\d+)$/i);
	return match ? Number.parseInt(match[1], 10) : Number.NaN;
}

function slugify(name: string): string {
	return (
		name
			.toLocaleLowerCase("tr")
			.replace(/[çğıöşü]/g, (char) => ({ ç: "c", ğ: "g", ı: "i", ö: "o", ş: "s", ü: "u" })[char] ?? char)
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/^-+|-+$/g, "") || "set"
	);
}

/**
 * A named snapshot of which version of each note is active. One revision to the
 * story usually touches many notes at once; without this, going back to look at
 * the earlier draft means remembering and flipping every one of them by hand.
 */
export class VersionSetStore {
	constructor(
		private app: App,
		private versions: VersionStore,
		private setsPath: string,
		/** Language of a sets note created here, read when it is created. */
		private language: () => "en" | "tr",
	) {}

	setPath(path: string) {
		this.setsPath = normalizePath(path);
	}

	get file(): TFile | null {
		return this.app.vault.getFileByPath(normalizePath(this.setsPath));
	}

	list(): VersionSet[] {
		const file = this.file;
		if (!file) return [];

		const raw: unknown = this.app.metadataCache.getFileCache(file)?.frontmatter?.sets;
		if (!Array.isArray(raw)) return [];

		const sets: VersionSet[] = [];
		for (const item of raw) {
			if (typeof item !== "object" || item === null) continue;
			const record = item as Record<string, unknown>;
			const id = asString(record.id).trim();
			if (!id) continue;

			const entriesRaw = Array.isArray(record.entries) ? record.entries : [];
			const entries: VersionSetEntry[] = [];

			for (const entryRaw of entriesRaw) {
				if (typeof entryRaw !== "object" || entryRaw === null) continue;
				const entry = entryRaw as Record<string, unknown>;
				const note = linkTarget(entry.note);
				const version = parseNumber(entry.version);
				if (note && Number.isFinite(version)) entries.push({ note, version });
			}

			sets.push({ id, name: asString(record.name).trim() || id, entries });
		}
		return sets;
	}

	byId(id: string): VersionSet | undefined {
		return this.list().find((set) => set.id === id);
	}

	/**
	 * Entries naming their note by a name several notes share (sets captured
	 * before v0.9.0). Applying them as they are could switch the wrong note.
	 */
	ambiguousNotes(set: VersionSet): string[] {
		const shared = sharedBasenames(this.app);
		return [...new Set(set.entries.map((entry) => entry.note))].filter((note) =>
			isAmbiguousLink(this.app, note, shared),
		);
	}

	/**
	 * Makes every entry of one set that names `note` name `file` exactly and
	 * returns the new link text. The change is made on the note as it is on
	 * disk, not on Obsidian's index, so a fix made a moment earlier is kept
	 * even when the index has not caught up.
	 */
	async setEntryNote(setId: string, note: string, file: TFile): Promise<string> {
		const exact = recordLink(this.app, file);
		const target = this.file;
		if (!target) throw new Error("version sets note missing");

		const settled = settledMetadata(this.app, target);
		await this.app.fileManager.processFrontMatter(target, (frontmatter: Record<string, unknown>) => {
			const sets: unknown = frontmatter.sets;
			if (!Array.isArray(sets)) return;
			for (const set of sets) {
				const record = set as Record<string, unknown> | null;
				if (!record || asString(record.id).trim() !== setId || !Array.isArray(record.entries)) continue;
				for (const entry of record.entries as unknown[]) {
					const item = entry as Record<string, unknown> | null;
					if (item && linkTarget(item.note) === note) item.note = `[[${exact}]]`;
				}
			}
		});
		await settled;
		return exact;
	}

	/**
	 * Whether applying the set should first settle old shared-name records:
	 * an entry naming a shared name, or an old archive that may belong to a
	 * note the set switches. Until they are settled the plan may be wrong.
	 */
	needsSettling(set: VersionSet): boolean {
		if (this.ambiguousNotes(set).length > 0) return true;
		return set.entries.some((entry) => {
			const note = this.noteFor(entry);
			return note !== null && this.versions.ambiguousArchivesNamed(note.basename).length > 0;
		});
	}

	/** The note a set entry switches, as `plan` resolves it. */
	noteFor(entry: VersionSetEntry): TFile | null {
		return this.app.metadataCache.getFirstLinkpathDest(entry.note, this.setsPath);
	}

	/** Every note in the vault that has more than one version. */
	versionedNotes(): TFile[] {
		const notes: TFile[] = [];
		for (const file of loreFiles(this.app)) {
			if (this.versions.isArchived(file)) continue;
			if (this.versions.hasMultiple(file)) notes.push(file);
		}
		return notes;
	}

	/** Records the versions currently active, so the author can return to them. */
	async capture(name: string): Promise<VersionSet> {
		const entries: VersionSetEntry[] = this.versionedNotes().map((file) => ({
			note: recordLink(this.app, file),
			version: this.versions.info(file).number,
		}));

		const existing = this.list();
		let id = slugify(name);
		let suffix = 2;
		while (existing.some((set) => set.id === id)) {
			id = `${slugify(name)}-${suffix++}`;
		}

		const set: VersionSet = { id, name: name.trim() || id, entries };
		await this.write([...existing, set]);
		return set;
	}

	async remove(id: string): Promise<void> {
		await this.write(this.list().filter((set) => set.id !== id));
	}

	/**
	 * Works out what applying a set would change without touching anything, so
	 * the confirmation dialog can list it and the author can back out.
	 */
	plan(set: VersionSet): SetPlan {
		const changes: PlannedChange[] = [];
		const missing: string[] = [];
		let unchanged = 0;

		for (const entry of set.entries) {
			const active = this.noteFor(entry);
			if (!active) {
				missing.push(entry.note);
				continue;
			}

			const current = this.versions.info(active).number;
			if (current === entry.version) {
				unchanged += 1;
				continue;
			}

			const target = this.versions
				.list(active)
				.find((candidate) => candidate.number === entry.version && !candidate.active);
			if (!target) {
				missing.push(`${entry.note} v${entry.version}`);
				continue;
			}

			changes.push({ active, from: current, to: entry.version, target: target.file });
		}

		return { changes, missing, unchanged };
	}

	/**
	 * Applies changes one note at a time and stops at the first failure, leaving
	 * the vault in a state the author can inspect rather than pressing on and
	 * scattering half-applied changes.
	 */
	async apply(plan: SetPlan): Promise<{ applied: number; failed: PlannedChange | null; error: unknown }> {
		let applied = 0;

		for (const change of plan.changes) {
			try {
				await this.versions.switchTo(change.active, change.target);
				applied += 1;
			} catch (error) {
				return { applied, failed: change, error };
			}
		}
		return { applied, failed: null, error: null };
	}

	private async write(sets: VersionSet[]): Promise<void> {
		const file = await this.ensureFile();
		await this.app.fileManager.processFrontMatter(file, (frontmatter: Record<string, unknown>) => {
			frontmatter.sets = sets.map((set) => ({
				id: set.id,
				name: set.name,
				entries: set.entries.map((entry) => ({
					note: `[[${entry.note}]]`,
					version: `v${entry.version}`,
				})),
			}));
		});
	}

	private async ensureFile(): Promise<TFile> {
		const path = normalizePath(this.setsPath);
		const existing = this.app.vault.getFileByPath(path);
		if (existing) return existing;

		const folder = path.split("/").slice(0, -1).join("/");
		if (folder && !this.app.vault.getFolderByPath(folder)) {
			await this.app.vault.createFolder(folder);
		}

		// Same note the setup writes, in the interface language.
		return this.app.vault.create(path, buildVersionSetsNote(this.language()));
	}
}
