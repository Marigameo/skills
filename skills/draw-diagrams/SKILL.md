---
name: draw-diagrams
description: Add Mermaid diagrams to your own chat product so the model draws only when a picture explains better than prose, and users never see a broken one. Covers the tool and the description that decides when to draw, runtime guidance for the model, a server gate on the real parser with one retry, a renderer that hides failures, a considered light and dark theme, accessibility, a code-fence fallback and an eval. Framework-neutral, tested on Mermaid 12.2. Use when a chat agent should draw flows, or when chat diagrams look generic, break or appear at the wrong moments. Not for diagrams in docs or image export.
---

# Diagrams in your chat

## Initial Response

When this skill is invoked on its own, with no question or task, respond only with:

> I'm ready to teach your chat to draw a diagram when it helps, and never show a broken one. My knowledge comes from Mari, who shipped this in a production chat.

Do not provide any other information until the user asks a question. When it comes with a task ("add diagrams to my chat", "why does it never draw"), skip this and do the task.

A build skill. It helps you add diagrams to a chat product, where your model draws for your users while they talk to it. It's built on what I learnt shipping a similar feature in [Strive AI's chat engine](https://mariappan.netlify.app/work/chat-diagrams/). Answer from this file first, and open the linked files for each part as you build it.

It is not for writing diagrams into docs, READMEs or files, or for exporting images. Other skills cover those.

## The two rules

Everything below serves these.

1. **Draw only when it helps.** A diagram is for 3 or more connected steps, parties or states whose order, branching or relationships matter. Numbers go to charts, records to tables, and lists stay lists. At most one diagram per answer. Drawing too often is as bad as never drawing.
2. **Never show a broken one.** The user never sees a parse error, a red box, raw source, or a diagram half-drawn while it streams.

## The three layers

```
 when                  how                       the gate
 ┌──────────────┐      ┌──────────────────┐      ┌─────────────────────────────────┐
 │ Tool         │      │ Model guidance   │      │ Server: real parser, hint,      │
 │ description  │ ───▶ │ (loaded before   │ ───▶ │ one retry, then prose           │
 │ always in    │      │ the first        │      │ Browser: parse again, draw from │
 │ context      │      │ diagram)         │      │ the tool's arguments, or nothing│
 └──────────────┘      └──────────────────┘      └─────────────────────────────────┘
                                                   + the look (DESIGN.md)
```

- **A tool call, not a code fence.** "Use Mermaid code blocks when helpful" is one line of prompt, but nothing can check a code block before it shows, and it streams in half-written. A tool call hands over a title, the source and a caption, which can be parsed and rejected before anyone sees them.
- **When lives in the tool's description,** because that is always in the model's context. If your app loads skills or instructions on demand, a diagram skill either never gets picked or matches every question and over-draws.
- **How lives in the model guidance,** loaded before the first diagram in a conversation, or appended to the system prompt if your app has no loader.
- **The gate is code.** Prompts make failures rarer. Only a parser makes them invisible.

## Before you build

Read the host app first, and note:

- **The model path:** provider and SDK, how tools are defined, where tool results go, and whether tool calls stream their arguments.
- **How tool calls show in the transcript:** a diagram is a tool call that renders a card, like any other rich block the app already has.
- **What the server runs on.** The validator needs Node.js. Other runtimes have options in [VALIDATOR.md](VALIDATOR.md).
- **Theme:** how light and dark mode switch, and the app's colour tokens (CSS variables, Tailwind config).
- **Other rich tools:** if the app already has chart or table tools, the diagram tool sends numbers and records to them by name.

Then agree two things with the owner: which diagram types to allow (the default list is in [VALIDATOR.md](VALIDATOR.md)), and the accent colour (their primary, or blue-600).

## Build it in this order

1. **The tool.** [TOOL.md](TOOL.md): name `draw_diagram`, a `title` / `source` / `caption` schema, and the description that decides when to draw. Always loaded, never deferred. A model reaches for a diagram while it composes an answer, not by searching for a tool.
2. **The model guidance.** [MODEL-SKILL.md](MODEL-SKILL.md): when to draw and when not to, the type for each kind of question, shape for a chat-width reader, the five meaning classes, syntax pitfalls, and what to do when the tool replies. About 1,700 tokens.
3. **The server gate.** [VALIDATOR.md](VALIDATOR.md), [validate-diagram.mjs](validate-diagram.mjs) and [diagram-rules.mjs](diagram-rules.mjs), ready to copy: the real Mermaid parser in a worker thread, so its browser globals never leak into your server. It rejects empty, oversized, chart-type and unsupported sources, and sends a syntax error back with one targeted repair hint. It fails open: if the worker is down, chat doesn't wait on it.
4. **The renderer.** [RENDERER.md](RENDERER.md) and [render-diagram.js](render-diagram.js), ready to copy: draw from the tool's arguments once the server's result says `rendered`, load Mermaid only when a diagram mounts, strip styling the model wrote, parse again and draw nothing on failure, size it for a narrow column, give it an accessible name, and add a toolbar (expand with zoom, PNG download, copy source).
5. **The look.** [DESIGN.md](DESIGN.md) and [diagram-theme.js](diagram-theme.js): a quiet, considered theme for light and dark, where the model marks meaning and the theme picks the colour. Map the app's own colours onto it.
6. **The fallback.** Models sometimes write a ```` ```mermaid ```` fence anyway. Catch it in the Markdown renderer, wait until it stops changing (about 600 ms), and draw it with the same component. Nothing validated it, so on failure show the raw source instead of nothing. Count these bypasses: if they climb, the tool description needs work. Details in [RENDERER.md](RENDERER.md).
7. **Measure.** [EVAL.md](EVAL.md): prompts that should draw and prompts that shouldn't, run through the real chat API, before and after every prompt change. Don't guess whether the model draws at the right moments.

## Choices with a reason

| Choice | Default | Why |
|---|---|---|
| Size cap | 80 lines, 5,000 characters | Past that a diagram stops reading at chat width. Lines work for every type, unlike nodes |
| Retries | One, then prose | A second failure rarely fixes itself, and the user is waiting |
| Server failure | Fail open | A validator outage must never block chat. The browser parses again anyway |
| Worker time limits | 30 s to start, 8 s to parse | A slow cold start under one shared limit gets killed, respawned and killed again, and nothing is ever checked |
| Chart types (`pie`, `xychart`, `sankey`, `radar`, `treemap`) | Rejected | Numbers belong to real chart tools, where figures can match the text and tables |
| Model styling | Stripped | The theme always wins. `%%{init}%%` is deprecated anyway |
| Loading Mermaid | On first diagram | It's about 1 MB. A chat that never draws never pays for it |
| Failed tool call in history | Not shown, live or on reload | Draw from the tool's arguments and parse again in the browser, so a rejected attempt simply isn't there |

## Accessibility and security

- **Accessible name** from `title` and `caption`, `role="img"` on the diagram, and a keyboard-reachable toolbar.
- **Contrast** in both modes for labels, muted text and connectors. Meaning never relies on colour alone. See [DESIGN.md](DESIGN.md).
- **Treat the source as untrusted.** Strict mode alone isn't enough: on Mermaid 12.2 an `<img src>` in a label and a `click` link both got through it. Strip HTML and `click` lines (`sanitizeSource` does), keep `securityLevel: 'strict'` and the size cap, and never set Mermaid's `secure` keys from model output.

## Done means

- [ ] Each test prompt draws or doesn't as expected, and the eval numbers are written down ([EVAL.md](EVAL.md)).
- [ ] A deliberately broken source never shows: live, after the retry, or on reload.
- [ ] Nothing flashes while a diagram streams in.
- [ ] Mermaid loads only when a diagram mounts.
- [ ] One diagram of each allowed type renders in light, in dark, and at phone width, with no Mermaid defaults leaking through ([DESIGN.md](DESIGN.md), "Check before calling it done").
- [ ] Styling the model wrote (`%%{init}%%`, `classDef`, `style`, frontmatter, `click`) changes nothing.
- [ ] A ```` ```mermaid ```` fence in plain text renders through the same component, and a broken one shows its source.
- [ ] Screen readers get the title and caption. The toolbar works from the keyboard.

## Troubleshooting

| Symptom | Likely cause and fix |
|---|---|
| The model never draws | Older system-prompt lines that send every explanation to Markdown or numbered lists win over the tool. Find and reword them. Rewording the tool alone often changes nothing. Then match the description to how users ask ("walk me through…", "how does X work") and re-run the eval |
| It draws for everything | The description's "do not" list is missing or vague. Name the cases (numbers, records, lists, yes/no, redraws) and the tools they go to |
| It writes a code fence instead | Tell it in the description that the tool is the only way to draw. Keep the fence fallback for the rest |
| The same parse error twice | The hint was too general. Add a targeted one for that failure ([VALIDATOR.md](VALIDATOR.md)) |
| Validation always passes, even on garbage | The worker failed to load, so it fails open every time. Check the logs for "accepted unverified" |
| Diagrams flash or show errors while streaming | It's drawing from partial arguments, or before the server's verdict. Draw only when the result says `rendered` |
| The model gets `invalid` but never retries | The turn ends after one step. With the AI SDK, set `stopWhen: isStepCount(4)`. In your own loop, send the tool result back to the model |
| A script or eval that imports the validator never exits | An older copy of `validate-diagram.mjs`. The current one unreferences its worker after attaching listeners |
| A failed attempt shows after reload | The transcript draws from saved text, not the tool's arguments, or skips the browser parse |
| Lavender boxes, yellow groups, black lines | The theme isn't applied, or was applied after the first render. Initialise before rendering, and again when the theme switches |
| White glow around nodes in dark mode | Mermaid 12's own `dropShadow`. The starter theme replaces it |
| Lime dots in journeys | Hard-wired actor colours. Use `recolorJourney()` |
| Gantt is a thin unreadable strip | Pass the container width as `gantt.useWidth` |
| Text too small in wide diagrams | Shrink only as far as keeps the smallest text at 10px (`fit()` measures it), then scroll sideways and offer expand |
| A whole type renders black or empty after an upgrade | A Mermaid visual regression or a changed class name. Pin the version and re-run the type-by-type check |
