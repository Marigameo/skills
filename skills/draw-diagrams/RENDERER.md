# The renderer

[render-diagram.js](render-diagram.js) is the browser half: framework-neutral, tested on Mermaid 12.2.0. It draws a diagram the server has accepted, strips anything the model wrote that could restyle the diagram or attach behaviour, and leaves the target empty when the source is rejected or doesn't parse. Your UI supplies the card around it: title, caption, toolbar and dialog, in the app's own components.

| Export | Does |
|---|---|
| `renderDiagram(target, { title, source, caption }, { mode, colors, fontFamily })` | Loads Mermaid (once), sanitises, runs the cheap checks, parses, renders, themes, sizes and labels the diagram. Returns `true` when drawn, `false` (target emptied) on failure, and `null` without writing anything when a newer render of the same target took over |
| `sanitizeSource(source)` | Strips frontmatter, `%%{init}%%`, `classDef` / `style` / `linkStyle` / `click`, unknown `:::classes` and HTML |
| `prepareSource(source)` | Sanitises, rewrites state-diagram `:::` lines as `class` statements, drops `class` statements for anything but the five meaning classes, and drops classes where they don't apply |
| `loadMermaid(load?)` | Lazy-loads Mermaid. Pass `() => import('mermaid')` or your own loader |
| `accentMainPath(svg, color)` | Gives `==>` edges accent arrowheads. Mermaid shares one marker between all edges |
| `fit(svg, room, { minText })` | Shrinks to fit only as far as keeps the diagram's smallest text at 10px, then scrolls |
| `toPng(svg, { scale, background, padding })` | A PNG blob, 2× with 16px of padding by default |

It imports [diagram-theme.js](diagram-theme.js) and [diagram-rules.mjs](diagram-rules.mjs), the size and type checks it shares with the server. **Keep all four code files in one folder that both your server and your browser code import** (a shared package or a path alias works). Don't keep two copies of `diagram-rules.mjs`, or the two lists of chart tools will drift.

## When to draw

**When the server's result says `rendered`.** Complete arguments aren't enough: the server may still reject them. Drawing as soon as the arguments arrive shows a diagram for as long as validation takes (up to about a second on a cold start), and then it vanishes. Until the result arrives, show a placeholder the size of a small diagram, with `role="status"` and `aria-label="Drawing diagram"`.

| Stack | Draw when |
|---|---|
| Vercel AI SDK (`ai` 7) | The tool part's `state` is `output-available` and `output.status === 'rendered'` |
| Anthropic (`@anthropic-ai/sdk` 1.3) or OpenAI (`openai` 7.43) with your own loop | Your server sends the tool result to the browser (alongside the stream) and it says `rendered`. Wait for the end of the call's arguments too (`content_block_stop` / `response.function_call_arguments.done`) |
| Anything else | You hold the full arguments and a `rendered` result |

Then:

1. **A call whose result is `invalid` renders nothing.** The model's retry is a separate call that renders on its own.
2. **Render from the arguments**, not from text the model wrote. In history, store each call with its result and render it again on reload. `renderDiagram` parses again, so a failed attempt stays invisible, live or on reload, even if the server failed open.
3. **If `renderDiagram` returns `false`, hide the whole card.** (`null` means a newer render took over: do nothing.) No error, no empty frame. The prose answer stands on its own.

## The card

```html
<figure class="diagram-card">
  <div class="diagram-title" aria-hidden="true">How a support ticket gets resolved</div>
  <div class="diagram-toolbar"><!-- expand · download · copy --></div>
  <div class="diagram-area"></div>              <!-- renderDiagram's target -->
  <p class="diagram-caption" aria-hidden="true">Most tickets close on a saved reply.</p>
</figure>
```

```js
const ok = await renderDiagram(area, args, { mode: isDark() ? 'dark' : 'light' });
if (ok === false) card.hidden = true;   // null: a newer render took over
```

