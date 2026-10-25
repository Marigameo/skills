# The tool: `draw_diagram`

The tool is how the model draws, and its description is where the model learns **when** to draw. It is always in the model's context, so it carries the gate. The **how** (type choice, shape, syntax) lives in [MODEL-SKILL.md](MODEL-SKILL.md).

## Schema

Three fields, all required, so the schema also works under strict modes.

| Field | Type | What it holds |
|---|---|---|
| `title` | string | A short heading naming what the diagram explains. Shown above it, and its accessible name |
| `source` | string | The Mermaid source. The first line declares the type |
| `caption` | string | The one takeaway, shown under the diagram. `""` when the title says it all |

`caption` is an empty string rather than `null`, because a plain string is valid under every provider's strict mode.

## The description

Copy it, then replace each bracketed part with your own text and drop the brackets. Each sentence is there for a reason (see the notes below).

````text
Draw a diagram inline in chat. Use it when your answer explains how something flows or connects, and draw it instead of writing a numbered walkthrough: a process or funnel; a workflow or automation (trigger → data → condition → action); a decision path; a hand-off between people, teams or systems; the stages of a lifecycle or pipeline; a customer or user journey; how the parts of a plan or system relate; or a plan over time. Typical asks: "explain how … works", "walk me through …", "step by step" when the steps follow one another, "what are the stages of …", "how does X hand off to Y", or any request for a diagram, flow, map or visual. Do NOT use it for: numbers or metrics [use `bar_chart` or `line_chart`], comparisons of records [use `table`], lists of independent items (ideas, tips, options, definitions), one-line or yes/no answers, or redrawing a diagram already shown. Pair the diagram with a short prose intro (2–4 sentences plus any caveats) instead of also spelling out every step in text. At most one diagram per response, placed after that intro. This tool is the only way to draw: never write a ```mermaid code fence in text. [Before your first diagram in a conversation, load the `diagrams` guidance.] The tool checks the source: if it returns `status: "invalid"`, fix the source using `error` and `hint` and call it once more; if that also fails, explain in prose.
````

Why each part is there:

- **"draw it instead of writing a numbered walkthrough"**: without it, models default to numbered lists for every explanation.
- **The kinds of explanation, then the typical asks:** the model matches on how users phrase things. Recall improved when the description used the words users actually type ("walk me through…").
- **The "do NOT" list, with where each case goes:** this keeps it from over-drawing. Name your own chart and table tools. If you have none, say "answer in prose or a Markdown table".
- **"a short prose intro … instead of also spelling out every step"**: a diagram plus the same steps as a list says everything twice.
- **"the only way to draw"**: cuts code fences, which skip the gate.
- **The retry contract:** the model needs to know that `invalid` means "not shown", and that it gets exactly one more try.

Keep the "load the guidance" sentence only if your app loads instructions on demand. Otherwise append [MODEL-SKILL.md](MODEL-SKILL.md) to the system prompt and drop the sentence.

## Results the model gets back

```json
{ "status": "rendered" }
```

```json
{
  "status": "invalid",
  "reason": "syntax",
  "error": "Parse error on line 2: ...",
  "hint": "`end` is a reserved word; rename that node id, e.g. `endStep`.",
  "next_step": "The diagram was NOT shown. Fix the source and call draw_diagram once more; if it fails again, explain in prose instead."
}
```

`reason` is one of `empty`, `too_large`, `data_chart`, `unsupported_type` or `syntax` from the validator ([VALIDATOR.md](VALIDATOR.md)), or `retry_limit` when the model calls again after its retry. A rejection is a normal tool result, not an error: the model repairs from it.

After the second failure, `next_step` changes to: "The diagram was NOT shown and no more attempts are allowed. Explain in prose instead."

## Definitions

All three type-check against the current SDKs (`@anthropic-ai/sdk` 1.3, `openai` 7.43, `ai` 7.0). `description` is the text above, and `validateDiagram` comes from [validate-diagram.mjs](validate-diagram.mjs).

**JSON Schema** (shared by the first two):

```js
const parameters = {
  type: 'object',
  properties: {
    title: { type: 'string', description: 'Short heading naming what the diagram explains, e.g. "How a support ticket gets resolved".' },
    source: { type: 'string', description: 'Mermaid source. The first line declares the type, e.g. `flowchart LR`, `sequenceDiagram`, `stateDiagram-v2`, `journey`, `mindmap`, `timeline`. Emphasis only: `==>` for the main path, `-.->` for optional or loop-back edges, and `:::accent` / `:::success` / `:::warning` / `:::danger` / `:::muted` on flowchart and state nodes. No `%%{init}%%`, `classDef`, `style` or `click`: the renderer applies the theme.' },
    caption: { type: 'string', description: 'One-line takeaway shown under the diagram, e.g. "Most tickets close on a saved reply." Empty string when the title says it all.' },
  },
  required: ['title', 'source', 'caption'],
  additionalProperties: false,
};
```

**Anthropic Messages API:**

```ts
const tools: Anthropic.Tool[] = [{ name: 'draw_diagram', description, strict: true, input_schema: parameters }];
```

**OpenAI Responses API:**

```ts
const tools: OpenAI.Responses.FunctionTool[] = [{ type: 'function', name: 'draw_diagram', description, strict: true, parameters }];
```

**Vercel AI SDK**, with the retry counted per request:

```ts
import { streamText, tool, isStepCount } from 'ai';
import { z } from 'zod';

