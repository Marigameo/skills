# Design: diagrams that look considered

Out of the box, Mermaid looks generated: lavender boxes, yellow groups, heavy black arrows, and a light theme only. This file is a small design language for diagrams that sit inside a chat answer, plus a starter theme that applies it: [diagram-theme.js](diagram-theme.js), tested on Mermaid 12.2.0 in light and dark.

The colours are Tailwind defaults, named by role. Keep them, or swap in your app's own. The rules matter more than the hex values.

## Principles

1. **Part of the answer, not a pasted image.** Same surface, font and corner radius as the message it sits in.
2. **Quiet structure, loud meaning.** Nodes, borders and connectors are neutral greys. Colour shows up only where it means something.
3. **One accent.** Your app's primary colour marks the main path and the step the answer is about. Nothing else uses it.
4. **The model marks meaning, the theme decides the look.** The model can say "this step matters" or "this outcome is bad". It never picks a colour. Strip any styling it writes ([RENDERER.md](RENDERER.md)).
5. **Readable before pretty.** Text and connectors pass WCAG contrast in both modes, and meaning never relies on colour alone.

## Colours by role

| Role | Light | Dark | Used for |
|---|---|---|---|
| `surface` | white | zinc-900 | What the diagram sits on, and node fill |
| `group` | zinc-50 | `#202024` | Subgraphs, alt blocks, muted nodes |
| `text` | zinc-900 | zinc-100 | Labels |
| `muted` | zinc-500 | zinc-400 | Edge labels, group headings, secondary text |
| `line` | zinc-300 | zinc-600 | Node borders |
| `border` | zinc-200 | zinc-700 | Hairlines, group borders, lifelines |
| `edge` | zinc-500 | zinc-500 | Connectors and arrowheads |
| `accent` / `accentSoft` | blue-600 / blue-50 | blue-400 / wash | Main path, the step that matters, notes |
| `success`, `warning`, `danger` (+ `Soft`) | emerald / amber / red 700 on 50 | 400 on wash | Good, at-risk and bad outcomes |
| `sections` / `sectionEdges` | blue, violet, emerald, amber, rose, sky 100 / 500 | washes / 400 | Mindmap branches, timeline periods, journey, quadrants |

- **Use your app's colours if it has them.** Map your tokens onto these roles. The accent should be your primary colour, with a very light version of it as `accentSoft`.
- **In dark mode, use a lighter shade of the accent** (around 400). A 600 primary on a dark surface often drops near 3:1, which is the minimum for a line.
- **Solid hex only.** Mermaid derives shades from its theme colours. It rejects `var()` and `oklch()`, which is what Tailwind v4's own variables are. Convert with `toHex()` from the theme file first.
- **Dark washes are the 500 shade at 20% over the surface.** The 950 shades read too heavy behind text.

## Shape and type

- **Steps:** 8px corners, 1px border in `line`, and a faint two-layer shadow in light mode only (6% and 10% black). Dark mode has no shadow: on dark, a shadow either vanishes or glows.
- **Groups (subgraphs):** 12px corners, `group` fill, `border` hairline. The heading is 11px, 600 weight, uppercase with a little letter spacing, in `muted`.
- **Edge labels:** pills with a `surface` background, a `border` hairline, and 11.5px `muted` text.
- **Font:** your app's body font at 13px. Node labels 500 weight, sequence actors 600.
- **Shapes carry meaning, so keep the set small:** stadium for start and end, rectangle for steps, diamond for decisions phrased as a question, cylinder only for a store of records. This is the model's job ([MODEL-SKILL.md](MODEL-SKILL.md)), but the look depends on it.

## Edges

| Edge | Source | Looks |
|---|---|---|
| Default | `-->` | `edge` grey, 1.5px |
| Main path | `==>` | `accent`, 2.25px, with accent arrowheads. Draw one path this way, not several |
| Optional, fallback, loop-back | `-.->` | `edge` grey, dashed 3/4 |

The dash says "optional", not a paler colour. A paler line drops below contrast.

## Meaning classes

The model may add one of five classes to a node, and nothing else. The theme turns them into colour.

| Class | Means | Looks |
|---|---|---|
| `accent` | The step the answer is about. One node, two at most | `accentSoft` fill, `accent` border 1.5px |
| `success` | A good outcome | `successSoft` fill, `success` border |
| `warning` | An at-risk step or outcome | `warningSoft` fill, `warning` border |
| `danger` | A bad outcome | `dangerSoft` fill, `danger` border |
| `muted` | Out of scope, deprioritised | `group` fill, dashed `border`, `muted` text |

- Fills are light washes, so labels keep full-contrast text. The border carries the colour.
- In flowcharts, write `node[Label]:::accent`. In state diagrams, Mermaid ignores a standalone `Won:::success` line, so write `class Won success`. The renderer can rewrite one into the other.
- On Mermaid 12, `:::name` puts a plain CSS class on the node, so the theme styles it with CSS. No `classDef` is injected into the model's source.

## Per type

- **Sequence:** rounded actors with the step shadow, dashed lifelines in `border`, notes in `accentSoft` with an `accent` border.
- **State:** the same steps and edges as a flowchart. Status lives in the meaning classes.
- **Mindmap, timeline, journey:** each section gets a `sections` wash with a `sectionEdges` underline (journey sections and tasks get it as fill and border). Journey faces use `surface`. The mindmap root is neutral (`surface` fill, `line` border, 600 weight) so the branches carry the colour.
- **Gantt:** bars in the first section wash, active tasks in `accentSoft`, critical ones in `dangerSoft`, a `border` grid. Ask the model for `axisFormat %b %e` and `tickInterval 1week` on plans longer than about three weeks, or the day ticks overlap.
- **Quadrant:** three section washes and one neutral quadrant. Points in `accent`.
- **Entity-relationship:** attribute rows alternate `surface` and `group`.
- **No `title` lines inside the diagram.** The card shows the tool's title above it. A journey or quadrant `title` repeats it.

