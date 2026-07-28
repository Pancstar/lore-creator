# Lore Creator

**English** · [Türkçe](README.tr.md)

An Obsidian plugin for building fictional universes — branching timelines,
versioned story fragments, custom calendars, and worldbuilding entities that
know how they relate to one another.

[![Obsidian](https://img.shields.io/badge/Obsidian-1.5.0%2B-7c3aed)](https://obsidian.md)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

> **Status:** early but complete. Every feature below works. Interfaces may still
> shift before 1.0, and the frontmatter schema is not yet frozen.

---

## Why

Worldbuilding notes rarely get written in order. You write part 1, leave it half
finished, jump to part 4, then go back to part 0. Later you decide the war
started twenty years earlier than you first wrote, and eight notes have to change
together — but you want to keep the old draft, because you are not sure yet.

Most tooling assumes you write forwards and never change your mind. This plugin
assumes the opposite:

- **Unfinished is a normal state**, not an error to clear.
- **A fragment can lead to different places in different drafts**, and switching
  drafts should reshape the timeline accordingly.
- **Nothing is deleted.** Old versions and unused ideas stay where you can find
  them.

Everything lives in ordinary Markdown with ordinary frontmatter. Uninstall the
plugin and your universe is still a readable set of notes.

---

## Concepts

Four ideas, kept deliberately separate:

| Concept | What it is | Part of the fiction? |
|---|---|---|
| **Timeline** | A reality — the main universe, or a parallel one | Yes |
| **Flow** | A lane inside a timeline, usually one character's thread. Lanes cross, merge, and split again | Yes |
| **Version** | A draft of one note. Carries its own time, flow and connections | No — an authoring tool |
| **Status** | `draft` · `partial` · `done` | No |

The distinction that matters most: **a parallel universe is a timeline; a second
attempt at the same scene is a version.** Confusing the two is the fastest way to
make a vault incoherent.

---

## Features

### Branching timeline canvas

Notes carrying a timeline id are laid out with time across the x axis and flows
as lanes. Connections come from `next` and `prev`, drawn as curves so converging
threads stay readable.

```
Explorer   First Signal ─── Second Signal ─── Silence
              ╲                                        Ascent
               ╲                                          ╱
Colony     Founding ── Divergence ── Convergence ── Dissolution
              ╲                  ╱
               ╰─── Long Road ──╯
```

- Boxes widen to show duration (`time-end`) and go dashed when approximate
  (`time-uncertain`).
- Notes with **no time yet** get their own lane instead of vanishing.
- Border colour reflects status; a dot marks fragments that have other versions.
- Pan, zoom, click through to any note.

### Versions that reshape the story

Each version of a note carries its prose *and* its time, flow and connections. In
one draft a scene leads to a battle; in another it leads somewhere else. Switch
versions and the timeline redraws.

The active version always stays at the note's own path, so `[[links]]` elsewhere
in the vault never break. Older versions wait in an archive folder and are found
by following `version-of` rather than by a list that could drift out of date.

**Version sets** name a snapshot of which version of each note is active. One
story revision usually touches many notes; without this, going back to the
earlier draft means remembering and flipping every one of them by hand.

Every file move is preceded by a dialog naming the exact paths, ordered so the
current content reaches its new home before anything overwrites it.

### Your own calendar

A universe does not have to run on Earth years.

```yaml
time: 134923.4521          # always a single sortable number
time-precision: date       # year · date · datetime
time-label: "Xen Year 134923, day 165"
earth-time: 2050           # optional reference for readers
```

Define the calendar once — unit name, epoch, days per unit, and how it maps to
Earth years — and the time picker fills in the number and the label for you. Or
leave the mapping out and write the label yourself.

### Types and entities

Characters, species, places, factions, objects, events, laws, drafts. Each type
brings its own fields, its own template and its own default icon.

The registry lives in a note's frontmatter, so **adding a type is editing a note,
not editing this plugin** — and any AI assistant reading your vault can see what
your types mean.

### Laws that know who breaks them

Universe-wide physics and entity-specific rules, kept as two layers. Entities
declare which laws they are subject to and which they break; the laws view
inverts those links so a law shows both. Laws can be scoped to particular
timelines, for when a parallel reality runs on different physics.

### Drafts you can promote

A shelf for ideas that have no home yet. Open one beside whatever you are
writing without losing your place. When an idea earns a place in the story,
promote it: pick the type and the folder, and choose whether the draft keeps its
text or hands it over. Either way the draft survives and the two notes reference
each other.

### Navigation

A bar under each note showing where it leads. Fragments often lead to more than
one place, so every destination gets its own button. Hover to preview the
destination on a map that can show the whole timeline or just what is one step
away — and can be pinned open.

An empty `next` means the thread ends there. Nothing is invented to fill it.

### Dashboard, search and export

- **Dashboard** — counts by type, everything unfinished (half-written sorted
  above untouched), and a consistency report.
- **Consistency** — broken links, one-sided connections, links that lead
  backwards in time, notes on a timeline with no date. **Advisory only:** it
  corrects nothing and blocks nothing, because most findings are work in
  progress rather than mistakes.
- **Search** — filters by type, status, timeline, flow and time range. Obsidian's
  own search already covers the words; this answers "every unfinished character
  in the main universe".
- **Export** — one Markdown document from the sections you choose. This is why
  notes carry no privacy flag: what a reader sees is decided when you share, not
  stored on every note forever.

---

## Getting started

### Install

Not yet in the community plugin browser. Until then:

1. Download `main.js`, `manifest.json` and `styles.css` from the
   [latest release](https://github.com/pancstar/lore-creator/releases/latest).
2. Put them in `<vault>/.obsidian/plugins/lore-creator/`.
3. In Obsidian: **Settings → Community plugins**, turn off Restricted Mode, then
   enable *Lore Creator*.

### Set up a vault

Run **Set up this vault** from the command palette. It creates the folders,
templates and type registry the views read from — previewing the exact tree
first, and never overwriting a file that already exists.

Folder names are chosen separately from the interface language: a universe is
written in whatever language its story is, which is not necessarily the language
of your menus.

### Write something

1. **New lore note** → pick *Timeline*, name it, give it a `timeline-id` such as
   `main`, and list its flows.
2. **New lore note** → pick *Story*. In the banner at the top, click the time to
   place it, and set `timeline` and `flow` in the properties.
3. Repeat, linking notes with `next`.
4. Open the timeline from the ribbon.

---

## How notes are described

Standard fields, on every lore note:

| Field | Meaning |
|---|---|
| `type` | Which type this is — the folder is only organisation |
| `icon` / `icon-type` | An emoji or a Lucide icon name |
| `status` | `draft` · `partial` · `done` |
| `aliases` | Obsidian's own field; resolves `[[Lord Kyle]]` to this note |
| `alias-history` | When and why a name changed |
| `related` | Free-form links |

Timeline placement, when a note has one:

| Field | Meaning |
|---|---|
| `timeline` | Which reality it belongs to |
| `flow` | Which lane |
| `time` | A single number. Sorting depends only on this. May be empty |
| `time-precision` | `year` · `date` · `datetime` |
| `time-label` | What readers see |
| `time-end` | Set when this spans a period rather than a moment |
| `time-uncertain` | Drawn dashed |
| `earth-time` | Optional reference, computed or written by hand |
| `next` / `prev` | Connections. More than one means the story branches |

Versioning:

| Field | Meaning |
|---|---|
| `version` | `v1`, `v2`, … |
| `version-name` | Optional label, also used in the archive filename |
| `version-note` | What is different about this draft |
| `version-of` | Present only on archived versions |

Laws and drafts:

| Field | Meaning |
|---|---|
| `scope` | `universe` or `local` |
| `applies-to` / `timeline-scope` | Where a law holds. Empty means everywhere |
| `laws` / `breaks-law` | Declared on entities; the laws view inverts them |
| `idea-for` | What a draft is an idea for |
| `promoted-to` / `promoted-from` | The two-way link left by a promotion |

---

## Commands

| Command | What it does |
|---|---|
| Set up this vault | Create folders, templates and the type registry |
| New lore note | Create a note from a type's template |
| Open timeline / laws / drafts / dashboard | Open a view |
| Versions of this note | List, create, switch and archive versions |
| Version sets | Capture and apply named snapshots |
| Go to the next / previous fragment | Follow a connection; asks when there are several |
| Promote this draft | Turn a sketch into a real note |
| Find in the universe | Search by field rather than by text |
| Export the universe | Build a single Markdown document |

---

## Settings

Every path is configurable; these are the defaults:

| Setting | Default |
|---|---|
| Universe file | `Universe.md` |
| Type registry | `System/Types.md` |
| Versions folder | `Versions` |
| Templates folder | `Templates` |
| Version sets file | `System/Version sets.md` |
| Exports folder | `Exports` |

Calendar settings are written into the universe note's frontmatter rather than
plugin data, so a vault stays self-describing even without the plugin installed.
The type registry lives in a note for the same reason.

Interface language follows Obsidian's own, or can be set explicitly. **English
and Turkish** are included. Frontmatter field names are English in every
language — they are data, not interface.

---

## Development

```bash
npm install
npm run dev     # esbuild watch — rebuilds main.js on save
npm run build   # type-check, then produce a minified main.js
```

The sources live outside any vault. To work on the plugin, point a vault's
plugin folder at this repository — a junction or symlink keeps it to one copy:

```bash
# Windows, no administrator rights needed
mklink /J "<vault>\.obsidian\plugins\lore-creator" "<path to this repo>"

# macOS and Linux
ln -s "<path to this repo>" "<vault>/.obsidian/plugins/lore-creator"
```

Obsidian does not reload plugins by itself.
[Hot Reload](https://github.com/pjeby/hot-reload) picks up rebuilds
automatically; without it, run *Reload app without saving* after each change.

Releases are tagged with the version number exactly, with no `v` prefix. Pushing
the tag builds the plugin and publishes `main.js`, `manifest.json` and
`styles.css` as individual assets, which is what Obsidian expects.

There are no runtime dependencies — nothing third-party is bundled into
`main.js`.

---

## Contributing

Issues and pull requests are welcome. Two things worth knowing before you start:

- The vault is the source of truth. Anything the plugin knows should be readable
  from the notes themselves, so a universe survives without it.
- Nothing destructive happens without a dialog naming the exact files, and file
  moves are ordered so a failure leaves a duplicate rather than a hole.

## License

[MIT](LICENSE) © PancstaR
