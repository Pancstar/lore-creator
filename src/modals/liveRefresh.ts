import { App, EventRef, Events } from "obsidian";

/** Wait after the last vault event before redrawing. */
const SETTLE_DELAY = 200;
/** Give up waiting for the vault to report back after this long. */
const SETTLE_FALLBACK = 1000;

/**
 * Keeps an open modal in step with the vault. File writes reach the metadata
 * cache a moment after they resolve, so a redraw right after an operation
 * would show the old state; instead the modal redraws once the vault settles.
 *
 * It also serialises operations: while one runs, and until the vault has
 * caught up with it, `busy` stays true, so a second action never plans from
 * stale data (e.g. two quick "new version" clicks picking the same number).
 */
export class LiveRefresh {
	private refs: { source: Events; ref: EventRef }[] = [];
	private settleTimer: number | null = null;
	private fallbackTimer: number | null = null;
	private running = false;
	private settling = false;

	constructor(
		private app: App,
		private redraw: () => void,
	) {}

	get busy(): boolean {
		return this.running || this.settling;
	}

	start() {
		const { metadataCache, vault } = this.app;
		this.refs.push(
			{ source: metadataCache, ref: metadataCache.on("changed", () => this.schedule()) },
			{ source: vault, ref: vault.on("delete", () => this.schedule()) },
			{ source: vault, ref: vault.on("rename", () => this.schedule()) },
		);
	}

	stop() {
		for (const { source, ref } of this.refs) source.offref(ref);
		this.refs = [];
		this.clearTimers();
	}

	/**
	 * Runs one operation exclusively. Returns false without running it when
	 * another is still in flight. Errors are rethrown for the caller to report.
	 */
	async run(operation: () => Promise<void>): Promise<boolean> {
		if (this.busy) return false;
		this.running = true;
		try {
			await operation();
		} finally {
			this.running = false;
			this.settling = true;
			this.armFallback();
		}
		return true;
	}

	private schedule() {
		if (this.settleTimer !== null) window.clearTimeout(this.settleTimer);
		this.settleTimer = window.setTimeout(() => {
			this.settleTimer = null;
			// Events fired mid-operation are not the end of it.
			if (this.running) return;
			this.finishSettling();
		}, SETTLE_DELAY);
	}

	private armFallback() {
		if (this.fallbackTimer !== null) window.clearTimeout(this.fallbackTimer);
		this.fallbackTimer = window.setTimeout(() => {
			this.fallbackTimer = null;
			if (this.settling) this.finishSettling();
		}, SETTLE_FALLBACK);
	}

	private finishSettling() {
		this.settling = false;
		if (this.fallbackTimer !== null) {
			window.clearTimeout(this.fallbackTimer);
			this.fallbackTimer = null;
		}
		this.redraw();
	}

	private clearTimers() {
		if (this.settleTimer !== null) window.clearTimeout(this.settleTimer);
		if (this.fallbackTimer !== null) window.clearTimeout(this.fallbackTimer);
		this.settleTimer = null;
		this.fallbackTimer = null;
	}
}
