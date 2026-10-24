# co-presence API

Exact names and defaults for `@marigameo/co-presence` 0.1.x. The guide is [SKILL.md](SKILL.md).

## Data

```ts
interface CoPresenceData {
  goal?: Goal;                      // with one: a card; without: a strip
  actors: Actor[];
  selfId?: string;                  // the actor using this screen
}

interface Goal {
  title: string;                    // "Refresh the Q3 pricing deck"
  status?: 'running' | 'paused' | 'done' | 'failed';   // default 'running'
  detail?: string;                  // "3 of 5 sections"
  progress?: number;                // 0–1; left out means unknown, and no bar shows
  startedAt?: number | string;      // epoch ms or ISO 8601
}

interface Actor {
  id: string;                       // stable; the key for every update
  kind: 'person' | 'agent';         // circle or rounded square
  name: string;
  avatar?: string;                  // image URL; coloured initials otherwise
  parentId?: string;                // the agent that started this one: "via Planner"
  activity?: Activity;              // left out: here but idle
}

interface Activity {
  type: 'waiting' | 'failed' | 'editing' | 'commenting' | 'working' | 'viewing' | 'done';
  label?: string;                   // the host's own words: "Searching the logs"
  target?: string;                  // the part it's on: "§2 Pricing"
  waitingOn?: string;               // waiting only: the actor id it needs; selfId reads "Needs you"
  progress?: number;                // 0–1
  startedAt?: number | string;      // shown as "for 4 min" in the roster; nothing is counted without it
}
```

## Activity types

In order of importance: the relay, the stack and the roster all use it.

| Type | Default words | Tone | Announced |
| --- | --- | --- | --- |
| `waiting` | "Needs you" (waitingOn is selfId), "Waiting on {name}", "Waiting" | Amber, a mark that pings twice | Yes |
| `failed` | "Failed" + label | Red, a square mark | Yes |
| `editing` | "Editing {target}" / "Editing" | Green mark | No |
| `commenting` | "Commenting on {target}" / "Commenting" | Green mark | No |
| `working` | "Working on {target}" / "Working" | Green mark | No |
| `viewing` | "Viewing" (person), "Reading" (agent) | No mark | No |
| `done` | "Done" | No mark | No |
| *(none)* | "Idle" | The face goes grey | No |

A `label` replaces the default words for editing, commenting, working and viewing. On waiting, failed and done it is shown after them as the detail.

## Events: `apply(event | event[])`

| Event | Fields | Does |
| --- | --- | --- |
| `snapshot` | `data` | Replaces everything. Actors still there keep their place; actors gone leave with the usual dwell |
| `goal` | `goal: Partial<Goal> \| null` | Merges into the goal; `null` removes it (the card becomes a strip) |
| `join` | `actor` | Adds an actor. An id already there is updated instead |
| `leave` | `id` | Removes one. An unknown id is ignored |
| `activity` | `id`, `activity \| null` | Replaces that actor's activity; `null` makes them idle. For an id not joined yet: held until its join when it has `at`, ignored without |
| `update` | `id`, `actor: Partial<{ kind, name, avatar, parentId }>` | Changes who they are, not what they do |

Every event takes `at` (epoch ms). An event older than the last one applied to the same actor (or to the goal) is dropped. Without `at`, events apply in arrival order. A snapshot with `at` keeps what changed after it was taken; one without `at` replaces everything. `el.data = …` is a snapshot without `at`.

## Attributes and properties

| Attribute | Property | Values | Default |
| --- | --- | --- | --- |
| – | `data` | Set: a snapshot. Get: the current normalised data (actors that are leaving are left out) | – |
| `max` | `max` | Faces before +N | `4` |
| `selectable` | `selectable` | Roster rows become buttons that fire `copresence-select` | `false` |
| `collapsed` | `collapsed` | Only what needs attention. Reflected | `false` |
| `connection` | `connection` | `live` · `connecting` · `offline` | `live` |
| `dir` | – | `rtl` mirrors the layout | inherited |
| – | `labels` | `Partial<Labels>`; the getter returns a copy | English |

The language for plurals, numbers and durations is the nearest `lang` attribute, otherwise the document's.

## Methods

| Method | Does |
| --- | --- |
| `apply(event \| event[])` | One event or a batch |
| `openRoster()` / `closeRoster()` | The full list, as a popover |

## Events

All bubble, are `composed`, and are typed on `HTMLElementEventMap`.

| Event | `detail` | When |
| --- | --- | --- |
| `copresence-select` | `{ actor: Actor }` | A roster row was picked (`selectable` only) |
| `copresence-toggle` | `{ collapsed: boolean }` | The card's collapse button was pressed. A strip has none |
| `copresence-roster` | `{ open: boolean }` | The roster opened or closed |

## Labels

