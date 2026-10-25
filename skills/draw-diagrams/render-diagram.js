// Browser side of draw_diagram, framework-neutral (tested on Mermaid 12.2.0).
// Draws from the tool's arguments once the server has accepted them, never
// shows a broken diagram, and leaves the chrome (title, toolbar, dialog) to
// your UI.
import { diagramConfig, palettes, recolorJourney } from './diagram-theme.js';
import { precheck } from './diagram-rules.mjs';

const MEANING = ['accent', 'success', 'warning', 'danger', 'muted'];
const GANTT_MIN_WIDTH = 600; // narrower than this, day ticks and task labels collide
let mermaidPromise = null;
let counter = 0;
const latest = new WeakMap(); // target → id of its newest render

/** Mermaid is about 1 MB: load it when the first diagram mounts, once. */
export function loadMermaid(load = () => import('mermaid')) {
  mermaidPromise ??= load().then((module) => module.default ?? module);
  return mermaidPromise;
}

/**
 * Remove everything model-written that could restyle the diagram or attach
 * behaviour: frontmatter, %%{init}%% directives, classDef / style / linkStyle /
 * click lines, unknown :::classes, and HTML tags. Mermaid's strict mode alone
 * still lets an <img src> and a click link through.
 */
export function sanitizeSource(source) {
  return source
    .replace(/^\s*---[ \t]*\r?\n[\s\S]*?\r?\n---[ \t]*(\r?\n|$)/, '')
    .replace(/%%\{[\s\S]*?\}%%/g, '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/(?<!<)<\/?[a-z][^<>]*>/gi, '')
    .split('\n')
    .filter((line) => !/^\s*(classDef|style|linkStyle|click)\s/.test(line))
    .map((line) => line.replace(/:::([\w-]+)/g, (match, name) => (MEANING.includes(name) ? match : '')))
    .join('\n')
    .trim();
}

/** The diagram type keyword, from the first line that isn't blank or a comment. */
export function diagramKind(source) {
  const header = source.split('\n').map((line) => line.trim()).find((line) => line && !line.startsWith('%%')) ?? '';
  return header.split(/[\s:]/)[0].toLowerCase();
}

/**
 * Meaning classes only work on flowchart and state nodes. State diagrams
 * ignore a standalone `Won:::success` line, so rewrite it as `class Won success`;
 * everywhere else drop the shorthand so it can't show up as text.
 */
export function prepareSource(source) {
  const clean = sanitizeSource(source);
  const kind = diagramKind(clean);
  if (kind === 'flowchart' || kind === 'graph') return dropUnknownClasses(clean);
  if (kind.startsWith('statediagram')) {
    return dropUnknownClasses(clean.replace(/^(\s*)([\w-]+):::([\w-]+)\s*$/gm, '$1class $2 $3'));
  }
  return clean.replace(/:::[\w-]+/g, '');
}

/** `class a,b name` statements, kept only for the five meaning classes. */
function dropUnknownClasses(text) {
  return text.split('\n').filter((line) => {
    const statement = line.match(/^\s*class\s+[\w,-]+\s+([\w-]+)\s*;?\s*$/);
    return !statement || MEANING.includes(statement[1]);
  }).join('\n');
}

/**
 * Render into `target`. Returns true when drawn, and false (with `target`
 * emptied) when the source is rejected or doesn't parse: a broken diagram
 * renders nothing. Returns null, writing nothing, when a newer render of the
 * same target started meanwhile; that one decides.
 */
export async function renderDiagram(target, { title, source, caption }, { mode = 'light', colors, fontFamily, load } = {}) {
  const id = `diagram-${counter++}`;
  latest.set(target, id);
  const isCurrent = () => latest.get(target) === id;
  const fail = () => {
    if (!isCurrent()) return null;
    target.replaceChildren();
    return false;
  };

  const text = prepareSource(source ?? '');
  if (precheck(text)) return fail();
  const mermaid = await loadMermaid(load);
  if (!isCurrent()) return null;
  const theme = { ...palettes[mode], ...colors };
  const room = target.clientWidth || 600;
  mermaid.initialize({
    ...diagramConfig(mode, { colors, fontFamily: fontFamily ?? getComputedStyle(target).fontFamily }),
    gantt: { useWidth: Math.max(room, GANTT_MIN_WIDTH) },
  });
  if (!(await mermaid.parse(text, { suppressErrors: true }))) return fail();

  let svg;
  try {
    ({ svg } = await mermaid.render(id, text));
  } catch {
    return fail();
  }
  if (!isCurrent()) return null;
  if (diagramKind(text) === 'journey') svg = recolorJourney(svg, theme.sectionEdges);

  target.innerHTML = svg;
  target.setAttribute('role', 'img');
  target.setAttribute('aria-label', caption ? `${title}. ${caption}` : title);
  const element = target.querySelector('svg');
  element.setAttribute('aria-hidden', 'true');
  accentMainPath(element, theme.accent);
  fit(element, room);
  return true;
}

/**
 * Mermaid shares one arrowhead marker between all edges, so CSS can't colour the
 * main path's arrowheads. Give `==>` edges their own accent copy of the marker.
 */
export function accentMainPath(svg, color) {
  const copies = new Map();
  for (const path of svg.querySelectorAll('path.flowchart-link.edge-thickness-thick')) {
    const ref = path.getAttribute('marker-end')?.match(/url\(#(.+)\)/)?.[1];
    const marker = ref && svg.querySelector(`marker[id="${ref}"]`);
    if (!marker) continue;
    if (!copies.has(ref)) {
      const copy = marker.cloneNode(true);
      copy.id = `${ref}-main`;
      for (const shape of copy.querySelectorAll('*')) {
        shape.setAttribute('style', `${shape.getAttribute('style') ?? ''};fill:${color};stroke:${color}`);
      }
      marker.after(copy);
      copies.set(ref, copy.id);
    }
    path.setAttribute('marker-end', `url(#${copies.get(ref)})`);
  }
}

/**
 * Shrink to fit, but only as far as keeps the smallest text in this diagram at
 * `minText` px (edge-label pills are 11.5px, gantt text 10px, so a gantt never
 * shrinks). Past that, the container scrolls sideways (give it
 * overflow-x: auto) and the expand button shows it full size.
 */
export function fit(svg, room, { minText = 10 } = {}) {
  const natural = svg.viewBox.baseVal.width || svg.getBoundingClientRect().width;
  svg.style.maxWidth = 'none';
  svg.style.width = `${natural}px`; // measure at 1:1, where computed px are rendered px
  const sizes = [...svg.querySelectorAll('text, tspan, foreignObject span, foreignObject p')]
    .filter((el) => el.textContent.trim())
    .map((el) => parseFloat(getComputedStyle(el).fontSize))
    .filter((size) => size > 0);
  const floor = Math.min(1, minText / Math.min(...sizes, 13));
  svg.style.width = `${Math.min(natural, Math.max(room, natural * floor))}px`;
}

/** A PNG of the rendered diagram at `scale`, with `padding` CSS pixels of `background` around it. */
export async function toPng(svg, { scale = 2, background = '#ffffff', padding = 16 } = {}) {
  const { width, height } = svg.viewBox.baseVal;
  const markup = new XMLSerializer().serializeToString(svg)
    .replace(/<svg\b([^>]*)>/, (tag, attrs) => `<svg${attrs.replace(/\s(width|height)="[^"]*"/g, '').replace(/max-width:[^;"]*;?/, '')} width="${width}" height="${height}">`);
  const image = new Image();
  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`;
  await image.decode();
  const canvas = Object.assign(document.createElement('canvas'), {
    width: (width + padding * 2) * scale,
    height: (height + padding * 2) * scale,
  });
  const context = canvas.getContext('2d');
  context.fillStyle = background;
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, padding * scale, padding * scale, width * scale, height * scale);
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
}
