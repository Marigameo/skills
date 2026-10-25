# Measure when it draws

Don't guess whether the model draws at the right moments: measure it. Run a small set of prompts through your **real chat endpoint**, with your full system prompt, tools and model, and count what happens. Do it before you change any prompt and after every change.

Why the real endpoint and not a bare model call: the blocker is often somewhere else in the system prompt. In the chat this skill comes from, rewording the tool's description changed nothing. Two older system-prompt lines that sent every explanation to Markdown were what stopped it drawing.

## The prompts

Six that should draw and four that shouldn't. Rewrite them in your product's domain, but keep the mix: processes, hand-offs and stages on one side; numbers, records, lists and short answers on the other.

| # | Prompt | Should draw? | Why |
|---|---|---|---|
| 1 | Walk me through how a refund request gets handled, from the customer asking to the money arriving. | Yes | A process with a hand-off |
| 2 | How does a typical deploy go from a merged pull request to production? | Yes | Steps with a decision |
| 3 | What happens between a user clicking "Forgot password" and signing in again? | Yes | A sequence between parties |
| 4 | What are the stages an order goes through after checkout? | Yes | States |
| 5 | Explain how a support ticket gets escalated from the help desk to engineering. | Yes | A hand-off between teams |
| 6 | Can you draw the onboarding flow for a new team member? | Yes | An explicit ask |
| 7 | What was revenue by month last quarter? | No | Numbers: a chart or table |
| 8 | Give me five ideas for a team offsite. | No | A list of independent items |
| 9 | Should we send the newsletter on Tuesday or Thursday? | No | A short answer |
| 10 | Compare Basic ($10, 3 seats), Team ($30, 10 seats) and Business ($90, 50 seats). | No | Records: a table |

Once these pass, add a follow-up case: show a diagram, then send "thanks, that makes sense". It should not redraw.

## What to count

| Measure | Counts | Aim |
|---|---|---|
| **Drew when it should** | Prompts 1–6 where `draw_diagram` was called and rendered | As high as it goes. Raise it one change at a time |
| **Drew when it shouldn't** | Prompts 7–10 where `draw_diagram` was called | 0. Over-drawing is worse than under-drawing |
| **Invalid on the first try** | Calls that came back `invalid` | Low. Each one is a hint to add ([VALIDATOR.md](VALIDATOR.md)) |
| **Fence bypasses** | Replies with a ```` ```mermaid ```` fence in the text | 0 |

Run the eval with the validator healthy. When it fails open, broken sources come back `rendered` and "drew when it should" over-counts, so check your server log for `verified: false` during the run.

Run each prompt 3 times. Models vary, and one run hides that. Write the numbers down with the date and what changed, so the next change has a baseline.

## The harness

Fill in `askChat` to call your chat endpoint the way your app does, and return the tool calls and the reply text. Everything else is ready.

```js
// eval-diagrams.mjs: node eval-diagrams.mjs
import { writeFileSync } from 'node:fs';

const RUNS = 3;
const PROMPTS = [
  ['Walk me through how a refund request gets handled, from the customer asking to the money arriving.', true],
  ['How does a typical deploy go from a merged pull request to production?', true],
  ['What happens between a user clicking "Forgot password" and signing in again?', true],
  ['What are the stages an order goes through after checkout?', true],
  ['Explain how a support ticket gets escalated from the help desk to engineering.', true],
  ['Can you draw the onboarding flow for a new team member?', true],
  ['What was revenue by month last quarter?', false],
  ['Give me five ideas for a team offsite.', false],
  ['Should we send the newsletter on Tuesday or Thursday?', false],
  ['Compare Basic ($10, 3 seats), Team ($30, 10 seats) and Business ($90, 50 seats).', false],
];

/**
 * Send one prompt through your real chat endpoint in a fresh conversation.
 * Return { toolCalls: [{ name, result }], text }, where result is the tool
 * result your server sent back (e.g. { status: 'rendered' } or { status: 'invalid', ... }).
 */
async function askChat(prompt) {
  throw new Error('Call your chat endpoint here.');
}

const rows = [];
for (const [prompt, shouldDraw] of PROMPTS) {
  for (let run = 1; run <= RUNS; run++) {
    const { toolCalls, text } = await askChat(prompt);
    const draws = toolCalls.filter((call) => call.name === 'draw_diagram');
    rows.push({
      prompt, shouldDraw, run,
      drew: draws.some((call) => call.result?.status === 'rendered'),
      called: draws.length > 0,
      invalid: draws.filter((call) => call.result?.status === 'invalid').length,
      fence: /`{3}mermaid/.test(text),
    });
  }
}

const should = rows.filter((row) => row.shouldDraw);
const shouldnt = rows.filter((row) => !row.shouldDraw);
const count = (list, key) => list.filter((row) => row[key]).length;
console.log(`Drew when it should:     ${count(should, 'drew')}/${should.length}`);
console.log(`Drew when it shouldn't:  ${count(shouldnt, 'called')}/${shouldnt.length}`);
console.log(`Invalid on a first try:  ${rows.reduce((sum, row) => sum + row.invalid, 0)}`);
console.log(`Fence bypasses:          ${count(rows, 'fence')}`);
for (const row of rows.filter((row) => row.shouldDraw !== row.called)) {
  console.log(`  ${row.shouldDraw ? 'missed' : 'extra '}  run ${row.run}: ${row.prompt}`);
}
writeFileSync(`eval-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(rows, null, 2));
```

Each run costs one chat turn per prompt per run (30 turns). Check what that costs on your model before running it in a loop.

## When the numbers are off

- **It never draws:** search the system prompt for lines that send explanations to Markdown, lists or "step-by-step" text, and reword them so diagrams are allowed. Then match the tool description to how your users ask. Change one thing, then re-run.
- **It draws on 7–10:** tighten the description's "do NOT" list and name the tool each case goes to.
- **It fences:** the "only way to draw" sentence is missing or buried.
- **It retries a lot:** read the failed sources. If one mistake repeats, add a targeted hint for it.

Re-run the full set after every prompt change, including changes made for other features. A new line elsewhere in the system prompt can quietly switch diagrams off.