## Size in a narrow column

Chat is narrow, and Mermaid scales a wide diagram down until the text is unreadable.

- **10px is the floor for any text.** Shrink a diagram to fit only as far as keeps its smallest text at 10px, then scroll sideways and offer expand. A fixed percentage doesn't work: the smallest text differs by type (11.5px edge-label pills, 10px gantt text, 13px labels). `fit()` in [render-diagram.js](render-diagram.js) measures it per diagram. At 390px wide, every type checked lands at exactly 10px.
- **Gantt measures itself at 1200px** when rendered off-screen. Pass the container's width as `gantt.useWidth`, but at least 600px: narrower than that, ticks run together and task labels fall outside their bars. With 10px text, a gantt never shrinks, so on a phone it scrolls.

## Accessibility

Checked for the default palette:

| Pair | Light | Dark | Needs |
|---|---|---|---|
| Labels on node fill and washes | 14.5–17.7 | 11.0–16.1 | 4.5 |
| Muted text (edge labels, headings) | 4.6–4.8 | 6.3–6.9 | 4.5 |
| Connectors | 4.6–4.8 | 3.4–3.7 | 3 (graphics) |
| Main path (accent) | 5.2 | 7.0 | 3 |
| Meaning-class borders on their wash | 4.7–5.9 | 5.1–7.3 | 3 |

- **If you swap colours, check these pairs again.** Connectors are the usual failure. Mermaid's own look and the light grey most themes reach for land around 2.5:1.
- **Node borders are decorative.** The label names the node, so a hairline below 3:1 is fine.
- **Never colour alone.** The label says it ("Roll back", not "Step 4"). The main path is thicker as well as blue. Muted nodes are dashed as well as grey. The caption names the takeaway.
- **Give every diagram an accessible name and description** from the tool's `title` and `caption` ([RENDERER.md](RENDERER.md)).

## Mermaid quirks that break styling (12.2.0)

- **Solid colours only**, as above.
- **Mermaid 12's `base` theme adds its own light-grey shadow** to every node (`dropShadow`). It looks fine on white and glows on dark. The theme replaces it with ours in light mode and `none` in dark.
- **Section underlines** in mindmap and timeline come from `cScaleInv*`, which Mermaid derives as an inverted colour (navy, olive, magenta) unless you set it. The theme sets it to `sectionEdges`.
- **The mindmap root** is styled separately from the sections. **The timeline axis** is hard-coded black. The theme overrides both in CSS.
- **Journey actor colours are hard-wired** and ignore every theme setting. Recolour the SVG with `recolorJourney()` after rendering. Journey section fills are read once, when Mermaid loads, so the theme sets them in CSS instead.
- **All edges share one arrowhead marker,** so CSS can't colour the main path's arrowheads. `accentMainPath()` in the renderer gives `==>` edges their own accent copy.
- **`%%{init}%%` is deprecated**, and frontmatter `config:` can change the theme. Configure Mermaid in code, and strip both from model output.
- **The finishing CSS targets Mermaid's internal class names**, which can change between versions. Pin the version, and re-run the check below after every upgrade. Mermaid itself has visual regressions too: on one 11.x release every mindmap node rendered black, which no test caught and a look at every type did.

## Using the starter theme

```js
import mermaid from 'mermaid';
import { diagramConfig, palettes, recolorJourney, toHex } from './diagram-theme.js';

const mode = isDark() ? 'dark' : 'light';           // your app's theme state
mermaid.initialize({
  ...diagramConfig(mode, {
    fontFamily: getComputedStyle(document.body).fontFamily,
    colors: mode === 'dark'                          // optional: your tokens
      ? { accent: toHex('var(--primary-400)'), accentSoft: toHex('color-mix(in oklch, var(--primary) 20%, #18181b)') }
      : { accent: toHex('var(--primary)'), accentSoft: toHex('color-mix(in oklch, var(--primary) 8%, white)') },
  }),
  gantt: { useWidth: container.clientWidth },
});

let { svg } = await mermaid.render(id, source);
if (source.trimStart().startsWith('journey')) svg = recolorJourney(svg, palettes[mode].sectionEdges);
```

`diagramConfig` returns `theme: 'base'`, `securityLevel: 'strict'`, the theme variables and the finishing CSS. When the app switches between light and dark, initialise again and re-render.

## What to change, and what to keep

- **Change freely:** the accent pair, the font, the corner radii (8 and 12), the shadow.
- **Keep:** one accent, the five meaning classes and nothing more, the dash for optional edges, contrast on connectors, no styling from the model.

## Check before calling it done

Render one diagram of each type you allow (flowchart TD and LR, sequence, state, journey, mindmap, timeline, gantt, quadrant, ER), in light, in dark, and at phone width. Class, requirement, git and C4 diagrams are off by default because they haven't had this check. Do it before turning one on. Look for:

- Mermaid's defaults leaking through: lavender, yellow, black lines, lime dots.
- Text under 10px. It should scroll instead.
- Meaning carried by colour alone.
- Anything that doesn't change between light and dark.
