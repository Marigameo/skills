---
name: show-co-presence
description: Guide to co-presence, the web component that shows who is working on a shared goal, people and agents together, what each is doing right now, and anything waiting on you. Covers when it earns its place and when to leave it out, strip or card, feeding it a snapshot and backend events, mapping an agent loop onto it (Claude Agent SDK hooks, or a set_activity tool the model calls so it reports what it's doing in plain words), writing activity labels, theming, languages, and the usual fixes. Use when working with co-presence, <co-presence>, @marigameo/co-presence, or when a multi-agent or multiplayer product needs to show who is on a task and what needs the user.
---

# Working With co-presence

## Initial Response

When this skill is invoked on its own, with no question or task, respond only with:

> I'm ready to put co-presence in your product and help your agents say what they're doing, my knowledge comes from its author, Mari.

Do not provide any other information until the user asks a question. When it comes with a task ("add it to my app", "why is the agent showing twice"), skip this and do the task.

A guide skill for [co-presence](https://github.com/marigameo/co-presence) (`@marigameo/co-presence`), a zero-dependency web component that shows who is working on one goal, people and agents together, what each of them is doing right now, and anything waiting on the person looking at it. Answer from this file first. The exact data shape, events, labels, tokens and warning codes are in [API.md](API.md); read it when you need a precise name or default.

## When to use it

It's for what a thread or an artifact can't show on its own. Use it when at least one of these is true:

- **More than one actor is on the same thing**: two people, or two agents, or agents working in the background while people view, edit or comment.
- **Agents work quietly**: sub-agents searching, editing or running tools whose changes would otherwise arrive unexplained.
- **Something can wait on a person**: an approval or a question that must not be missed. "Needs you" goes first, in amber, and is announced.
- **The state comes from a backend**: it takes events as they happen (`join`, `activity`, `leave`), late, duplicated or out of order, without glue code.

## When to leave it out

| The situation | Do instead |
| --- | --- |
| One person and one agent, working one thing at a time | Nothing: the thread already says who is doing what, and the strip only repeats it. Mount it when a second person joins or a second agent starts |
| You want a history of what happened | A log or timeline. co-presence keeps only each actor's latest activity |
| You want cursors, selections or highlights on the document | The host draws those. Use each actor's `target` to put them in the right section |
| You want pause, stop or retry per agent | Set `selectable` and show your own actions on `copresence-select`. Controls aren't in the component |
| You want a tree of agents and their sub-agents | It's flat on purpose; `parentId` shows as "via Planner" |
| You want to ask the user the question | That's [agent-clarifier](https://github.com/marigameo/agent-clarifier). The two pair: co-presence says "Needs you", the card asks it (see "Pairing with agent-clarifier") |
| You want "who's online" across a whole app | It's scoped to one goal or one artifact. Give each its own element |
| You need a socket or SSE client | Not shipped. You bring the connection; it takes the events and `connection` |

## Setup

```sh
npm install @marigameo/co-presence
```

```js
import '@marigameo/co-presence'; // defines <co-presence>
```

Importing on a server (Astro, Next, Nuxt) is safe. From a CDN, pin the version. React 19: `import '@marigameo/co-presence/react'` once for the JSX types.

React traps:

- **`data` must keep its identity.** React sets it again whenever the object changes, and every set is a snapshot without `at` that replaces everything. Pass a constant or a memoised object for the first snapshot, and send everything after it through `apply()`. Never `data={{ … }}` inline.
- **The ref type is `CoPresence`:** `useRef<CoPresence>(null)`, with `import type { CoPresence } from '@marigameo/co-presence'`.

```html
<co-presence selectable></co-presence>
```

```js
const el = document.querySelector('co-presence');
// A snapshot on connect…
el.data = { selfId: 'me', actors: [{ id: 'me', kind: 'person', name: 'Mari S' }] };
// …then events as they happen.
el.apply({ type: 'join', actor: { id: 'logs', kind: 'agent', name: 'Logs agent', activity: { type: 'working', label: 'Searching the logs' } } });
el.apply({ type: 'activity', id: 'logs', activity: { type: 'waiting', waitingOn: 'me', label: 'Okay to restart the pool?' } });
```

Four rules for the feed:

1. **Ids are stable.** Every update keys on `id`. A new id per run makes a new face.
2. **Send `at` (epoch ms) on every event.** An event older than the last one for that actor is dropped, so a late "editing" can't bring back an agent that left. Without `at`, events apply in arrival order.
3. **Subscribe, then fetch.** Open the event stream first, then apply the snapshot as `{ type: 'snapshot', data, at }` with the time it was taken: anything newer that already arrived stays. `el.data = …` is a snapshot without `at` and replaces everything.
4. **A snapshot is everyone.** Whoever isn't in it leaves. When the server knows the people but the agents run in your own loop (in this tab, say), build each snapshot from both: the server's people plus the agents still running. Otherwise a refetch after a reconnect removes every running agent.

An `activity` for an id that hasn't joined yet is held until its join, when it has `at` (the network reordered them). If your feed's events don't carry names, send `join` with the name you know before the first activity.

## Strip or card

| | Strip (no `goal`) | Card (with a `goal`) |
| --- | --- | --- |
| Shows | Faces, +N, and one line | The goal's title, state and time, optional progress, then faces and the line |
| Box | None: no border, no fill | A rounded card |
| Collapse | No button. Set `collapsed` yourself, and give people your own control if they should choose | Its own chevron; fires `copresence-toggle` |
| Put it | By a chat's message box, or in a header | On top of the artifact panel the swarm is working on |

Pick by what the goal is. A run or an incident (people and agents on the whole thing, much of it away from any one document) is a strip in the header. Work on one artifact is a card on top of that artifact's panel.

**It has no width of its own.** The element is a size container (`container-type: inline-size`), so it takes its width from its parent. In a flex row, like most headers, give it `flex: 1 1 240px` or a width; left to itself it collapses to 0 and its faces spill past the edge.

Send `{ type: 'goal', goal: null }` to drop the goal and turn a card back into a strip.

What it decides for you, so don't fight it in the host:

- **You aren't in the stack** (`selfId`): you know you're here. You're first in the roster, as "You".
- **Order:** whoever needs attention first, then join order. Activity changes never reshuffle faces.
- **+N past `max`** (default 4). Whoever needs you is never hidden in +N.
- **The line** is the single most important activity, held at least 2 s so it can be read. Needs-you and failed skip the hold.
- **Short-lived agents** stay at least 1.2 s after they joined, so a burst of one-shot sub-agents is seen, not flickered.

## Saying what an actor is doing

The `type` carries the meaning (colour, order, announcement, default words); the `label` says it in your product's words.

| The actor is | Send | Shows |
| --- | --- | --- |
| Stuck until a person acts | `waiting` + `waitingOn: <their id>` | "Needs you" (when it's `selfId`) or "Waiting on Priya", amber, announced |
| Stopped by an error it won't recover from | `failed` + the reason as `label`, and no `leave` | Red, a square mark, announced. It stays until the user acts on it (Retry or dismiss from `copresence-select`) or the next run joins it again; then send `leave` or the new activity |
| Changing the artifact | `editing` + `target` | "Editing §2 Pricing", green |
| Adding a comment | `commenting` + `target` | "Commenting on §2 Pricing", green |
| Busy away from the artifact: thinking, searching, running tools | `working` + `label` | "Searching the logs", green |
| Only looking, or just opened the page | `viewing` | "Viewing" (person), "Reading" (agent), no mark |
| Finished, about to leave | `done`, then `leave` | "Done", no mark. Send `leave` right away: "Done" is seen only while the face is still on screen, so a long-running agent often leaves without it being read. That's fine |
| Here, doing nothing | `activity: null` | "Idle", a grey face |

Writing labels:

- **2 to 5 words, starting with a verb**, in the user's terms: "Searching payments-api logs", "Drafting the status update". Never a tool or function name ("grep_tool", "Bash").
- **A waiting label is the question, cut to fit**: "Okay to restart the pool?", not the full sentence the person is reading.
- **Don't repeat the name or the type.** The name is already beside it; "Logs agent is working on searching" says it three times.
- **`target` is the part as the user sees it**: "§2 Pricing", "Mitigation", not an id or a path.
- **Amber only when it's true.** Send `waiting` when the question is actually on screen, and replace it the moment it's answered. A stale "Needs you" teaches people to ignore it.
- **Red only when it stopped.** A tool call that failed and was retried is still `working`.
- **`startedAt`** when you know it: the roster shows "for 4 min". Nothing is counted without it.
- **`progress`** only when it's measured. Left out, no bar shows, which is better than a guess.

## Tell the agents what to report

The model never sees this file. Who joined, who left, and when something failed or is waiting is known by your loop, so the **host** sends those, never the model. What the model adds is the *words*: what it's doing, in plain language. Three routes:

| Your stack | Do |
| --- | --- |
| Claude Agent SDK | Nothing to define. Map its hooks to events (below); labels come from a tool-name map |
| Your own tool loop | Send join, leave and failed from the loop, and register the `set_activity` tool so the model says what it's doing |
| Any backend (queues, workers, a workflow engine) | Emit the event format from wherever the work happens: a job starting is `join`, a step is `activity`, the end is `done` + `leave` |

### Claude Agent SDK

The hooks run on your server, so `send()` is your own transport (SSE, WebSocket) and the browser calls `el.apply(event)`. Hooks fire with `agent_id` set when they run inside a sub-agent; the main agent has none.

```js
import { query } from '@anthropic-ai/claude-agent-sdk';

const MAIN = 'main'; // the main agent's actor id, joined with the snapshot
const latest = new Map(); // actor id → the last activity sent; have send() record it
const LABELS = { Read: 'Reading files', Grep: 'Searching the code', Glob: 'Finding files', Edit: 'Editing files', Write: 'Writing a file', Bash: 'Running a command', WebSearch: 'Searching the web', WebFetch: 'Reading a page' };
const on = (fn) => [{ hooks: [async (input) => { fn(input); return {}; }] }];

const run = query({
  prompt,
  options: {
    hooks: {
      SubagentStart: on((i) => send({ type: 'join', at: Date.now(), actor: { id: i.agent_id, kind: 'agent', name: i.agent_type, parentId: MAIN, activity: { type: 'working', startedAt: Date.now() } } })),
      PreToolUse: on((i) => send({ type: 'activity', id: i.agent_id ?? MAIN, at: Date.now(), activity: { type: 'working', label: LABELS[i.tool_name] ?? 'Working', startedAt: Date.now() } })),
      SubagentStop: on((i) => {
        send({ type: 'activity', id: i.agent_id, at: Date.now(), activity: { type: 'done' } });
        send({ type: 'leave', id: i.agent_id, at: Date.now() });
      }),
    },
    // A permission prompt is a person being waited on.
    canUseTool: async (toolName, input, { agentID }) => {
      const id = agentID ?? MAIN;
      const before = latest.get(id);
      send({ type: 'activity', id, at: Date.now(), activity: { type: 'waiting', waitingOn: selfId, label: `Okay to use ${toolName}?` } });
      // Your approval UI (or agent-clarifier for AskUserQuestion). It resolves to
      // { behavior: 'allow', updatedInput: input } or { behavior: 'deny', message }.
      const result = await askThePerson(toolName, input);
      // Back to what it was doing, so the line doesn't fall to a bare "Working".
      send({ type: 'activity', id, at: Date.now(), activity: before ?? { type: 'working', startedAt: Date.now() } });
      return result;
    },
  },
});
```

When the whole run throws or ends in an error, send `failed` for `MAIN` with the reason. Don't map `PostToolUseFailure` to `failed`: the agent usually recovers. `name` comes from `agent_type`; map it to a friendlier name if your agent types are ids.

### Your own tool loop: the `set_activity` tool

Its description carries the "when", so the model doesn't need a prompt paragraph to use it well:

```json
{
  "name": "set_activity",
  "description": "Tell the people watching this task what you are doing now. Call it when you start a step that takes more than a few seconds or changes what they see; not for every tool call, and not to say you're done (the app does that). label: 2 to 5 words in the user's terms, starting with a verb, e.g. 'Searching the logs' or 'Drafting the status update'; never a tool or function name, and never your own name. Use editing when you change a part of the shared document and commenting when you comment on one, with target set to that part's name as the user sees it, e.g. '§2 Pricing'. Use working for anything away from the document, viewing when you only read it. Use waiting only when you cannot go on until a person acts and you have asked them; set waitingOn to their id. Use failed only when you are stopping because of an error, with the reason as label.",
  "input_schema": {
    "type": "object",
    "required": ["type", "label"],
    "additionalProperties": false,
    "properties": {
      "type": { "type": "string", "enum": ["working", "editing", "commenting", "viewing", "waiting", "failed"] },
      "label": { "type": "string", "description": "2-5 words, starting with a verb, e.g. 'Searching the logs'." },
      "target": { "type": "string", "description": "editing, commenting, viewing: the part of the document, as the user sees it." },
      "waitingOn": { "type": "string", "description": "waiting only: the id of the person you need." },
      "progress": { "type": "number", "minimum": 0, "maximum": 1, "description": "Only when you can measure it." }
    }
  }
}
```

The tool input is already an `Activity`. Send it as `{ type: 'activity', id: <the agent that called it>, at: Date.now(), activity: { ...input, startedAt: Date.now() } }` and return a short tool result such as `"ok"`. If your UI lists the agent's tool calls, leave `set_activity` out: the strip already says it, and "Used set_activity" means nothing to the user. The model can only fill `waitingOn` with ids it knows, so list the people in the system prompt ("People on this task: me (Mari S), aisha (Aisha Khan)").

One line for the system prompt, if you want the behaviour even without the tool, or as a reminder with it:

> While you work, keep the people watching informed: say what you're doing in 2 to 5 plain words when you start each step that takes more than a few seconds, and name the part of the document you're changing. Don't report every tool call.

### Pairing with agent-clarifier

When an agent asks through [agent-clarifier](https://github.com/marigameo/agent-clarifier), the host knows exactly when the question is open, so it sets the amber itself, then sends what the agent does next (or what it was doing before it asked):

```js
el.apply({ type: 'activity', id: 'planner', at: Date.now(), activity: { type: 'waiting', waitingOn: 'me', label: 'Which region first?' } });
const result = await ask(questionnaire, { container, transcript, composer: '#message' });
el.apply({ type: 'activity', id: 'planner', at: Date.now(), activity: { type: 'working', label: 'Rolling back EU first', startedAt: Date.now() } });
```

## The host's side

| Event or property | Do |
| --- | --- |
| `copresence-select` (with `selectable`) | Follow that actor: scroll to its step in the thread, highlight its `target`. For a failed one, offer Retry and Dismiss; Dismiss sends its `leave` |
| `copresence-toggle` (card) | Remember the choice, and set `collapsed` back on the next visit |
| `copresence-roster` | Optional: pause your own hover cards while the roster is open |
| `connection` | Set `connecting` or `offline` while your feed is down. It says "Reconnecting…" in words, so a stale "Editing" never looks live. Set `live` and send a fresh snapshot (with `at`) when it's back |

## Theming

Climb only as far as the change needs:

1. **`--copresence-surface`, always.** The strip has no fill, but the cut-outs around faces and marks are drawn in it. Set it to the colour behind the element, or every face gets a halo.
2. **Tokens.** `--copresence-font`, `--copresence-face`, `--copresence-radius`, and the colours in [API.md](API.md). Attention, danger and live each need a light **and** a dark value; give both with `light-dark()`.
3. **Nothing else.** There are no `::part()`s. Keep amber for waiting on a person and red for failed: those two hues are the only alarms, and the coloured initials avoid them on purpose.

Dark mode follows the page's `color-scheme`; the element never sets one. A page that sets none gets light.

Transparent avatars sit on a neutral fill. A dark logo on a transparent background disappears in dark mode, so give such images their own background.

## Languages

`el.labels = { needsYou: 'Te necesita', working: 'Trabajando' }` replaces any string; the rest stay English. Counts are plurals (`{ one: '# agent', other: '# agents' }`, `#` is the number), picked for the nearest `lang`. Durations, numbers and name lists go through `Intl`. `dir="rtl"` mirrors the layout. Your `label` and `target` are shown as you send them, so translate those on your side.

## Troubleshooting

| Symptom | Cause → fix |
| --- | --- |
| The strip is invisible, or its faces run past the edge | It's 0 wide: a size container in a flex row gets no width. Give it `flex: 1 1 240px` or a width |
| Running agents vanish after a reconnect | The refetched snapshot held only the server's people. Add the agents your loop is still running |
| React: everyone resets whenever the component re-renders | `data` got a new object each render, and each one is a snapshot. Keep it constant and use `apply()` |
| Every face has a white or dark halo | `--copresence-surface` doesn't match what's behind the element. Set it to that colour |
| An agent that left came back | A late event without `at`. Send `at` on every event |
| A refetched snapshot undid newer changes | It was applied without `at`, or with `el.data = …`. Apply `{ type: 'snapshot', data, at }` with the time it was taken |
| The same agent shows twice | Its id changed between runs. Keep ids stable; use `update` to rename |
| My own face isn't in the stack | By design: `selfId` is in the roster only, as "You" |
| An agent flashes for a second after it finished | By design: it stays 1.2 s after it joined, so it's seen. Send `leave` right away; don't delay it yourself |
| "Needs you" never clears | The waiting activity wasn't replaced after the answer. Send the next activity, or `null`, as soon as it's answered |
| Everything is green, nothing stands out | Most actors are working, which is right. If something needs the user, it must be `waiting` with `waitingOn` = `selfId` |
| "Waiting" with no name | `waitingOn` points at an id that isn't an actor. Join the person first |
| No collapse button on the strip | By design. Set `collapsed` from your own control |
| The line reads "Starting…" | There's a goal but no actors yet. Join the first agent |
| No "for 4 min" in the roster | Send `startedAt`. Nothing is counted without it, and under 5 s isn't shown |
| A console warning `<co-presence> …` | Bad input was repaired: an unknown type became `working`, a missing name "Unnamed agent", and so on. Once per kind of problem. The codes are in [API.md](API.md) |
| React: `data` arrives as "[object Object]" | React 18 sets attributes. Use React 19, or set `ref.current.data` in an effect |
| A label in another language shows in English | Only the component's words are translated by `labels`; send your `label` and `target` already translated |