const RETRY = 'The diagram was NOT shown. Fix the source and call draw_diagram once more; if it fails again, explain in prose instead.';
const NO_MORE = 'The diagram was NOT shown and no more attempts are allowed. Explain in prose instead.';

/** A fresh tool per chat request, so the attempt count belongs to this turn only. */
export function drawDiagramTool() {
  let failures = 0;
  return tool({
    description,
    inputSchema: z.object({
      title: z.string().describe('Short heading naming what the diagram explains.'),
      source: z.string().describe('Mermaid source. The first line declares the type.'),
      caption: z.string().describe('One-line takeaway, or an empty string.'),
    }),
    execute: async ({ source }) => {
      if (failures >= 2) return { status: 'invalid', reason: 'retry_limit', next_step: NO_MORE };
      const verdict = await validateDiagram(source);
      if (verdict.ok) {
        if (!verdict.verified) console.warn(`draw_diagram accepted unverified (${verdict.reason})`);
        return { status: 'rendered' };
      }
      failures += 1;
      return {
        status: 'invalid', reason: verdict.reason, error: verdict.error, hint: verdict.hint,
        next_step: failures === 1 ? RETRY : NO_MORE,
      };
    },
  });
}

// In the chat route:
const result = streamText({
  model, messages,
  tools: { draw_diagram: drawDiagramTool() },
  stopWhen: isStepCount(4), // the default is 1 step, which ends the turn before the model sees `invalid`
});
```

**`stopWhen` matters.** `streamText` stops after one step by default, so without it the `invalid` result reaches the browser and the model never gets its retry. Four steps leave room for the first call, the retry and the prose answer.

With the Anthropic or OpenAI SDKs, run the same check where your loop handles the tool call, keep the failure count in that request's loop (never in module state, which is shared across users), and send the result back as that provider's tool result.

## Rules for the tool

- **Always loaded.** Don't defer it behind tool search. A model reaches for a diagram while it composes an answer, never by searching for one.
- **Don't force it.** Leave `tool_choice` on auto. Several current models reject forced tool choice, and a forced diagram is the over-drawing you're trying to avoid.
- **One retry.** Count failures per request, as in the AI SDK example. After the second failure, `next_step` tells the model to answer in prose, and any further call returns `retry_limit`.
- **Draw from the arguments.** The browser renders the `source` the model sent, not text it wrote afterwards ([RENDERER.md](RENDERER.md)).
