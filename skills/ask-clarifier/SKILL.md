---
name: ask-clarifier
description: Guide to agent-clarifier, the web component that lets a chat agent ask clarifying questions before it acts — install it, place it at the composer (replace or dock), wire the message box, write good questions, pick single, multi, text, a compose option or "Decide for me", choose one-at-a-time or all-at-once, give the model a tool so it knows when to ask, theme it, and fix the usual problems. Use when working with agent-clarifier, <agent-clarifier>, @marigameo/agent-clarifier, or when a chat agent needs to ask the user structured questions mid-task.
---

# Working With agent-clarifier

## Initial Response

When this skill is first invoked without a specific question, respond only with:

> I'm ready to wire agent-clarifier into your chat and help your agent ask the right questions, my knowledge comes from its author, Mari.

Do not provide any other information until the user asks a question.

A guide skill for [agent-clarifier](https://github.com/marigameo/agent-clarifier) (`@marigameo/agent-clarifier`), a zero-dependency web component that lets a chat agent ask a few short questions before it acts, the way Claude's question card does. Answer from this file first. Exact attributes, events, tokens and the result shape are in [API.md](API.md); read it when you need a precise name or default.

## Setup

Three pieces:

1. **The element**, pointed at the message box. `composer` takes a selector or the element; `<textarea>`, `<input>` and `contenteditable` all work.
2. **`ask()`**, which shows a questionnaire and resolves with the answers. Pass `container` (where the card asks) and `transcript` (where its record stays afterwards).
3. **The model side**: a way for the model to request questions (see "Tell the model when to ask").

```html
<agent-clarifier composer="#message"></agent-clarifier>
<form><textarea id="message"></textarea><button>Send</button></form>
```

```js
import { ask } from '@marigameo/agent-clarifier';
const result = await ask(questionnaire, { container: composerSlot, transcript: messageList, composer: '#message' });
```

Load it on first use (`await import(...)` inside the function that asks); the page pays nothing until the agent asks something. Importing on a server is safe. From a CDN, pin the version.

## Placement

| | `replace` (default) | `dock` |
| --- | --- | --- |
| While asking | The composer is hidden; the card takes its place, like Claude's card | The composer stays, joined under the card |
| Own words | Minimise (Esc or ⌄); the composer comes back reading "Or reply in your own words…" | Just type |
| Pick it when | The question should not get lost under new messages | The user must stay able to type at any time |

In both, a message sent while the card waits **is the answer**. The element catches the form's submit before your handler, delivers it as `clarify:reply` and clears the box, so you never send it as a chat message too. No `<form>`? Call `el.reply(text)` yourself.

When docked, the composer's container gets `data-clarifier-docked`: square off its top corners so the two read as one surface.

## Picking the question type

| The user should | Use |
| --- | --- |
| Pick one | `single`, 2 to 6 options, the recommended one first with `recommended: true` |
| Pick several | `multi`, with `max` when there's a limit. Continue never fires on its own, so Enter means "done" |
| Give a short detail | `text`, with a `default` that prefills a sentence they edit in place |
| Write it in their own words (personal, sensitive, or longer than a pick) | A `compose` option: `{ label: "I'll explain", compose: "For accessibility, I need " }` starts that sentence in the composer |
| Be able to say "you choose" | `delegate: true` on the question. "Decide for me" replaces Skip and comes back as `delegated` |
| Not be able to skip | `required: true`. Required beats delegate |
| Answer yes or no | A two-option `single`. There is no boolean type on purpose |

"Something else" is on by default for single and multi. Turn it off with `other: false` only when the options are truly exhaustive. Don't combine it with a `compose` option: two free-text routes on one question is a warning.

## Writing questions

The rules the model should follow, and the card enforces at runtime:

- At most 4 questions. 2 to 6 options each (9 is the hard cap: one per number key).
- Short labels, with `description` for the trade-off, not for restating the label.
- One `recommended` per question, and it goes first.
- Never ask for anything already in the conversation.
- `prompt` reads like a person asking: "Which area would you like to stay in?", not "Select area".
- Give each question a short `label` ("Area", "Budget"): it's the chip in the review step and the record.

Bad input is repaired, not rejected: missing ids are made up, extra options trimmed, each fix printed as a `[agent-clarifier]` warning. A questionnaire with nothing usable makes `ask()` reject, so the agent hears about it.

## Flow

`sequential` (default) shows one question per step with a count; use it when later questions depend on earlier ones or when there are more than three. `all` shows every question in one scrollable card; use it for two or three independent questions. The review step appears on its own when something was skipped or there are three or more questions (`review="always|never"` to force it).

## Tell the model when to ask

The model never sees this file. It only sees the tools you register and your system prompt. Three routes:

| Your stack | Do |
| --- | --- |
| Claude Agent SDK | Nothing to define. Intercept `AskUserQuestion` in `canUseTool`, convert with `fromClaude` / `toClaude` from `@marigameo/agent-clarifier/adapters/claude` |
| MCP client | Nothing to define. Handle elicitation with `fromElicitation` / `toElicitation` from `@marigameo/agent-clarifier/adapters/mcp` |
| Your own tool loop | Register the tool below and call `ask()` when it fires |

The tool. Its description carries the "when", so the model doesn't need a prompt paragraph to use it well:

```json
{
  "name": "ask_user",
  "description": "Ask the user up to 4 short questions before acting. Use it only when the answer changes the result and a wrong guess would be costly to redo. Never ask for anything already in the conversation. Put the recommended option first and mark it. Use type single for one answer, multi (with max) when several can apply, text for a short detail. Add a compose option when the user should write the answer themselves. Set delegate when any sensible pick would do. After the result: for a skipped question, say what you assumed; for a delegated one, say what you chose; a message in the user's own words replaces the picks.",
  "input_schema": {
    "type": "object",
    "required": ["questions"],
    "properties": {
      "title": { "type": "string", "description": "One line on why you're asking." },
      "flow": { "type": "string", "enum": ["sequential", "all"], "description": "sequential when later questions depend on earlier ones or there are more than 3." },
      "questions": {
        "type": "array", "minItems": 1, "maxItems": 4,
        "items": {
          "type": "object",
          "required": ["id", "label", "prompt", "type"],
          "properties": {
            "id": { "type": "string" },
            "label": { "type": "string", "description": "1-2 words, e.g. Budget" },
            "prompt": { "type": "string", "description": "The question as a person would ask it." },
            "type": { "type": "string", "enum": ["single", "multi", "text"] },
            "required": { "type": "boolean" },
            "delegate": { "type": "boolean", "description": "Offer 'Decide for me'." },
            "max": { "type": "integer", "description": "multi only" },
            "default": { "type": "string", "description": "text only: a sentence to edit in place" },
            "options": {
              "type": "array", "minItems": 2, "maxItems": 6,
              "items": {
                "type": "object",
                "required": ["id", "label"],
                "properties": {
                  "id": { "type": "string" },
                  "label": { "type": "string" },
                  "description": { "type": "string", "description": "The trade-off, one line." },
                  "recommended": { "type": "boolean" },
                  "compose": { "type": "string", "description": "Picking this starts this sentence in the composer instead." }
                }
              }
            }
          }
        }
      }
    }
  }
}
```

The tool input is already a valid questionnaire: pass it straight to `ask()`. Give the result back to the model as the tool result, as `labels` per question plus `status`, and `message` when `delivery` is `composer`.

One line for the system prompt, if you want the behaviour even without the tool:

> Ask clarifying questions only when the answer changes the result and a wrong guess is costly to redo. Never ask for anything you can read from the context. After a skip, say what you assumed; after "Decide for me", say what you chose.

## What comes back

`ask()` resolves once, with `status` (`submitted`, `skipped`, `dismissed`), `delivery` (`card` or `composer`), `answers` per question (`answered`, `skipped` or `delegated`, with `values`, `labels` and `other`), and `message` when the user replied in their own words. It never rejects for anything the user did.

- **Skipped:** proceed on your best guess and say what you assumed.
- **Delegated:** pick, and say what you chose.
- **Composer reply:** the message is the answer; the picks made so far come with it.
- **Edit answers later** arrives as `clarify:revise` on the element, not through the promise. Listen for it if the agent should hear about changes.

To send the answers yourself (your own transport, with a failure state): prevent `clarify:submit`, then call `markAnswered()` or `setError(message)`, which keeps the answers and offers Try again.

## Theming

Climb only as far as the change needs:

1. **Nothing.** The defaults are neutral greys that sit under any brand.
2. **Tokens.** `--clarify-accent`, `--clarify-radius`, `--clarify-font` on the element or `:root`. Accent, danger and success each need a light **and** a dark value that pass 4.5:1 on the card; the soft fills derive from them.
3. **Parts.** `::part(card)`, `::part(option)`, `::part(button-primary)` and the rest, for structure. Leave the Recommended badge grey: the user's pick is meant to be the loudest thing on the card.

Dark mode follows `prefers-color-scheme`; force it with `theme="dark|light"`.

## Troubleshooting

| Symptom | Cause → fix |
| --- | --- |
| Card never appears | No usable questions (no prompts, or a text question with options): check the console for `[agent-clarifier]` warnings, and `ask()` rejected. Or the element isn't in the DOM yet: `ask()` creates one in `container` if you pass it |
| The user's message was sent as a chat message *and* as the answer | The composer isn't inside a `<form>`, so submit wasn't caught. Call `el.reply(text)` from your send handler while `el.state` is `answering` or `minimised` |
| React: a controlled textarea shows the old text again after a reply or a compose pick | The card writes with `setRangeText`, which React's value tracker sees, so this is fine by default. It breaks when you prevent `clarify:compose` and write `field.value =` yourself: use `setRangeText` or React's state setter instead |
| Accent unreadable in dark mode | You set one accent value. Give a dark one under `prefers-color-scheme: dark` and `[theme="dark"]` |
| Docked card and composer look like two boxes | Add `form[data-clarifier-docked] { border-start-start-radius: 0; border-start-end-radius: 0 }` |
| The record ends up at the composer, not in the chat | Pass `transcript` to `ask()`. Without `ask()`, move the element on `clarify:submit`, `clarify:skip`, `clarify:reply`, `clarify:expire` and back on `clarify:reopen` |
| Keyboard covers the card on Android | Add `interactive-widget=resizes-content` to the viewport meta. The card already follows `visualViewport` |
| The bottom bar doubles its safe-area padding | The card adds none on purpose; keep `env(safe-area-inset-bottom)` on your bar only |
| Svelte warns `attribute_illegal_colon` | The listener works; add `<!-- svelte-ignore attribute_illegal_colon -->` or pass it through a spread |
| Tests crash in jsdom | No `ResizeObserver` or constructable stylesheets there. Test in a real browser, or mock the module |
| `expire()` did nothing | It never overwrites an answered card. That's by design |
| More than 9 options got cut | 9 is the cap (one per number key). For a long list, make it a `text` question |
