# agent-clarifier API

Exact names and defaults for `@marigameo/agent-clarifier` 0.1.x. The guide is [SKILL.md](SKILL.md).

## Questionnaire

```ts
{
  id: string;                       // ties the answers back to your request
  title?: string;                   // "A few questions before I search"
  source?: string;                  // shown as "Asked by <source>"
  flow?: 'sequential' | 'all';      // default 'sequential'
  delegate?: boolean;               // default for every question's delegate
  questions: Question[];
}
```

| Question field | Meaning |
| --- | --- |
| `id`, `label`, `prompt` | id, a 1–2 word chip, the question as asked |
| `type` | `single`, `multi`, `text` |
| `options` | 2 to 9 (`{ id, label, description?, recommended?, disabled?, compose? }`) |
| `other` | The "Something else" row. Default `true` on single/multi; `false`, or `{ label, placeholder }` |
| `required` | Default `false`. Can't be skipped or delegated |
| `delegate` | Show **Decide for me** instead of Skip |
| `min` / `max` | Multi only. `min` defaults to 1 |
| `default` | Option id(s), or the text of a text question |
| option `compose` | Picking it starts this sentence in the composer |

## Result

```ts
interface ClarifyResult {
  questionnaireId: string;
  status: 'submitted' | 'skipped' | 'dismissed'; // skipped = "just go"; dismissed = closed or expired
  delivery: 'card' | 'composer';                 // composer = the user replied in their own words
  answers: Record<string, {
    status: 'answered' | 'skipped' | 'delegated';
    values: string[];                             // option ids (text: [the text]); [] if skipped or delegated
    labels: string[];                             // what the user saw
    other?: string;                               // "Something else" text
  }>;
  message?: string;                               // the user's own words, when delivery is 'composer'
}
```

## `ask(questionnaire, options)`

Options: `element`, `container`, `transcript`, `placement`, `flow`, `review`, `undoWindow`, `composer`, `signal` (aborting expires the card). Resolves once, on send, skip, reply or expire. Rejects only when nothing can be shown. Calling it again on the same element expires the open card.

## Attributes and properties