`el.labels = { needsYou: 'Te necesita', working: 'Trabajando' }`. Every visible string and announcement has a key. Templates use `{name}`, `{target}`, `{time}`, `{names}`, `{other}`, `{title}`, `{status}`. Counts are plurals, `{ one: '# agent', other: '# agents' }`, with optional `zero`, `two`, `few`, `many`, picked by `Intl.PluralRules`; `#` is the number formatted by `Intl.NumberFormat`.

Keys: `needsYou`, `waiting`, `waitingOn`, `failed`, `editing`, `editingOn`, `commenting`, `commentingOn`, `working`, `workingOn`, `viewing`, `viewingOn`, `reading`, `readingOn`, `done`, `idle`, `running`, `paused`, `goalDone`, `goalFailed`, `onThisNow`, `needsAttention`, `you`, `via`, `forTime`, `starting`, `underAMinute`, `connecting`, `reconnecting`, `collapse`, `expand`, `person`, `agent`, `unnamedPerson`, `unnamedAgent`; plurals `people`, `agents`, `needYou`, `failedCount`, `waitingCount`, `others`; announcements `joined`, `left`, `announceNeedsYou`, `announceFailed`, `announceWaiting`, `announceWaitingOn`, `announceGoal`.

## Tokens

Set on the element or any ancestor. Defaults follow the page's `color-scheme` through `light-dark()`.

| Token | Default (light / dark) | Used for |
| --- | --- | --- |
| `--copresence-surface` | `#ffffff` / `#1c1c1c` | The card, and the cut-outs around faces and marks. **Set it to the colour behind the element** |
| `--copresence-ink` | `#171717` / `#ededed` | Names, the goal |
| `--copresence-muted` | `#6b6b6b` / `#a3a3a3` | Activities, times, counts |
| `--copresence-line` | `#ebebeb` / `#2e2e2e` | Hairlines, the progress track |
| `--copresence-attention` | `#a14a06` / `#f5b83d` | Waiting on a person |
| `--copresence-danger` | `#b42318` / `#f97066` | Failed |
| `--copresence-live` | `#1f9d55` / `#3fbf74` | Doing something |
| `--copresence-face-fill` | `#f3f3f3` / `#2e2e2e` | Behind images, and idle faces |
| `--copresence-face-ink` | `#525252` / `#d4d4d4` | Initials on the neutral fill |
| `--copresence-face` | `36px` | Face size |
| `--copresence-radius` | `26px` | The card's corner |
| `--copresence-font` | inherited | Font family |

No `::part()`s: the structure is not part of the API.

## Timing

| Name | Value | Means |
| --- | --- | --- |
| `MIN_DWELL` | 1200 ms | A leaving actor stays at least this long after it joined |
| `RELAY_HOLD` | 2000 ms | The relay keeps an equal or less important line this long; needs-you and failed skip it |
| `ANNOUNCE_BATCH` (exported) | 1000 ms | Joins and leaves within it are announced as one sentence |
| Fresh time | 5000 ms | A roster duration younger than this isn't shown |
| Tombstones | 500 ids | Left actors whose last `at` is remembered, so a late event can't bring them back |

## Frameworks

| | |
| --- | --- |
| React 19 | `<co-presence data={d} max={5} selectable oncopresence-select={(e) => …} />`; `import '@marigameo/co-presence/react'` once for the JSX types (empty at runtime). Objects are set as properties, so `d` must keep its identity (a constant or `useMemo`): a new object is a new snapshot. Ref type: `CoPresence` |
| Vue 3 | `isCustomElement: (t) => t === 'co-presence'`, then `:data="d"` (or `.data`) and `@copresence-select` |
| Svelte 5 | `<co-presence data={d} oncopresence-select={…} />` |
| Angular | `CUSTOM_ELEMENTS_SCHEMA`; bind `[data]` as a property |
| Astro, Next, Nuxt | Safe to import on the server; nothing runs until a browser defines it |

## Warnings

`<co-presence> <message>` in the console, once per kind of problem, never per event. Codes: `bad-event`, `no-id`, `no-name`, `bad-kind`, `bad-type`, `bad-status`, `bad-progress`, `bad-time`, `duplicate-id`, `no-title`.

| Input | Becomes |
| --- | --- |
| No `name` | "Unnamed person" / "Unnamed agent" |
| Unknown activity `type` | `working`, label kept |
| Unknown `kind` | `person` |
| `progress` outside 0–1 / not a number | Clamped / dropped |
| Duplicate ids in a snapshot | The last one wins |
| `parentId` or `waitingOn` pointing at no one | No "via"; "Waiting" |
| An actor without a string id, a goal without a title | Dropped |

## Size and support

About 15 KB gzipped, no runtime dependencies. Needs `light-dark()`, the Popover API and `Intl.Segmenter`: current Chrome, Edge, Firefox and Safari 17.5+.
