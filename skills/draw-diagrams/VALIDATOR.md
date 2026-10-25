# The server gate

[validate-diagram.mjs](validate-diagram.mjs), with the shared size and type checks in [diagram-rules.mjs](diagram-rules.mjs), checks every `draw_diagram` call with the real Mermaid parser before the result goes back to the model. A broken diagram is rejected with a targeted hint, the model gets one retry, and the user never sees the failure. Tested on Node 22 with Mermaid 12.2.0 and jsdom 29.

```bash
npm install mermaid@12.2.0 jsdom
```

```js
import { validateDiagram } from './validate-diagram.mjs';

const verdict = await validateDiagram(input.source);
// { ok: true, verified: true, type: 'flowchart-v2' }
// { ok: true, verified: false, reason: 'timeout' }          ← failed open
// { ok: false, reason: 'syntax', error: '…', hint: '…' }    ← send back to the model
```

Turn the verdict into the tool result shown in [TOOL.md](TOOL.md). Log every `verified: false`. If it happens often, the worker isn't loading.

## What it checks, in order

| Check | Rejects with | Hint |
|---|---|---|
| Empty source | `empty` | Start with the diagram type |
| Over 80 lines or 5,000 characters | `too_large` | Keep 5–15 nodes, or offer a follow-up |
| `pie`, `xychart`, `sankey`, `radar`, `treemap` | `data_chart` | The chart tool to use. Edit `CHART_TYPES` to name yours |
| `architecture`, `zenuml`, `block`, `packet`, `kanban`, and by default `classDiagram`, `requirementDiagram`, `gitGraph` and the C4 types | `unsupported_type` | Redraw as a flowchart |
| The real parser | `syntax` | One targeted hint, below |

The first four are string checks in `diagram-rules.mjs`. They run even when the parser is down, and the browser runs them too, so a code fence can't skip them. Allowing a type is a one-line change to `UNSUPPORTED`, not a prompt rewrite. Class, requirement, git and C4 diagrams parse fine, but haven't been checked with the theme in light and dark. Render one of each before you allow them ([DESIGN.md](DESIGN.md)).

## Repair hints

The parser's error says where it failed, not how to fix it. The validator keeps only the first three lines of the error (the "Expecting …" tail lists every grammar token and costs tokens without helping) and adds one hint:

| When | Hint |
|---|---|
| A reserved word used as a node id (`end`, `class`, `style`…) | Rename that id, e.g. `endStep` |
| No diagram type on the first line | Start with the type |
| A single `%` | Comments start with `%%` |
| A `;` inside a sequence message | Write `#59;` or rephrase |
| An unquoted label with ( ) : ; , or # | Wrap it in double quotes |
| Anything else | The general rules |

When the eval or your logs show the same failure twice, add a targeted hint for it. A precise hint is what makes the single retry work.

## Why it's built this way

- **A worker thread.** Mermaid only parses inside a DOM, because it builds its sanitiser against a global `window`. Putting a jsdom `window` on your server's own globals would make other libraries (some AI SDKs among them) believe they run in a browser. The worker keeps those globals to itself.
- **Started on first use, then kept warm.** On a laptop, the first check took about 0.7 s including the cold start, and later checks about 6 ms. It shuts down after 10 idle minutes.
- **Fails open.** If the worker can't start, crashes or times out, the diagram is accepted as unverified. The browser parses it again and draws nothing if it's broken. A validator outage must never block chat.
- **Separate time limits:** 30 s to start, 8 s to parse. Under a single shared limit, a slow cold start on a busy host is killed, respawned and killed again, and nothing is ever checked.
- **Doesn't hold your process open.** The worker is unreferenced after its listeners are attached, so scripts, tests and evals that import the validator exit on their own. (Adding a `message` listener re-references a worker, which a wiring test caught.)
- **`.mjs` files,** so Node loads them as ES modules whether or not your project sets `"type": "module"`.
- **One record per worker.** After a timeout, the old worker's exit event fires late. If shutdown cleared shared state, it would wipe out the worker that replaced it. Testing caught exactly that, so each worker only cleans up after itself.

## Verified behaviour

The suite these numbers came from:

- **Accepted:** flowchart, sequence, state, mindmap, timeline, journey, gantt, quadrant and ER. A source with `%%{init}%%` also passes, because the renderer strips styling, not the gate.
- **Rejected with the right hint:** `end` as an id, unquoted `(USD)` in a label, a `;` in a sequence message, a bare `%`, a missing `end`, plain prose, empty, 91 lines, `pie`, `xychart-beta`, `architecture-beta`, and (off by default) class, git and C4.
- **Fail open:** with Mermaid missing, with jsdom failing to load, and with a 1 ms parse limit. The next call with normal limits verifies again.
- **Five checks at once** on a warm worker each got the right verdict.

**What the parser can't catch:** `a---ops` parses fine but draws a circle-ended line to a node called `ps`. Guidance prevents that one ([MODEL-SKILL.md](MODEL-SKILL.md), "Put spaces around every arrow").

## Other server runtimes

- **Node:** use the file as it is.
- **Python, Go, Ruby and others:** run the validator as a small Node sidecar, about 20 lines of HTTP around `validateDiagram`, and call it from your tool handler with a short timeout. If the sidecar is unreachable, treat that as `verified: false`.
- **Edge runtimes without worker threads** (some serverless platforms): use a sidecar, or skip the server gate. Without it, the browser still hides broken diagrams, but the model gets no repair loop, so more answers end up without their diagram. Watch how often the browser's parse fails.

The Mermaid CLI (`mmdc`) also validates, but it starts a headless browser for each call. It's fine for docs, but too slow for a chat turn.