| Attribute | Property | Values | Default |
| --- | --- | --- | --- |
| `placement` | `placement` | `replace` · `dock` | `replace` |
| `flow` | `flow` | `sequential` · `all` (the questionnaire's own wins) | `sequential` |
| `review` | `review` | `auto` (when something was skipped, or 3+ questions) · `always` · `never` | `auto` |
| `undo-window` | `undoWindow` | ms after Send during which Undo cancels; `0` off | `0` |
| `composer` | `composer` | CSS selector or element | – |
| `composer-container` | `composerContainer` | What to hide in replace mode | the composer's `<form>` |
| `density` | – | `comfortable` · `compact` | `comfortable` |
| `theme` | – | `auto` · `light` · `dark` | `auto` |
| `disabled` | `disabled` | boolean | `false` |
| – | `questionnaire` | Setting it calls `open()` | – |
| – | `labels` | `Partial<Labels>` | English |
| – | `state` (read-only) | `hidden` · `loading` · `answering` · `reviewing` · `submitting` · `error` · `minimised` · `answered` · `expired` | – |

## Methods

| Method | Does |
| --- | --- |
| `open(q, { partial? })` | Show a questionnaire. While streaming, call with `partial: true` repeatedly, then once without |
| `minimise()` / `reopen()` | Fold into the pill and back; nothing lost |
| `reset()` | Back to hidden, everything cleared |
| `markAnswered()` / `setError(message)` | After preventing `clarify:submit`: success, or a failure with Try again |
| `expire(message?)` | The agent moved on: read-only record. Never overwrites an answered card |
| `reply(text)` | A message sent while the card waited (manual composer wiring) |

## Events

All bubble, are `composed`, and are typed on `HTMLElementEventMap`.

| Event | `detail` | Cancelable | When |
| --- | --- | --- | --- |
| `clarify:submit` | `ClarifyResult` | yes | Sent (after the undo window) |
| `clarify:revise` | `ClarifyResult` | yes | Sent again after "Edit answers" |
| `clarify:skip` | `ClarifyResult` | no | Skip all, or every question skipped |
| `clarify:reply` | `ClarifyResult` | no | A composer message was taken as the answer |
| `clarify:expire` | `ClarifyResult` | no | `expire()` was called |
| `clarify:change` | `{ answers }` | no | Any answer changed |
| `clarify:compose` | `{ text, questionId, optionId }` | yes | A compose option was picked; prevent to insert yourself |
| `clarify:dismiss` | `{ resumeTo }` | no | Minimised |
| `clarify:reopen` | – | no | Reopened from the pill or a record |
| `clarify:error` | `{ reason: 'empty' }` | no | Nothing could be shown |

## Keyboard

| Where | Keys |
| --- | --- |
| Options | 1–9 pick · ↑ ↓ move · Home End · Space / Enter pick · ← back (→ in RTL) |
| Multi | Numbers and Space toggle; Enter continues |
| "Something else" | Type normally · Enter continues · Esc leaves with text kept · ↑ at the start goes back to the options |
| Anywhere | Esc minimises · ⌘Z / Ctrl+Z undoes |
| All at once | Tab between questions, arrows within one |

## Tokens

| Token | Default (light / dark) | Used for |
| --- | --- | --- |
| `--clarify-font`, `--clarify-font-title` | system UI | Text, titles |
| `--clarify-bg` | `#fff` / `#1f1f1f` | Card surface |
| `--clarify-fg` | `#1c1c1c` / `#ededed` | Text, the primary button |
| `--clarify-muted` | `#666` / `#a3a3a3` | All secondary text |
| `--clarify-faint` | `#888` / `#7a7a7a` | Edges only (≥ 3:1) |
| `--clarify-border` | `#e6e6e6` / `#343434` | Card edge, dividers |
| `--clarify-hover`, `--clarify-selected` | `#f5f5f5`, `#ececec` / `#292929`, `#303030` | Row fills |
| `--clarify-key-bg` | `#f0f0f0` / `#2c2c2c` | Number-key badges |
| `--clarify-accent`, `-accent-fg`, `-accent-soft` | `#3b5bdb` / `#8ea6ff` | Picks, focus, links. `-accent-soft` must be opaque |
| `--clarify-danger`, `-danger-soft` | `#c2410c` / `#f0895a` | Errors |
| `--clarify-success` | `#2f7d4f` / `#7cc79a` | The answered tick |
| `--clarify-radius`, `--clarify-radius-sm` | `16px`, `8px` | Card, rows |
| `--clarify-shadow`, `-shadow-dock`, `-shadow-float` | none / upward / soft | Replace card, docked card, pill |
| `--clarify-duration`, `--clarify-ease` | `160ms`, `cubic-bezier(.2,.7,.2,1)` | Motion |
| `--clarify-max-height` | 60% of the visible screen | Height before it scrolls |

**Parts:** `card`, `header`, `title`, `step`, `option`, `option-key`, `option-label`, `option-description`, `badge`, `other`, `delegate`, `footer`, `button`, `button-primary`, `toast`, `notice`, `banner`, `pill`, `record`.

## Languages

`el.labels = { somethingElse: 'Autre chose', skip: 'Passer', stepOf: '{n} sur {total}' }`. Every visible string and announcement has a key. Plurals as `{ one, other }` picked with `Intl.PluralRules`; numbers through `Intl.NumberFormat` (the full tag decides the digits). `dir="rtl"` mirrors the layout.

## Frameworks

| | |
| --- | --- |
| React 19 | `<agent-clarifier questionnaire={q} onclarify:submit={…} />`; `import '@marigameo/agent-clarifier/jsx'` once for types |
| Vue 3 | `isCustomElement: (t) => t === 'agent-clarifier'`, then `:questionnaire` and `@clarify:submit` |
| Svelte 5 | Same as React; add `<!-- svelte-ignore attribute_illegal_colon -->` |
| Angular | Bind `questionnaire` as a property |
| Astro, Next, Nuxt | Safe to import on the server |

## Warnings

`[agent-clarifier] <where>: <code>`: `questionnaire-id`, `flow`, `question-dropped`, `type`, `question-id` / `option-id`, `options-ignored`, `option-dropped`, `too-many-options`, `too-few-options`, `recommended-many`, `recommended-disabled`, `compose-multi`, `compose-and-other`, `min-max`, `default`, `delegate-required`.

## Size and support

About 21 KB gzipped (19 KB brotli); each adapter about 1 KB. Last two versions of Chrome, Edge, Firefox, Safari 16.4+. No runtime dependencies.
