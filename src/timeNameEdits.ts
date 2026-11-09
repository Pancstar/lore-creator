/**
 * The time name typed in settings: saved while the author types, and at the
 * end of the visit the name the labels were written under is compared with
 * the one finally saved. Tracks what it saved itself instead of reading it
 * back, since Obsidian's index may not have caught up yet.
 */
export class TimeNameEdits {
	private pending: string | null = null;
	/** The last name this visit saved. */
	private written: string | null = null;
	/** The name before this visit's typing began. */
	private before: string | null = null;
	/** Writes run one after another; finishing waits for the last. */
	private queue: Promise<void> = Promise.resolve();

	constructor(
		private read: () => string,
		/** Saves the name; false when there was nowhere to save it. */
		private write: (name: string) => Promise<boolean>,
	) {}

	/** The name as the author sees it: typed, else saved, else the index's. */
	get current(): string {
		return this.pending ?? this.written ?? this.read();
	}

	/** The name the existing labels were written under. */
	get labelName(): string {
		return this.before ?? this.read();
	}

	type(name: string): void {
		this.before ??= this.read();
		this.pending = name;
	}

	/** Saves what was typed, after any write already under way. */
	flush(): Promise<void> {
		// An earlier failure was already reported by its own caller; it must not
		// stop this write.
		this.queue = this.queue.catch(() => undefined).then(async () => {
			const name = this.pending;
			if (name === null) return;
			this.pending = null;
			if (name === (this.written ?? this.read())) return;
			if (!(await this.write(name))) throw new Error("The time name could not be saved.");
			this.written = name;
		});
		return this.queue;
	}

	/**
	 * Saves what was typed and forgets this visit: the time editor, opened from
	 * here, now decides about the labels. Asking again on leaving could offer
	 * a name the editor has since replaced.
	 */
	async handOff(): Promise<void> {
		this.before = null;
		await this.flush();
		this.written = null;
	}

	/**
	 * Ends the visit: saves anything left and returns the name the labels were
	 * written under and the name now saved, or null when they are the same.
	 */
	async finish(): Promise<{ before: string; after: string } | null> {
		const before = this.before;
		this.before = null;
		try {
			await this.flush();
		} finally {
			// A failed write leaves the queue rejected; the next visit starts clean.
			this.queue = Promise.resolve();
		}
		const after = this.written;
		this.written = null;
		if (before === null || after === null || after === before) return null;
		return { before, after };
	}
}
