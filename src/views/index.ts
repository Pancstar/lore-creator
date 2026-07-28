import { WorkspaceLeaf } from "obsidian";
import { LoreView } from "./base";
import type LorePlugin from "../main";

export const VIEW_TYPE_TIMELINE = "plc-timeline";
export const VIEW_TYPE_LAWS = "plc-laws";
export const VIEW_TYPE_DRAFTS = "plc-drafts";
export const VIEW_TYPE_DASHBOARD = "plc-dashboard";

export class TimelineView extends LoreView {
	readonly viewType = VIEW_TYPE_TIMELINE;
	readonly titleKey = "view.timeline";
	readonly hintKey = "view.timeline.hint";
	readonly icon = "git-branch";
}

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
	create: (leaf: WorkspaceLeaf, plugin: LorePlugin) => LoreView;
}

export const VIEW_DEFINITIONS: ViewDefinition[] = [
	{
		type: VIEW_TYPE_TIMELINE,
		titleKey: "view.timeline",
		commandKey: "command.openTimeline",
		icon: "git-branch",
		create: (leaf, plugin) => new TimelineView(leaf, plugin),
	},
	{
		type: VIEW_TYPE_LAWS,
		titleKey: "view.laws",
		commandKey: "command.openLaws",
		icon: "scroll",
		create: (leaf, plugin) => new LawsView(leaf, plugin),
	},
	{
		type: VIEW_TYPE_DRAFTS,
		titleKey: "view.drafts",
		commandKey: "command.openDrafts",
		icon: "lightbulb",
		create: (leaf, plugin) => new DraftsView(leaf, plugin),
	},
	{
		type: VIEW_TYPE_DASHBOARD,
		titleKey: "view.dashboard",
		commandKey: "command.openDashboard",
		icon: "layout-dashboard",
		create: (leaf, plugin) => new DashboardView(leaf, plugin),
	},
];

export { LoreView };