- `renderDiagram` puts `role="img"` and an `aria-label` of title plus caption on the target, and hides the SVG's own text from screen readers. The visible title and caption are `aria-hidden` so nothing is announced twice.
- **`.diagram-area { overflow-x: auto; }`** so a wide diagram scrolls instead of shrinking its text below 10px. Gantt charts lay out at least 600px wide and, with 10px text, never shrink, so on a phone they scroll.
- **Re-render when the theme changes,** and when the card's width changes by more than about 48px (a `ResizeObserver` on the card, debounced by about 200 ms). Watch your app's theme state, or `matchMedia('(prefers-color-scheme: dark)')`, and call `renderDiagram` again with the new mode.
- **Stale renders are handled.** A render that a newer one overtook returns `null` and writes nothing. Act only on `true` and `false`.

## The toolbar

Chat is narrow and diagrams get big. Three actions, shown on hover and on keyboard focus (`:hover, :focus-within`), and always visible on touch screens, which have no hover:

- **Expand:** a native `<dialog>` with the diagram at full width, and zoom from 50% to 300% in 25% steps plus a reset. Render the diagram again into the dialog with `renderDiagram`, rather than cloning the SVG: a clone shares Mermaid's element ids with the original.
- **Download:** `toPng(svg, { background })`, with `background` set to the current mode's `surface` colour, saved as `<title>.png`.
- **Copy source:** `navigator.clipboard.writeText(prepareSource(source))`, so the copy matches what was drawn, without the model's stripped styling.

Every action is a `<button>` with an `aria-label`. Focus returns to the expand button when the dialog closes.

## The code-fence fallback

Models sometimes write a ```` ```mermaid ```` fence in plain text anyway. Catch it in your Markdown renderer (the code block's language is `mermaid`) and draw it with the same function, with two differences:

- **Wait until it's complete and settled.** The fence streams in chunk by chunk, and a real model can pause mid-fence. Draw it only once the closing fence has arrived and the text has stopped changing for about 600 ms. Show the placeholder until then.
- **On failure, show the source.** Nothing validated it, and the model may have meant it as text, so fall back to a plain code block, not nothing.

`renderDiagram` runs the same size and type checks as the server, so a fenced pie chart or an oversized source falls back to a code block too.

```js
let timer;
function onFenceText(text, closed) {   // called on every streamed chunk
  clearTimeout(timer);
  if (!closed) return;                 // the closing ``` hasn't arrived yet
  timer = setTimeout(async () => {
    const ok = await renderDiagram(area, { title: 'Diagram', source: text, caption: '' }, { mode });
    if (ok === false) showCodeBlock(text);
  }, 600);
}
```

For the fence's accessible name, use the nearest heading above the fence in the same message. Failing that, use the sentence just before it, cut to about 60 characters. Failing both, use "Diagram".

**Count the bypasses** in your analytics, once per message (key on the message id, so theme switches and reloads don't count again). Message ids must be stable across reloads. With the AI SDK, pass `generateMessageId` (for example `crypto.randomUUID`) to `toUIMessageStreamResponse`, or the last assistant message is stored with an empty id. If they climb, the tool description needs work ([TOOL.md](TOOL.md)).

## Security

The source is model output, so treat it as untrusted.

- **Strict mode isn't enough on its own.** On Mermaid 12.2 with `securityLevel: 'strict'`, a label with `<img src=…>` still produced an `<img>` element (only `onerror` was removed), and a `click` line still produced a real link. `sanitizeSource` strips HTML tags and `click` lines, and tests confirmed neither survives. `<br>` becomes a space, and `<<interface>>` in class diagrams is kept.
- **Keep `securityLevel: 'strict'`**, which the theme sets. Never set Mermaid's `secure` keys from model output.
- **Size and type checks run in the browser too** (`diagram-rules.mjs`), so the fence path can't skip them.
- **Inject the SVG only from `mermaid.render`**, never the raw source.

## In your framework

`renderDiagram` needs an element and the arguments. Each framework's job is to hand it one and to call it again when the arguments, theme or width change.

- **React:** a `ref` on the target, and `renderDiagram` inside `useEffect` keyed on `source` and the theme.
- **Vue:** a template `ref`, called in `onMounted` and in a `watch` on the source and theme.
- **Svelte:** an action (`use:diagram={args}`) that renders on mount and on `update`.
- **Plain JS or web components:** call it on insert and on theme change.

Don't let the framework render children into the target element. Mermaid owns it.
