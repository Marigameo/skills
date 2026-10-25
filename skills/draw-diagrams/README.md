# draw-diagrams

Add Mermaid diagrams to your own chat product, so the model draws a flow, a hand-off or a set of stages only when a picture explains better than prose, and your users never see a broken one.

It's for building diagrams **into** a chat, where your model draws for your users. For writing diagrams into docs or exporting images, other skills fit better.

Framework-neutral, tested on Mermaid 12.2, with code you can copy as it is.

## Install

```bash
npx skills@latest add marigameo/skills
```

Then ask your coding agent to add diagrams to your chat. It starts at [SKILL.md](SKILL.md).

## What's inside

| File | What it covers |
|---|---|
| [SKILL.md](SKILL.md) | The two rules, the three layers, the build order and a done checklist |
| [TOOL.md](TOOL.md) | The `draw_diagram` tool, and the description that decides when to draw |
| [MODEL-SKILL.md](MODEL-SKILL.md) | What your chat model reads: when to draw, which type, shape and syntax |
| [VALIDATOR.md](VALIDATOR.md) | The server gate on the real Mermaid parser, with a hint and one retry |
| [RENDERER.md](RENDERER.md) | Drawing only accepted diagrams, security, accessibility and the toolbar |
| [DESIGN.md](DESIGN.md) | A quiet, considered look for light and dark, on Tailwind defaults |
| [EVAL.md](EVAL.md) | Measuring whether the model draws at the right moments |
| `validate-diagram.mjs`, `diagram-rules.mjs`, `render-diagram.js`, `diagram-theme.js` | The tested code |

## The story

- [Diagrams in your chat, as a skill](https://mariappan.netlify.app/work/draw-diagrams/): how this skill was designed, tested and handed to a fresh agent to build from.
- [Diagrams in Strive chat](https://mariappan.netlify.app/work/chat-diagrams/): the feature it grew out of.
