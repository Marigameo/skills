// Server gate for draw_diagram: runs the real Mermaid parser before a diagram
// reaches the user. Mermaid only parses inside a DOM, and putting a jsdom
// window on the server's own globals would make browser-sniffing libraries
// think they run in a browser, so the parser lives in a worker thread.
// Any worker failure fails OPEN: the browser parses again and hides a broken
// diagram, and chat never waits on the validator.
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { Worker } from 'node:worker_threads';

import { precheck, diagramKeyword } from './diagram-rules.mjs';

export { MAX_LINES, MAX_CHARS } from './diagram-rules.mjs';
const START_MS = 30_000; // loading jsdom + mermaid: ~0.6 s idle, seconds on a busy host
const PARSE_MS = 8_000;
const IDLE_MS = 10 * 60_000;

const WORKER = `
const { parentPort, workerData } = require('node:worker_threads');
(async () => {
  try {
    const { JSDOM } = await import(workerData.jsdom);
    const { window } = new JSDOM('<!doctype html><body></body>', { pretendToBeVisual: true });
    globalThis.window = window;
    globalThis.document = window.document;
    const mermaid = (await import(workerData.mermaid)).default;
    mermaid.initialize({ startOnLoad: false, securityLevel: 'strict' });
    parentPort.postMessage({ ready: true });
    parentPort.on('message', async ({ id, source }) => {
      try {
        const { diagramType } = await mermaid.parse(source);
        parentPort.postMessage({ id, ok: true, type: diagramType });
      } catch (error) {
        parentPort.postMessage({ id, ok: false, error: String(error?.message ?? error) });
      }
    });
  } catch (error) {
    parentPort.postMessage({ ready: false, error: String(error?.message ?? error) });
  }
})();`;

// One record per worker, so a worker that is shutting down never touches the
// state of the one that replaced it.
let current = null;
let idle = null;
let nextId = 0;

function startWorker() {
  const require = createRequire(import.meta.url);
  const url = (name) => pathToFileURL(require.resolve(name)).href;
  const worker = new Worker(WORKER, { eval: true, workerData: { jsdom: url('jsdom'), mermaid: url('mermaid') } });
  const record = { worker, pending: new Map() };
  record.ready = new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), START_MS);
    const settle = (ok) => { clearTimeout(timer); resolve(ok); };
    worker.once('message', (message) => settle(message.ready === true));
    worker.once('error', () => settle(false));
    worker.once('exit', () => settle(false));
  });
  worker.on('message', (message) => {
    const done = record.pending.get(message.id);
    if (done) { record.pending.delete(message.id); done(message); }
  });
  worker.on('exit', () => {
    for (const done of record.pending.values()) done({ unverified: 'worker_exited' });
    record.pending.clear();
    if (current === record) current = null;
  });
  // After the listeners: adding a 'message' listener refs the worker again, and
  // a referenced worker keeps scripts, tests and evals from ever exiting.
  worker.unref();
  return record;
}

async function parse(source) {
  try { current ??= startWorker(); } catch { return { unverified: 'worker_unavailable' }; }
  const record = current;
  if (!(await record.ready)) { stopWorker(record); return { unverified: 'worker_unavailable' }; }
  clearTimeout(idle);
  idle = setTimeout(() => stopWorker(record), IDLE_MS);
  idle.unref();
  return new Promise((resolve) => {
    const id = nextId++;
    const timer = setTimeout(() => { record.pending.delete(id); stopWorker(record); resolve({ unverified: 'timeout' }); }, PARSE_MS);
    record.pending.set(id, (reply) => { clearTimeout(timer); resolve(reply); });
    record.worker.postMessage({ id, source });
  });
}

export function stopWorker(record = current) {
  if (!record) return;
  if (current === record) { current = null; clearTimeout(idle); }
  record.worker.terminate();
}

/**
 * Check a model-written diagram. Never throws: a rejection is data for the
 * model to repair from, not an execution error.
 */
export async function validateDiagram(source) {
  const rejected = precheck(source);
  if (rejected) return rejected;
  const text = source.trim();
  const reply = await parse(text);
  if (reply.unverified) return { ok: true, verified: false, reason: reply.unverified };
  if (!reply.ok) return reject('syntax', compact(reply.error), repairHint(text, reply.error));
  return { ok: true, verified: true, type: reply.type };
}

function reject(reason, error, hint) {
  return { ok: false, reason, error, hint };
}

// The "Parse error on line N" head and its caret excerpt. The "Expecting ..."
// tail lists every grammar token and costs tokens without helping a repair.
function compact(message) {
  return message.split('\n').slice(0, 3).join('\n').slice(0, 400);
}

const RESERVED = 'end|call|click|href|style|class|classDef|graph|subgraph|default';
const RESERVED_BEFORE = new RegExp(`^\\s*(${RESERVED})\\s*(\\[|\\(|\\{|-->|==>|-\\.->|---)`, 'm');
const RESERVED_AFTER = new RegExp(`(?:-->|==>|-\\.->|---)(?:\\|[^|]*\\|)?\\s*(${RESERVED})\\b`, 'm');

/** One targeted hint for the failures models hit most, else the general rules. */
export function repairHint(source, error = '') {
  const reserved = RESERVED_BEFORE.exec(source) ?? RESERVED_AFTER.exec(source);
  if (reserved) return `\`${reserved[1]}\` is a reserved word; rename that node id, e.g. \`${reserved[1]}Step\`.`;
  if (/No diagram type detected/.test(error)) return 'Start with the diagram type on the first line, e.g. `flowchart TD` or `sequenceDiagram`.';
  if (/^\s*%(?!%)/m.test(source)) return 'Comments start with %% on their own line, never a single %.';
  if (diagramKeyword(source) === 'sequencediagram' && /:[^\n]*;/.test(source)) return 'A ; ends a sequence message early. Write #59; instead, or rephrase.';
  if (/[[({]\s*[^"\]\n)}]*[():;,#][^"\]\n]*\s*[\])}]/.test(source)) return 'Wrap labels that contain ( ) : ; , or # in double quotes, e.g. A["Budget (USD)"].';
  return 'Quote labels with punctuation (A["Label: detail"]), keep node ids alphanumeric, write comments as %%, and close every subgraph, loop and alt with end.';
}
