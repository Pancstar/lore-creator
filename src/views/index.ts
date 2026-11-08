import { View, WorkspaceLeaf } from "obsidian";
import { TimelineView, VIEW_TYPE_TIMELINE } from "../timeline/view";
import { LawsView, VIEW_TYPE_LAWS } from "./laws";
import { DraftsView, VIEW_TYPE_DRAFTS } from "./drafts";
import { DashboardView, VIEW_TYPE_DASHBOARD } from "./dashboard";
import type LorePlugin from "../main";
import { GuideView, VIEW_TYPE_GUIDE } from "../guide/view";

export { VIEW_TYPE_TIMELINE, VIEW_TYPE_LAWS, VIEW_TYPE_DRAFTS, VIEW_TYPE_DASHBOARD, VIEW_TYPE_GUIDE };

export interface ViewDefinition {
	type: string;
	titleKey: string;
	commandKey: string;
	icon: string;
	/** Timelines need width, so they open as a tab instead of in the sidebar. */
	placement: "main" | "sidebar";
	/**
	 * Only the timeline earns a ribbon button. The other views are a command
	 * away, and four buttons for one plugin crowds out everything else.
	 */
	ribbon?: boolean;
	create: (leaf: WorkspaceLeaf, plugin: LorePlugin) => View;
}

export const VIEW_DEFINITIONS: ViewDefinition[] = [
	{
		type: VIEW_TYPE_TIMELINE,
		titleKey: "view.timeline",
		commandKey: "command.openTimeline",
		icon: "git-branch",
		placement: "main",
		ribbon: true,
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
	{
		type: VIEW_TYPE_GUIDE,
		titleKey: "view.guide",
		commandKey: "command.openGuide",
		icon: "book-open",
		placement: "main",
		// The guide is how a newcomer finds their way back, so it earns a button.
		ribbon: true,
		create: (leaf, plugin) => new GuideView(leaf, plugin),
	},
];

export { TimelineView, LawsView, DraftsView, DashboardView, GuideView };
