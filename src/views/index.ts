import { View, WorkspaceLeaf } from "obsidian";
import { LoreView } from "./base";
import { TimelineView, VIEW_TYPE_TIMELINE } from "../timeline/view";
import type LorePlugin from "../main";

export const VIEW_TYPE_LAWS = "plc-laws";
export const VIEW_TYPE_DRAFTS = "plc-drafts";
export const VIEW_TYPE_DASHBOARD = "plc-dashboard";

export { VIEW_TYPE_TIMELINE };

export class LawsView extends LoreView {
	readonly viewType = VIEW_TYPE_LAWS;
	readonly titleKey = "view.laws";
	readonly hintKey = "view.laws.hint";
	readonly icon = "scroll";
}

export class DraftsView extends LoreView {
	readonly viewType = VIEW_TYPE_DRAFTS;
	readonly titleKey = "view.drafts";
	readonly hintKey = "view.drafts.hint";
	readonly icon = "lightbulb";
}

export class DashboardView extends LoreView {
	readonly viewType = VIEW_TYPE_DASHBOARD;
	readonly titleKey = "view.dashboard";
	readonly hintKey = "view.dashboard.hint";
	readonly icon = "layout-dashboard";
}

export interface ViewDefinition {
	type: string;
	titleKey: string;
	commandKey: string;
	icon: string;
	/** Timelines need width, so they open as a tab instead of in the sidebar. */
	placement: "main" | "sidebar";
	create: (leaf: WorkspaceLeaf, plugin: LorePlugin) => View;
}

export const VIEW_DEFINITIONS: ViewDefinition[] = [
	{
		type: VIEW_TYPE_TIMELINE,
		titleKey: "view.timeline",
		commandKey: "command.openTimeline",
		icon: "git-branch",
		placement: "main",
		create: (leaf, plugin) => new TimelineView(leaf, plugin),
	},
	{
		type: VIEW_TYPE_LAWS,
		titleKey: "view.laws",
		commandKey: "command.openLaws",
		icon: "scroll",
		placement: "sidebar",
		create: (leaf, plugin) => new LawsView(leaf, plugin),
	},
	{
		type: VIEW_TYPE_DRAFTS,
		titleKey: "view.drafts",
		commandKey: "command.openDrafts",
		icon: "lightbulb",
		placement: "sidebar",
		create: (leaf, plugin) => new DraftsView(leaf, plugin),
	},
	{
		type: VIEW_TYPE_DASHBOARD,
		titleKey: "view.dashboard",
		commandKey: "command.openDashboard",
		icon: "layout-dashboard",
		placement: "sidebar",
		create: (leaf, plugin) => new DashboardView(leaf, plugin),
	},
];

export { LoreView, TimelineView };
