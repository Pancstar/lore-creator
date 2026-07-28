# PancstaR Lore Creator

An Obsidian plugin for designing fictional universes.

Worldbuilding notes rarely get written in order. You write part 1, leave it half
finished, jump to part 4, then go back to part 0. This plugin is built around
that: fragments carry their own place on a timeline, unfinished is a valid
state, and drafts of the same fragment can disagree with each other about what
happens next.

> **Status:** early development. The scaffold, settings and calendar handling
> work; the timeline canvas and the rest of the views are still placeholders.

## Concepts

The plugin keeps four ideas separate, and it matters that they stay separate:

| Concept | What it is | Where it lives |
|---|---|---|
| **Timeline** | A reality — the main universe, or a parallel one. Part of the fiction. | One note per timeline |
| **Flow** | A parallel lane inside a timeline, usually one character's thread. Lanes cross, merge, and split again. | Defined on the timeline note |
| **Version** | An author's draft. *Not* part of the fiction. | Active version in place, older ones in the versions folder |
| **Status** | How finished a note is: `draft`, `partial`, `done`. | Frontmatter |

A version carries more than text. It carries the note's time, flow and its
`next`/`prev` links, so switching versions can reshape the timeline itself — in
one draft a scene leads to a battle, in another it leads somewhere else
entirely.

## Time

Universes get their own calendars, and those calendars do not have to resemble
Earth's. A note's `time` is always a single number, because that is the only way
to sort reliably; `time-precision` says whether that number means a year, a
date, or a date and time, and `time-label` is what readers actually see.

An optional Earth-time reference can be shown alongside, either computed from
the calendar definition or written by hand per note, so that people reading the
universe for the first time have something to anchor to.

Time can also be a range (`time-end`), approximate (`time-uncertain`), or simply
unknown — a note with no time still belongs to its flow.

## Installation

Not yet in the community plugin browser. To try it now:

1. Clone or download this repository into
   `<vault>/.obsidian/plugins/pancstar-lore-creator/`
2. `npm install`
3. `npm run build`
4. In Obsidian: **Settings → Community plugins**, turn off Restricted Mode, then
   enable *PancstaR Lore Creator*.

## Development

```bash
npm install
npm run dev     # esbuild watch — rebuilds main.js on save
npm run build   # type-check, then produce a minified main.js
```

Obsidian does not reload plugins by itself. The
[Hot Reload](https://github.com/pjeby/hot-reload) plugin picks up rebuilds
automatically; without it, run *Reload app without saving* after each change.

## Vault layout

The plugin ships with defaults matching the vault it grew out of, but every path
is configurable in settings — nothing is hardcoded:

| Setting | Default |
|---|---|
| Universe file | `EVREN.md` |
| System folder | `_Sistem` |
| Versions folder | `_Sürümler` |
| Templates folder | `_Şablonlar` |

Calendar settings are written into the universe note's frontmatter rather than
plugin data, so a vault stays self-describing even without the plugin installed.

## Language

English and Turkish, following Obsidian's own locale by default. Frontmatter
field names are English in every language — they are data, not interface.

## License

MIT
