/**
 * English copy for the in-plugin guide. Written so a primary-school child can
 * follow it: short sentences, everyday words, one idea at a time. The same
 * picture is used for each idea everywhere:
 * universe = a cupboard with shelves, note = a page, timeline = a washing
 * line, flow = a road, next/prev = arrows between pages, version = an old draft
 * in a drawer, version set = a bookmark, law = a rule of your world,
 * draft = a sticky note.
 */
export const guideEn: Record<string, string> = {
	// Shell
	"guide.back": "← {0}",
	"guide.next": "{0} →",
	"guide.progress": "Chapter {0} of {1} · about {2} min",
	"guide.curious": "For the curious",
	"guide.faq.search": "Type a word to find a question…",
	"guide.faq.empty": "No question matches that. Try a shorter word.",
	"guide.badge.example": "example",
	"guide.group.start": "Getting started",
	"guide.group.writing": "While writing",
	"guide.group.tracking": "Keeping track",
	"guide.group.help": "Help",

	// Actions
	"guide.action.createExample": "Make an example story",
	"guide.action.removeExample": "Remove the example story",
	"guide.action.setup": "Set up my universe",
	"guide.action.timeSystem": "Set up my time",
	"guide.action.newNote": "Write a new note",
	"guide.action.openTimeline": "Open the timeline",
	"guide.action.openDashboard": "Open the dashboard",

	// 1. Intro
	"guide.intro.title": "What is Lore Creator?",
	"guide.intro.1":
		"When you write a story, a lot of things happen. There are people, places and events. Remembering all of them is hard.",
	"guide.intro.2":
		"Lore Creator keeps them tidy for you. You write each thing on its own page. The plugin puts the pages in order, so you can see what happens when.",
	"guide.intro.3":
		"You do not need to learn everything today. Read a chapter, try it, and come back when you want more.",
	"guide.intro.tip": "Think of it as a big notebook that sorts its own pages.",
	"guide.intro.example":
		"Want to look around first? Make a small example story. It goes into its own folder and never mixes with your own pages. You can remove it with one button.",
	"guide.intro.exampleThere": "✅ The example story is in your vault. Open the timeline and choose \"The Lantern Keepers\" to see it.",

	// 2. Setup
	"guide.setup.title": "Set up your universe",
	"guide.setup.1":
		"Every story has a world. We call it your universe. Your universe is like a cupboard. It has shelves: one for people, one for places, one for events, and more.",
	"guide.setup.2":
		"Press the button below. First it shows you every folder and page it will make. Only when you say yes does it make them.",
	"guide.setup.done": "✅ Your universe is already set up. You can skip this step.",
	"guide.setup.tip": "Nothing you already wrote is deleted or changed. The plugin only adds new folders and pages.",

	// 3. Time
	"guide.time.1":
		"Your world may not use Earth years. Maybe a year there has 400 days. Maybe people count in \"cycles\". That is fine.",
	"guide.time.2":
		"Here you tell the plugin how time works in your world: what a year is called and how many days it has.",
	"guide.time.3":
		"If you want, you can also link your world to Earth. Then every date also shows the Earth year next to it.",
	"guide.time.title": "Your time",
	"guide.time.tip": "Not sure? Keep 365 days. You can change it any time, and your dates stay on the same day.",
	"guide.time.curious":
		"Each note keeps its time as one number, like 7.27. The whole part is the year, the rest is how far into the year it is. The time settings live on your universe note as time-name, time-unit, time-days, time-earth-epoch and time-earth-ratio.",

	// 4. First note
	"guide.firstNote.title": "Your first note",
	"guide.firstNote.1":
		"A note is one page. Each page is about one thing: a person, a place, an event or a rule.",
	"guide.firstNote.2":
		"When you make a note, you choose what kind of thing it is. The plugin then puts it on the right shelf and gives it a small banner on top.",
	"guide.firstNote.3":
		"The banner shows what the note is, how finished it is, and when it happens. Click the colourful \"Draft\" badge to mark it half done or done.",
	"guide.firstNote.tip": "You can also make notes the normal Obsidian way. The plugin still finds them.",
	"guide.firstNote.curious":
		"The kind of note is stored as type (character, place, event, law, draft…) and how finished it is as status (draft, partial, done).",

	// 5. Timeline
	"guide.timeline.title": "The timeline",
	"guide.timeline.1":
		"The timeline is like a washing line. Your pages hang on it in time order: early on the left, later on the right.",
	"guide.timeline.2":
		"A page shows up on the line when it has a time. Open the page, click the time in its banner, and pick a year (and a day, if you like).",
	"guide.timeline.3":
		"You can drag a page left or right to change when it happens. Drag it up or down to move it to another road.",
	"guide.timeline.tip": "Lost on the timeline? Press \"Fit to view\" in its toolbar to see everything at once.",
	"guide.timeline.curious":
		"A note joins a timeline through its timeline field, its road through flow, and its moment through time and time-precision (year, date or datetime).",

	// 6. Flows
	"guide.flows.title": "Flows (roads)",
	"guide.flows.1":
		"In a story, many things can happen at the same time. The hero is in the mountains while the village is on fire.",
	"guide.flows.2":
		"Each of these is a road. We call a road a flow. On the timeline, every flow is its own row, so the roads run side by side.",
	"guide.flows.3":
		"To add or rename a road, click its name on the left of the timeline.",
	"guide.flows.tip": "Two roads can meet: just connect a page on one road to a page on the other.",
	"guide.flows.curious": "Flows are listed on the timeline note under flows, as id: Name.",

	// 7. Links
	"guide.links.title": "Connecting notes",
	"guide.links.1":
		"Pages can point to each other with arrows. \"Next\" says what happens after this page. \"Back\" says what came before.",
	"guide.links.2":
		"Under every connected page you will see a small bar. Its buttons take you to the page before or after. Hover a button to see where it leads on a little map.",
	"guide.links.3":
		"A page can have more than one \"next\". That is how a story splits into two roads.",
	"guide.links.tip": "Lost in your story? Follow the arrows. They always lead back to the main road.",
	"guide.links.curious": "The arrows are the next and prev fields, each a list of links like [[Storm]].",

	// 8. Dashboard
	"guide.dashboard.title": "Dashboard: what is unfinished",
	"guide.dashboard.1":
		"Writing takes many days. The dashboard shows where you left off.",
	"guide.dashboard.2":
		"It counts your pages and lists the ones that are not finished yet. Half-done pages come first, because those are the ones you were working on.",
	"guide.dashboard.3":
		"At the bottom there is a \"Consistency\" check. Open it and it points at small mix-ups, like an arrow to a page that does not exist.",
	"guide.dashboard.tip": "The check only gives hints. It never changes anything for you.",

	// 9. Versions
	"guide.versions.title": "Versions",
	"guide.versions.1":
		"Sometimes you want to try a scene another way, but you are scared to lose the old one.",
	"guide.versions.2":
		"Make a new version. The old page goes into a drawer, and you keep writing on a fresh copy. You can always take the old one out again.",
	"guide.versions.3":
		"A version set is like a bookmark. It remembers which version of every page was out, so you can switch the whole story back in one go.",
	"guide.versions.tip": "A small dot on a timeline page means it has other versions in the drawer.",

	// 10. Laws and drafts
	"guide.lawsDrafts.title": "Laws and ideas",
	"guide.lawsDrafts.1":
		"A law is a rule of your world, like \"magic needs moonlight\". Write each law on its own page.",
	"guide.lawsDrafts.2":
		"Pages can say which laws they follow and which they break. The laws list then shows, for every rule, who keeps it and who breaks it.",
	"guide.lawsDrafts.3":
		"An idea that has no place yet can be a draft. A draft is like a sticky note on the side. When it is ready, promote it and it becomes a real page.",
	"guide.lawsDrafts.tip": "Not sure where an idea belongs? Make it a draft. It waits safely until you decide.",
	"guide.lawsDrafts.curious":
		"Pages point at laws with laws and breaks-law. A draft points at the page it is for with idea-for.",

	// FAQ
	"guide.faq.title": "Questions and answers",
	"guide.faq.1.q": "What is a flow?",
	"guide.faq.1.a":
		"A flow is one road in your story. When two things happen at the same time in different places, each one gets its own road. On the timeline every road is its own row.",
	"guide.faq.2.q": "Why can't I see my note on the timeline?",
	"guide.faq.2.a":
		"A page only hangs on the line when it belongs to a timeline and has a time. Open the page, click the time in its banner and pick one. If you have several timelines, also check the one chosen at the top of the timeline.",
	"guide.faq.3.q": "Where do I see my unfinished notes?",
	"guide.faq.3.a": "Open the dashboard. It lists every page that is still a draft or half done.",
	"guide.faq.4.q": "How do I set the time or change my calendar?",
	"guide.faq.4.a":
		"Open the command palette and choose \"Edit time system\", or use the button in chapter 3. There you set the name of your years, how many days they have, and the link to Earth.",
	"guide.faq.5.q": "What happens to my notes if I change the days in a year?",
	"guide.faq.5.a":
		"The plugin asks you first. Choose \"Keep their days\" and every dated page stays on the same day in the new calendar. If a day no longer exists, it moves to the last day of that year.",
	"guide.faq.6.q": "What is a version, and how do I go back to an old one?",
	"guide.faq.6.a":
		"A version is an older copy of a page, kept in a drawer. Open the page and choose \"Versions of this note\" in the command palette (or click the version badge in its banner, if it has one). Then press the switch button next to the version you want back.",
	"guide.faq.7.q": "What is a version set?",
	"guide.faq.7.a":
		"A bookmark for your whole story. It remembers which version of every page was out, so you can put them all back at once.",
	"guide.faq.8.q": "My note says \"Draft\". What does that mean?",
	"guide.faq.8.a":
		"It means the page is not finished yet. Click the badge to change it to half done or done. The dashboard uses this to show what is left.",
	"guide.faq.9.q": "Can I delete the example story?",
	"guide.faq.9.a":
		"Yes. Go to chapter 1 and press \"Remove the example story\". Its pages go to the trash, so you can still get them back.",
	"guide.faq.10.q": "Does the plugin ever delete or change my notes by itself?",
	"guide.faq.10.a":
		"No. Anything that moves, changes or deletes pages first shows you exactly what will happen and waits for your yes. Deleted pages go to the trash.",
	"guide.faq.11.q": "Where did the properties box go on my notes?",
	"guide.faq.11.a":
		"On story pages the banner already shows the important things, so the box is hidden there to keep things calm. You can still see and edit everything in the \"File properties\" panel on the right side.",
	"guide.faq.12.q": "Can I write in my own language?",
	"guide.faq.12.a":
		"Yes. Write your pages in any language. The plugin itself speaks English and Turkish; pick one in its settings.",
	"guide.faq.13.q": "What is the difference between a timeline and a flow?",
	"guide.faq.13.a":
		"A timeline is a whole version of history. A flow is one road inside it. Most stories need one timeline with a few roads. A second timeline is for an \"other world\" where things went differently.",
	"guide.faq.14.q": "How do I open this guide again?",
	"guide.faq.14.a":
		"Click the book icon on the left ribbon, use \"Open guide\" in the command palette, or find it in the plugin's settings under Help.",

	// Diagrams
	"guide.diagram.universe": "Universe",
	"guide.diagram.characters": "People",
	"guide.diagram.places": "Places",
	"guide.diagram.events": "Events",
	"guide.diagram.laws": "Laws",
	"guide.diagram.time": "time →",
	"guide.diagram.laneA": "Hero",
	"guide.diagram.laneB": "Village",
	"guide.diagram.event1": "Storm",
	"guide.diagram.event2": "Climb",
	"guide.diagram.event3": "Fire",
	"guide.diagram.next": "next",
	"guide.diagram.prev": "back",
	"guide.diagram.desk": "On the desk",
	"guide.diagram.drawer": "In the drawer",
	"guide.diagram.draft1": "v1",
	"guide.diagram.draft2": "v2",
};
