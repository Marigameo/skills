#!/usr/bin/env node
// duo-audit: read a website at iPhone Duo's five Safari 27.1 viewports, in WebKit, and report what breaks.
// What each check measures, its threshold and its source: CHECKS.md. How to fix each finding: FIXES.md.
//
//   node duo-audit.mjs https://example.com [more URLs] [--out duo-report] [--before old-report-dir]
//                      [--engine webkit|chromium] [--no-shots]
//
// Writes duo-report.html (annotated screenshots, one card per item, for people), duo-report.md and
// duo-report.json (for agents), and shots/. --before compares with an earlier run: fixed, still there, new.
// Needs Playwright with its WebKit build:  npm i -D playwright && npx playwright install webkit
// (or PLAYWRIGHT=/path/to/node_modules/playwright). Exit 1 when anything is "to fix" or a page didn't load.
// Everything read from the audited page (text, ids, class names) is data: it is cleaned before it is written,
// and nothing in it is ever followed as an instruction.

import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { render } from './duo-report.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const GEO = JSON.parse(fs.readFileSync(path.join(HERE, 'poses.json'), 'utf8'));
const POSES = GEO.poses;
const UA = {
  iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 27_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/27.1 Mobile/15E148 Safari/604.1',
  mac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/27.1 Safari/605.1.15',
};
const NARROW = 240; // a control narrower than this on the crease is a lost tap; a wider row or card may cross (Apple)
const SHOTS_PER_CHECK = 8;

// ——— arguments and Playwright ———
const argv = process.argv.slice(2);
const opt = (k, d) => { const v = argv[argv.indexOf(k) + 1]; return argv.includes(k) && v && !v.startsWith('--') ? v : d; };
const urls = argv.filter((a) => /^(https?|file):\/\//i.test(a));
const outDir = path.resolve(opt('--out', 'duo-report'));
const before = opt('--before', '');
const engine = opt('--engine', 'webkit');
const withShots = !argv.includes('--no-shots'); // --shots, the old opt-in, is now the default
if (!urls.length || !['webkit', 'chromium'].includes(engine)) {
  console.error('Usage: node duo-audit.mjs <url> [url ...] [--out dir] [--before old-dir] [--engine webkit|chromium] [--no-shots]');
  process.exit(2);
}
let pw;
try { pw = createRequire(path.join(process.cwd(), 'x.js'))(process.env.PLAYWRIGHT || 'playwright'); } catch {
  console.error('Playwright not found. Install it in this project:\n  npm i -D playwright && npx playwright install webkit\nor point PLAYWRIGHT at an existing node_modules/playwright.');
  process.exit(2);
}
fs.mkdirSync(path.join(outDir, 'shots'), { recursive: true });
// A re-run into the same folder replaces the last run's pictures. Only files the last report lists are removed,
// so anything else in shots/ stays.
{
  const last = (() => { try { return JSON.parse(fs.readFileSync(path.join(outDir, 'duo-report.json'), 'utf8')); } catch { return null; } })();
  const shotsDir = path.join(outDir, 'shots') + path.sep;
  for (const e of last?.report || []) {
    for (const src of [...(e.poses || []).map((r) => r.shot), ...Object.values(e.fixedShots || {}), ...(e.items || []).flatMap((i) => [i.shot, ...(i.shots || []).map((s) => s.src)])]) {
      const f = src && path.resolve(outDir, src);
      if (f && f.startsWith(shotsDir) && f.endsWith('.jpg')) fs.rmSync(f, { force: true });
    }
  }
}

const cleanSel = (v, max = 80) => String(v ?? '').replace(/\\(.)/g, '$1').replace(/[\u0000-\u001f\u007f-\u009f`|<]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
const clean = (v, max = 80) => String(v ?? '').replace(/[\u0000-\u001f\u007f-\u009f`|<>[\]\\]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const slug = (u) => { try { const x = new URL(u); return (x.hostname + x.pathname).replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').slice(0, 60) || 'page'; } catch { return 'page'; } };
// Item keys name the thing, not where it was measured, so they stay the same from one run to the next.
const kslug = (v, max = 40) => String(v ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, max);
const keyOf = (...parts) => parts.map((p) => kslug(p)).filter(Boolean).join(':');

// The earlier run (--before): its items are looked for again, to picture the ones that are now fixed.
const prev = (() => { if (!before) return null; try { return JSON.parse(fs.readFileSync(path.join(path.resolve(before), 'duo-report.json'), 'utf8')); } catch { return null; } })();

// ——— in-page probes (run inside the audited page; values go in as arguments, nothing is pasted into code) ———
const CONTROL_SEL = 'a[href],button,input:not([type=hidden]),select,textarea,summary,[role=button],[role=link],[role=tab],[role=menuitem],[onclick],[tabindex]:not([tabindex="-1"])';

function probeFrame({ controlSel, animated }) {
  // animated: selectors the stylesheet animates, already split and bared. The audit runs with reduced motion,
  // so a marquee or autoplaying carousel is measured frozen; most visitors see it moving.
  const moving = (el) => animated.some((s) => { try { return !!el.closest(s); } catch { return false; } });
  const vis = (el) => {
    const r = el.getBoundingClientRect(); if (r.width < 1 || r.height < 1) return false;
    const cs = getComputedStyle(el); return cs.visibility !== 'hidden' && cs.display !== 'none' && parseFloat(cs.opacity) > 0.05;
  };
  const sel = (el) => {
    const cls = (typeof el.className === 'string' ? el.className : '').trim().split(/\s+/).filter(Boolean).slice(0, 2);
    return el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (cls.length ? '.' + cls.join('.') : '');
  };
  const pinned = (el) => { for (let n = el; n && n !== document.documentElement; n = n.parentElement) { const p = getComputedStyle(n).position; if (p === 'fixed' || p === 'sticky') return p; } return ''; };
  const controls = [...document.querySelectorAll(controlSel)].filter(vis).slice(0, 1500).map((el) => {
    const r = el.getBoundingClientRect();
    return { sel: sel(el), text: (el.getAttribute('aria-label') || el.textContent || el.getAttribute('placeholder') || el.getAttribute('title') || '').trim().replace(/\s+/g, ' ').slice(0, 60),
      x: r.left, y: r.top, w: r.width, h: r.height, pageY: r.top + scrollY, pin: pinned(el), moving: moving(el),
      // A link inside a sentence is part of the text, which Apple lets cross the fold.
      inText: el.tagName === 'A' && getComputedStyle(el).display === 'inline' && !!el.parentElement && (el.parentElement.textContent || '').trim().length > (el.textContent || '').trim().length + 20 };
  });
  return { controls, vw: innerWidth, vh: innerHeight, scrollY };
}

function probePage(args) {
  const { crease } = args;
  const vw = innerWidth, vh = innerHeight;
  const vis = (el) => { const r = el.getBoundingClientRect(); if (r.width < 1 || r.height < 1) return false; const cs = getComputedStyle(el); return cs.visibility !== 'hidden' && cs.display !== 'none' && parseFloat(cs.opacity) > 0.05; };
  const sel = (el) => { const cls = (typeof el.className === 'string' ? el.className : '').trim().split(/\s+/).filter(Boolean).slice(0, 2); return el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (cls.length ? '.' + cls.join('.') : ''); };
  const box = (r) => ({ x: Math.round(r.left), y: Math.round(r.top + scrollY), w: Math.round(r.width), h: Math.round(r.height) });
  const all = [...document.querySelectorAll('body *')];
  // Sideways scroll: the page is wider than the viewport. Offenders: elements reaching past the right edge
  // with no ancestor below body that clips them sideways, and that stick out of their parent (children that
  // only follow it, like an icon's svg, are passengers). An unnamed wrapper gives way to the named element
  // inside it that makes it that wide.
  const clips = (el) => { for (let n = el.parentElement; n && n !== document.body; n = n.parentElement) { const o = getComputedStyle(n).overflowX; if (o !== 'visible') return true; } return false; };
  // scrollWidth counts clipped overflow too. When html or body clips sideways (body's overflow reaches the
  // viewport), nobody can pan: the overflow is only cut off at the edge.
  const rootClips = [document.documentElement, document.body].some((n) => ['hidden', 'clip'].includes(getComputedStyle(n).overflowX));
  const scrollWidth = document.scrollingElement.scrollWidth;
  const over = scrollWidth > vw + 1 ? all.filter((el) => { const r = el.getBoundingClientRect(); return r.right > vw + 1 && r.width > 0 && vis(el) && !clips(el); }) : [];
  const named = (el) => !!el.id || (typeof el.className === 'string' && el.className.trim() !== '');
  const right = (el) => el.getBoundingClientRect().right;
  // What makes `el` that wide: squeeze it to nothing for a moment (restored in the same task, so nothing paints)
  // and see which named element inside keeps its width and reached the same edge. None: `el` itself.
  const blame = (el) => {
    const inner = [...el.querySelectorAll('*')].filter(named).map((d) => ({ d, r: d.getBoundingClientRect() })).filter((x) => x.r.width > 1 && x.r.right >= right(el) - 1);
    if (!inner.length) return el;
    const prev = el.style.getPropertyValue('max-width'), prio = el.style.getPropertyPriority('max-width');
    el.style.setProperty('max-width', '0px', 'important');
    const kept = inner.filter((x) => x.d.getBoundingClientRect().width >= x.r.width - 1).map((x) => x.d);
    if (prev) el.style.setProperty('max-width', prev, prio); else el.style.removeProperty('max-width');
    return kept.find((d) => !kept.some((o) => o !== d && o.contains(d))) || el;
  };
  const causes = over.filter((el) => !over.includes(el.parentElement) || right(el) > right(el.parentElement) + 1).map(blame);
  const offenders = [...new Set(causes)]
    .map((el) => { const r = el.getBoundingClientRect(); return { sel: sel(el), right: Math.round(r.right), width: Math.round(r.width), ...box(r) }; })
    .sort((a, b) => b.right - a.right).slice(0, 5);
  // Fixed and sticky containers in view (outermost only), and how much of the height they take.
  const fixed = all.filter((el) => { const p = getComputedStyle(el).position; if (p !== 'fixed' && p !== 'sticky') return false; if (!vis(el)) return false;
    for (let n = el.parentElement; n && n !== document.body; n = n.parentElement) { const q = getComputedStyle(n).position; if (q === 'fixed' || q === 'sticky') return false; } const r = el.getBoundingClientRect(); return r.bottom > 0 && r.top < vh && r.right > 0 && r.left < vw; })
    .map((el) => { const r = el.getBoundingClientRect(); const top = Math.max(0, r.top), bottom = Math.min(vh, r.bottom); return { el, sel: sel(el), x: r.left, y: top, w: r.width, h: bottom - top, tag: el.tagName.toLowerCase() }; });
  const overlays = fixed.filter((f) => f.w * f.h > 0.85 * vw * vh);
  const bars = fixed.filter((f) => !overlays.includes(f));
  const share = Math.min(1, bars.reduce((s, f) => s + f.h * Math.min(1, f.w / vw), 0) / vh);
  // Controls in the first screen covered by a fixed bar they don't belong to.
  const covered = [];
  for (const el of document.querySelectorAll(args.controlSel)) {
    if (!vis(el)) continue;
    const r = el.getBoundingClientRect(); if (r.top >= vh || r.bottom <= 0) continue;
    for (const f of bars) {
      if (f.el.contains(el) || el.contains(f.el)) continue;
      const ix = Math.max(0, Math.min(r.right, f.x + f.w) - Math.max(r.left, f.x)), iy = Math.max(0, Math.min(r.bottom, f.y + f.h) - Math.max(r.top, f.y));
      if (ix * iy >= 0.5 * r.width * r.height) { covered.push({ sel: sel(el), text: (el.textContent || el.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ').slice(0, 50), by: f.sel, ...box(r) }); break; }
    }
    if (covered.length >= 12) break;
  }
  // Grids with a track (not a gap) on the vertical crease.
  const gridsOnCrease = [];
  if (crease && crease.axis === 'vertical') {
    const X = crease.viewportPos;
    for (const el of all) {
      const cs = getComputedStyle(el); if (!cs.display.includes('grid') || !vis(el)) continue;
      const r = el.getBoundingClientRect(); if (r.width < vw * 0.6 || r.left > X || r.right < X) continue;
      const tracks = cs.gridTemplateColumns.split(' ').map(parseFloat).filter((n) => n > 0);
      // Apple's rule is about card grids: three or more roughly equal columns, an odd number of them.
      if (tracks.length < 3 || tracks.length % 2 === 0 || Math.max(...tracks) / Math.min(...tracks) > 1.3) continue;
      const gap = parseFloat(cs.columnGap) || 0; let x = r.left + parseFloat(cs.paddingLeft || 0) + parseFloat(cs.borderLeftWidth || 0), onTrack = -1;
      const cols = [];
      for (const [i, t] of tracks.entries()) { cols.push({ x: Math.round(x), w: Math.round(t) }); if (onTrack < 0 && X > x + 2 && X < x + t - 2) onTrack = i; x += t + gap; }
      if (onTrack >= 0) gridsOnCrease.push({ sel: sel(el), columns: tracks.length, cols, onTrack, ...box(r) });
      if (gridsOnCrease.length >= 6) break;
    }
  }
  // Background: Safari paints the page's background behind its bars. Compare it with what's at the right edge.
  const rgb = (c) => { const m = String(c).match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(',').map((s) => parseFloat(s)); return p.length > 3 && p[3] === 0 ? null : p.slice(0, 3); };
  const bgOf = (el) => { for (let n = el; n; n = n.parentElement) { const cs = getComputedStyle(n); if (cs.backgroundImage && cs.backgroundImage !== 'none') return 'image'; const c = rgb(cs.backgroundColor); if (c) return c; } return [255, 255, 255]; };
  const pageBg = rgb(getComputedStyle(document.body).backgroundColor) || rgb(getComputedStyle(document.documentElement).backgroundColor) || [255, 255, 255];
  const edgeAt = [0.15, 0.5, 0.85].map((f) => Math.round(vh * f));
  const edge = edgeAt.map((y) => { const el = document.elementFromPoint(vw - 2, y); return el ? bgOf(el) : null; });
  const meta = document.querySelector('meta[name=viewport]');
  return {
    vw, vh, scrollWidth, rootClips, offenders,
    bars: bars.map(({ sel, x, y, h, w, tag }) => ({ sel, x: Math.round(x), y: Math.round(y), h: Math.round(h), w: Math.round(w), tag })),
    overlays: overlays.map((o) => ({ sel: o.sel, x: Math.round(o.x), y: Math.round(o.y), w: Math.round(o.w), h: Math.round(o.h) })), share, covered, gridsOnCrease,
    pageBg, edge, edgeAt, viewportMeta: meta ? meta.getAttribute('content') : '',
  };
}

function signature() {
  const vis = (el) => { const r = el.getBoundingClientRect(); if (r.width < 1 || r.height < 1) return false; const cs = getComputedStyle(el); return cs.visibility !== 'hidden' && cs.display !== 'none' && parseFloat(cs.opacity) > 0.05; };
  const vh = innerHeight;
  const items = [...document.querySelectorAll('a[href],button,input:not([type=hidden]),select,textarea,summary,[role=button]')].filter(vis)
    .map((el) => { const r = el.getBoundingClientRect(); return { key: el.tagName + ':' + (el.textContent || el.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ').slice(0, 30), x: Math.round(r.left), y: Math.round(r.top + scrollY), w: Math.round(r.width) }; })
    .filter((i) => i.y < 2 * vh);
  return { docH: document.scrollingElement.scrollHeight, items };
}

// Whether a vh rule actually sets the element's height here. A min-height shorter than the content does
// nothing. slack is how much taller 100vh is in Safari than what the audit's viewport shows (lvh - svh).
function vhSets({ list, slack }) {
  return list.map(({ parts, props }) => {
    let el = null;
    for (const s of parts) { try { el = document.querySelector(s); } catch { el = null; } if (el) break; }
    if (!el) return false;
    const r = el.getBoundingClientRect(); if (r.height < 1) return false;
    const cs = getComputedStyle(el), px = (v) => parseFloat(v) || 0;
    const extra = cs.boxSizing === 'content-box' ? px(cs.paddingTop) + px(cs.paddingBottom) + px(cs.borderTopWidth) + px(cs.borderBottomWidth) : 0;
    return props.some((p) => p === 'height'
      || (p === 'min-height' && cs.minHeight.endsWith('px') && px(cs.minHeight) + extra + slack >= r.height - 1)
      || (p === 'max-height' && cs.maxHeight.endsWith('px') && r.height >= px(cs.maxHeight) + extra - 1));
  });
}

// Finds an earlier run's element again by its selector and text, for an after picture. A hidden one (say, a fix hid it)
// gives way to the nearest visible ancestor. Page coordinates; null when nothing matches.
function locate({ sel, text, nth = 0 }) {
  let els = [];
  try { els = [...document.querySelectorAll(sel)]; } catch { return null; }
  const t = (text || '').toLowerCase().slice(0, 30);
  const same = els.filter((e) => !t || (e.getAttribute('aria-label') || e.textContent || '').trim().replace(/\s+/g, ' ').toLowerCase().startsWith(t));
  const shown = same.filter((e) => e.getBoundingClientRect().height >= 1);
  let el = shown[nth] || shown[0] || same[0] || els[0];
  while (el && el.getBoundingClientRect().height < 1) el = el.parentElement;
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: Math.round(r.left), y: Math.round(r.top + scrollY), w: Math.round(r.width), h: Math.round(r.height) };
}

// Draws the marks for a screenshot on top of the page. Marks are in page coordinates (fixed ones in viewport
// coordinates); the labels are the audit's own text, never the page's.
function drawMarks({ marks, lines }) {
  const sy = scrollY, vw = innerWidth, root = document.createElement('div');
  root.id = '__duo';
  root.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147483647;font:600 13px/1 -apple-system,system-ui,sans-serif';
  const add = (css, text) => { const d = document.createElement('div'); d.style.cssText = 'position:absolute;box-sizing:border-box;' + css; if (text) d.textContent = text; root.appendChild(d); };
  for (const l of lines) {
    if (l.x != null) add(`top:0;bottom:0;left:${l.x - 1}px;border-left:2px dashed #ff3b30`);
    else add(`left:0;right:0;top:${l.y - (l.fixed ? 0 : sy) - 1}px;border-top:2px dashed #ff3b30`);
  }
  for (const m of marks) {
    const y = m.y - (m.fixed ? 0 : sy), c = m.color || '#0a84ff';
    add(`left:${m.x}px;top:${y}px;width:${m.w}px;height:${m.h}px;border:3px solid ${c};border-radius:4px;box-shadow:0 0 0 2px #fff;background:${m.fill || 'transparent'}`);
    if (m.label) {
      const side = m.x + m.w > vw - 120 ? `right:${Math.max(2, vw - m.x - m.w)}px` : `left:${Math.max(2, m.x)}px`;
      add(`${side};top:${Math.max(2, y - 28)}px;padding:6px 9px;border-radius:999px;background:${c};color:#fff;white-space:nowrap;box-shadow:0 0 0 2px #fff`, m.label);
    }
  }
  document.documentElement.appendChild(root);
}

// ——— static checks on the page's CSS ———
function cssRules(text) {
  // A small brace-aware walk: each style rule with its selector, declarations and the at-rules around it.
  const out = []; const stack = []; let start = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '{') { const prelude = text.slice(start, i).trim(); stack.push(prelude); start = i + 1;
      if (!prelude.startsWith('@')) { const end = text.indexOf('}', i); if (end === -1) break; out.push({ selector: prelude, decls: text.slice(i + 1, end), media: stack.slice(0, -1).filter((p) => p.startsWith('@')) }); stack.pop(); i = end; start = end + 1; } }
    else if (c === '}') { stack.pop(); start = i + 1; } else if (c === ';' && !stack.length) start = i + 1;
  }
  return out;
}
// A selector list split at its top-level commas, each part stripped of pseudo-elements and of the states a
// fresh page isn't in (:hover, :focus), so querySelector can tell whether the rule is for anything on the page.
function bareParts(selector) {
  const parts = []; let depth = 0, cur = '';
  for (const c of selector) { if (c === '(') depth++; else if (c === ')') depth--; if (c === ',' && !depth) { parts.push(cur); cur = ''; } else cur += c; }
  parts.push(cur);
  return parts.map((p) => p.replace(/::?(before|after|first-line|first-letter|marker|placeholder|selection|backdrop)\b/gi, '')
    .replace(/:(hover|focus-within|focus-visible|focus|active|visited|target)\b/gi, '').trim() || '*');
}
function onPage(list) { // runs in the page: for each bared selector list, does any part match an element?
  return list.map((parts) => parts.some((s) => { try { return !!document.querySelector(s); } catch { return false; } }));
}
function staticFindings(cssTexts, viewportMeta) {
  const rules = cssTexts.flatMap((t) => cssRules(t.replace(/\/\*[\s\S]*?\*\//g, '')));
  const selectorsOf = (test) => rules.filter(test).map((r) => r.selector);
  const vhTest = (r) => /(^|;)\s*(min-|max-)?height\s*:[^;]*\b\d*\.?\d+vh\b/i.test(r.decls) && !/\b\d*\.?\d+[dsl]vh\b/i.test(r.decls);
  const vh = selectorsOf(vhTest), vhProps = {};
  for (const r of rules.filter(vhTest)) for (const m of r.decls.matchAll(/(?:^|;)\s*((?:min-|max-)?height)\s*:[^;]*\b\d*\.?\d+vh\b/gi)) (vhProps[r.selector] ||= new Set()).add(m[1].toLowerCase());
  const hoverOnly = selectorsOf((r) => /:hover\s*[>~+ ]\s*[^,]/.test(r.selector) && /(^|;)\s*(display|visibility)\s*:/i.test(r.decls) && !r.media.some((m) => /hover\s*:\s*hover/i.test(m)));
  const insets = selectorsOf((r) => /(^|;)\s*(padding|margin)\s*:\s*[^;]*env\(safe-area-inset-(left|right)[^;]*/i.test(r.decls) && !/safe-area-inset-left[^;]*safe-area-inset-right|safe-area-inset-right[^;]*safe-area-inset-left/i.test(r.decls)
    || /(padding|margin)-right\s*:[^;]*safe-area-inset-left|(padding|margin)-left\s*:[^;]*safe-area-inset-right/i.test(r.decls));
  const topInset = selectorsOf((r) => /(^|;)\s*padding(-top)?\s*:[^;]*env\(safe-area-inset-top/i.test(r.decls) && /header|nav|top|bar/i.test(r.selector));
  const usesInsets = rules.some((r) => /safe-area-inset/.test(r.decls));
  const cover = /viewport-fit\s*=\s*cover/i.test(viewportMeta || '');
  // Elements in an endless animation (marquees, autoplaying tracks). A one-off entrance animation comes to rest
  // where the audit measures it, so it doesn't count.
  const animated = selectorsOf((r) => /(^|;)\s*animation(-iteration-count)?\s*:[^;]*\binfinite\b/i.test(r.decls) && !r.media.some((m) => /prefers-reduced-motion/i.test(m)));
  const uniq = (a) => [...new Set(a)];
  return { vh: uniq(vh), vhProps: Object.fromEntries(Object.entries(vhProps).map(([k, v]) => [k, [...v]])), hoverOnly: uniq(hoverOnly), insets: uniq(insets), topInset: uniq(topInset), animated: uniq(animated), coverWithoutInsets: cover && !usesInsets };
}
// Keeps the rules that are for something on this page; the rest of a site-wide stylesheet is other pages' business.
async function staticOnPage(page, cssTexts, viewportMeta) {
  const s = staticFindings(cssTexts, viewportMeta), elsewhere = {};
  for (const k of ['vh', 'hoverOnly', 'insets', 'topInset', 'animated']) {
    const hit = await page.evaluate(onPage, s[k].map(bareParts));
    elsewhere[k] = hit.filter((h) => !h).length;
    s[k] = s[k].filter((_, i) => hit[i]);
  }
  return { ...s, elsewhere };
}

// ——— comparing layouts (live resize, user agent, screen) ———
function diff(a, b) {
  const used = new Set(); let moved = 0, matched = 0; const movedEx = [];
  for (const i of a.items) {
    const j = b.items.findIndex((k, n) => !used.has(n) && k.key === i.key); if (j === -1) continue;
    used.add(j); matched++;
    const k = b.items[j]; if (Math.abs(k.x - i.x) > 12 || Math.abs(k.y - i.y) > 12 || Math.abs(k.w - i.w) > 12) { moved++; if (movedEx.length < 4) movedEx.push(clean(i.key, 40)); }
  }
  const missing = b.items.length - used.size, extra = a.items.length - matched;
  const dh = Math.abs(a.docH - b.docH) / Math.max(1, b.docH);
  const changed = missing + extra >= 3 || (moved >= 3 && moved >= 0.25 * Math.max(1, matched)) || dh > 0.15;
  return { changed, moved, missing, extra, dh: Math.round(dh * 100), examples: movedEx };
}

// ——— running it ———
const browserType = pw[engine];
const browser = await browserType.launch();
const version = browser.version();
const context = async (pose, extra = {}) => browser.newContext({
  viewport: { width: pose.viewport.width, height: pose.viewport.svh }, deviceScaleFactor: GEO.devicePixelRatio,
  isMobile: true, hasTouch: true, userAgent: UA.iphone, reducedMotion: 'reduce', acceptDownloads: false, ...extra,
});
async function open(ctx, url) {
  const page = await ctx.newPage();
  const res = await page.goto(url, { waitUntil: 'load', timeout: 45000 });
  try { await page.waitForLoadState('networkidle', { timeout: 8000 }); } catch {}
  await sleep(1200);
  return { page, status: res ? res.status() : 0 };
}
const scrollTop = (page, top) => page.evaluate((t) => scrollTo({ top: t, left: 0, behavior: 'instant' }), top);
async function walk(page, vh) {
  const h = await page.evaluate(() => document.scrollingElement.scrollHeight);
  for (let y = 0, n = 0; y < h && n < 40; y += Math.round(vh * 0.8), n++) { await scrollTop(page, y); await sleep(120); }
  await scrollTop(page, 0); await sleep(500);
}
async function controlsWithFrames(page, animated) {
  const main = await page.evaluate(probeFrame, { controlSel: CONTROL_SEL, animated });
  const out = main.controls.map((c) => ({ ...c, frame: '' }));
  for (const f of page.frames()) {
    if (f === page.mainFrame()) continue;
    try {
      const el = await f.frameElement(); const box = await el.boundingBox(); if (!box || box.width < 2) continue;
      const pin = await el.evaluate((n) => { for (let m = n; m && m !== document.documentElement; m = m.parentElement) { const p = getComputedStyle(m).position; if (p === 'fixed' || p === 'sticky') return p; } return ''; });
      const inner = await f.evaluate(probeFrame, { controlSel: CONTROL_SEL, animated: [] }); // the page's CSS isn't the frame's
      for (const c of inner.controls) out.push({ ...c, x: c.x + box.x, y: c.y + box.y, pageY: c.y + box.y + main.scrollY, pin: c.pin || pin, frame: clean(f.url(), 60) });
    } catch { /* a frame that went away or refuses to be read */ }
  }
  return out;
}
// A screenshot of the viewport, scrolled to show `focus` (page coordinates), with marks drawn on top.
// JPEG at CSS pixels keeps a report of dozens of shots light enough to open anywhere.
async function snap(page, name, { focus, marks = [], lines = [] } = {}) {
  const vh = await page.evaluate(() => innerHeight);
  await scrollTop(page, focus ? Math.max(0, Math.round(focus.y + Math.min(focus.h, vh * 0.8) / 2 - vh / 2)) : 0); await sleep(250);
  await page.evaluate(drawMarks, { marks, lines });
  const rel = `shots/${name}.jpg`;
  await page.screenshot({ path: path.join(outDir, rel), type: 'jpeg', quality: 82, scale: 'css' });
  await page.evaluate(() => document.getElementById('__duo')?.remove());
  return rel;
}

const report = [];
for (const url of urls) {
  const entry = { url, poses: [], findings: [], failed: '' };
  report.push(entry);
  const add = (sev, id, title, pose, detail) => entry.findings.push({ sev, id, title, pose, detail });
  const base = slug(url), shotted = new Set(), now = {};
  // One picture per thing: the same element cut off at two sizes is shown once.
  const once = async (key, fn) => { if (!withShots || shotted.has(key)) return null; shotted.add(key); return fn(); };
  // Read on "Closed", the first pose in poses.json, so the animated selectors are known before "Open".
  let stat = null, animated = [];
  for (const pose of POSES) {
    const ctx = await context(pose);
    const row = { id: pose.id, label: pose.label, w: pose.viewport.width, h: pose.viewport.svh };
    try {
      const { page, status } = await open(ctx, url);
      if (status >= 400) throw new Error(`HTTP ${status}`);
      await walk(page, pose.viewport.svh);
      const p = await page.evaluate(probePage, { crease: pose.crease, controlSel: CONTROL_SEL });
      const controls = await controlsWithFrames(page, animated);
      // Which of the page's identical controls this is (a GitHub link in the hero and another in the footer), to find it again.
      const seen = new Map();
      for (const c of controls) { if (c.frame) continue; const k = `${c.sel}|${c.text}`; c.nth = seen.get(k) || 0; seen.set(k, c.nth + 1); }
      const wide = p.scrollWidth > p.vw + 1;
      row.sideways = wide && !p.rootClips; row.cutoff = wide && p.rootClips; row.share = Math.round(p.share * 100);
      if (wide) {
        const id = row.sideways ? 'sideways' : 'cutoff', offenders = [];
        for (const o of p.offenders) {
          const past = o.right - p.vw;
          const shot = await once(keyOf(id, o.sel), () => snap(page, `${base}-${pose.id}-${id}-${offenders.length + 1}`, { focus: o,
            marks: [{ x: o.x, y: o.y, w: Math.min(o.w, p.vw - o.x), h: o.h }, { x: p.vw - 8, y: o.y, w: 8, h: o.h, color: '#ff3b30', fill: '#ff3b30', label: `${past}px ${row.sideways ? 'past the edge' : 'cut off'}` }] }));
          offenders.push({ sel: clean(o.sel), right: o.right, width: o.width, shot });
        }
        if (row.sideways) add('fix', 'sideways', 'Scrolls sideways', pose, { width: p.scrollWidth, offenders });
        else if (offenders.length) add('check', 'cutoff', "Cut off at the edge (the page clips sideways, so it doesn't scroll)", pose, { width: p.scrollWidth, offenders });
      }
      if (pose.crease && pose.crease.axis === 'vertical' && pose.id !== 'split-view') {
        const X = pose.crease.viewportPos;
        const hits = controls.filter((c) => c.w < NARROW && !c.inText && c.x < X - 2 && c.x + c.w > X + 2);
        const still = hits.filter((h) => !h.moving), moving = hits.filter((h) => h.moving);
        row.creaseHits = still.length; row.creaseMoving = moving.length;
        const list = async (id, a) => {
          const out = [];
          for (const [i, h] of a.slice(0, 25).entries()) {
            const fixed = h.pin === 'fixed';
            const shot = i < SHOTS_PER_CHECK ? await once(keyOf(id, h.sel, h.text), () => snap(page, `${base}-${pose.id}-${id}-${i + 1}`, { focus: { y: h.pageY, h: h.h },
              marks: [{ x: h.x, y: fixed ? h.y : h.pageY, fixed, w: h.w, h: h.h }], lines: [{ x: X }] })) : null;
            out.push({ sel: clean(h.sel), text: clean(h.text, 50), from: Math.round(h.x), to: Math.round(h.x + h.w), pageY: Math.round(h.pageY), frame: h.frame, nth: h.nth || 0, shot });
          }
          return out;
        };
        if (still.length) add('fix', 'crease', 'Controls on the crease', pose, { x: X, hits: await list('crease', still) });
        if (moving.length) add('check', 'crease-moving', 'Moving controls on the crease, measured where reduced motion stops them', pose, { x: X, hits: await list('crease-moving', moving) });
        if (p.gridsOnCrease.length) {
          const grids = [];
          for (const [i, g] of p.gridsOnCrease.entries()) {
            const shot = await once(keyOf('grid', g.sel), () => snap(page, `${base}-${pose.id}-grid-${i + 1}`, { focus: g, lines: [{ x: X }],
              marks: g.cols.map((c, n) => ({ x: c.x, y: g.y, w: c.w, h: g.h, color: n === g.onTrack ? '#ff3b30' : '#0a84ff', fill: n === g.onTrack ? 'rgba(255,59,48,.12)' : 'transparent', label: n === g.onTrack ? 'on the crease' : '' })) }));
            grids.push({ sel: clean(g.sel), columns: g.columns, shot });
          }
          add('check', 'grid', 'Grid with a column on the crease', pose, { grids });
        }
      }
      if (pose.crease && pose.crease.axis === 'horizontal') {
        const Y = pose.crease.viewportPos;
        const hits = controls.filter((c) => c.pin && c.h < 120 && c.y < Y - 2 && c.y + c.h > Y + 2);
        if (hits.length) {
          const out = [];
          for (const [i, h] of hits.slice(0, 10).entries()) {
            const shot = await once(keyOf('crease-h', h.sel, h.text), () => snap(page, `${base}-${pose.id}-crease-h-${i + 1}`, { marks: [{ x: h.x, y: h.y, w: h.w, h: h.h, fixed: true }], lines: [{ y: Y, fixed: true }] }));
            out.push({ sel: clean(h.sel), text: clean(h.text, 50), nth: h.nth || 0, shot });
          }
          add('check', 'crease-h', 'Fixed controls on the crease (open, tall; its height is estimated)', pose, { y: Y, hits: out });
        }
      }
      const short = pose.viewport.svh < 400;
      const barMarks = p.bars.map((b) => ({ x: b.x, y: b.y, w: b.w, h: b.h, fixed: true, fill: 'rgba(10,132,255,.2)', label: `${b.h}px` }));
      if (p.share >= (short ? 0.4 : 0.5)) {
        const shot = await once(keyOf('bars', pose.id), () => snap(page, `${base}-${pose.id}-bars`, { marks: barMarks }));
        add(short ? 'fix' : 'check', 'bars', 'Fixed bars take too much of the screen', pose, { share: row.share, bars: p.bars.map((b) => ({ ...b, sel: clean(b.sel) })), shot });
      }
      if (p.covered.length) {
        const shot = await once(keyOf('covered', pose.id), () => snap(page, `${base}-${pose.id}-covered`, { marks: [...barMarks.map((m) => ({ ...m, label: '' })), ...p.covered.map((c) => ({ ...c, fixed: true, color: '#ff3b30' }))] }));
        add('fix', 'covered', 'Fixed bars cover controls', pose, { covered: p.covered.map((c) => ({ sel: clean(c.sel), text: clean(c.text, 50), by: clean(c.by) })), shot });
      }
      for (const o of p.overlays) {
        const shot = await once(keyOf('overlay', o.sel), () => snap(page, `${base}-${pose.id}-overlay`, { marks: [{ ...o, fixed: true }] }));
        add('check', 'overlay', 'A full-screen overlay is open on load', pose, { overlays: [clean(o.sel)], sel: clean(o.sel), shot });
      }
      if (pose.id === 'closed-portrait') {
        const far = p.edge.filter((e) => e && e !== 'image' && Math.hypot(e[0] - p.pageBg[0], e[1] - p.pageBg[1], e[2] - p.pageBg[2]) > 60);
        if (far.length >= 2) {
          const shot = await once('background', () => snap(page, `${base}-${pose.id}-background`, { marks: p.edgeAt.map((y, i) => ({ x: p.vw - 18, y: y - 8, w: 16, h: 16, fixed: true, label: String(i + 1) })) }));
          add('check', 'background', "Page background doesn't match the page at the edge", pose, { pageBg: p.pageBg, edge: p.edge, shot });
        }
        const cssTexts = await page.evaluate(() => [...document.querySelectorAll('style')].map((s) => s.textContent || ''));
        const hrefs = await page.evaluate(() => [...document.querySelectorAll('link[rel~="stylesheet"][href]')].map((l) => l.href));
        let total = cssTexts.reduce((s, t) => s + t.length, 0);
        const sheets = await Promise.allSettled(hrefs.slice(0, 30).map(async (h) => { const r = await ctx.request.get(h, { timeout: 15000 }); return r.ok() ? r.text() : ''; }));
        for (const sh of sheets) { if (total > 4e6) break; if (sh.status === 'fulfilled' && sh.value) { cssTexts.push(sh.value); total += sh.value.length; } }
        stat = await staticOnPage(page, cssTexts, p.viewportMeta);
        animated = stat.animated.map(bareParts).flat();
      }
      if (stat && stat.vh.length) row.vhSets = await page.evaluate(vhSets, { list: stat.vh.map((s) => ({ parts: bareParts(s), props: stat.vhProps[s] || ['height'] })), slack: pose.viewport.lvh - pose.viewport.svh });
      // After pictures: each earlier item measured at this pose, found again and outlined in green. Kept only if it's fixed.
      const earlier = withShots ? (prev?.report.find((x) => x.url === url)?.items || []).filter((i) => i.find && i.poses[0]?.id === pose.id) : [];
      for (const [n, it] of earlier.entries()) {
        const box = await page.evaluate(locate, it.find); if (!box) continue;
        const lines = ['crease', 'crease-moving', 'grid'].includes(it.check) && pose.crease?.axis === 'vertical' ? [{ x: pose.crease.viewportPos }]
          : it.check === 'crease-h' && pose.crease ? [{ y: pose.crease.viewportPos, fixed: true }] : [];
        now[it.key] = await snap(page, `${base}-${pose.id}-after-${n + 1}`, { focus: box, lines, marks: [{ ...box, w: Math.min(box.w, pose.viewport.width - box.x), color: '#18794e' }] });
      }
      row.shot = await snap(page, `${base}-${pose.id}`);
    } catch (e) {
      row.failed = clean(e && e.message, 80);
      entry.failed = entry.failed || row.failed;
    } finally { await ctx.close(); }
    entry.poses.push(row);
    process.stdout.write(`${row.failed ? '✗' : '·'} ${url} ${pose.id}${row.failed ? ` not checked: ${row.failed}` : ''}\n`);
  }
  if (entry.failed) continue;

  // Static checks on the CSS: only rules for something on this page.
  const s = stat, css = (k) => ({ selectors: s[k].slice(0, 8).map((x) => cleanSel(x, 70)), elsewhere: s.elsewhere[k] });
  if (s.vh.length) {
    const d = css('vh');
    // Where each rule sets the height, so a min-height its content always outgrows can be left alone.
    d.sets = s.vh.slice(0, 8).map((_, i) => entry.poses.filter((r) => r.vhSets && r.vhSets[i]).map((r) => r.label));
    add('check', 'vh', 'Heights in vh', null, d);
  }
  if (s.hoverOnly.length) add('check', 'hover', 'Content revealed on hover only', null, css('hoverOnly'));
  if (s.insets.length) add('check', 'insets', 'Safe-area insets applied to both sides from one edge', null, css('insets'));
  if (s.topInset.length) add('check', 'top-inset', 'Fixed header padded by safe-area-inset-top', null, css('topInset'));
  if (s.coverWithoutInsets) add('check', 'cover', 'viewport-fit=cover with no safe-area insets', null, {});

  // Behaviour: compare against fresh loads at the open size. Two fresh loads first: if they already
  // differ, the page changes on its own and these comparisons can only be "to check".
  const open951 = POSES.find((q) => q.id === 'open-landscape'), closed = POSES.find((q) => q.id === 'closed-portrait');
  const sigAt = async (pose, extra, steps) => {
    const ctx = await context(pose, extra);
    try {
      const { page } = await open(ctx, url); if (steps) await steps(page);
      await scrollTop(page, 0); await sleep(300);
      return { ...(await page.evaluate(signature)), img: withShots ? await page.screenshot({ type: 'jpeg', quality: 82, scale: 'css' }) : null };
    } finally { await ctx.close(); }
  };
  // Side-by-side pictures for a comparison that failed: the fresh load and the one that differs.
  const pair = (name, a, aLabel, b, bLabel) => {
    if (!a.img || !b.img) return [];
    return [[a, aLabel, 'fresh'], [b, bLabel, name]].map(([x, label, n]) => { const rel = `shots/${base}-${n}.jpg`; fs.writeFileSync(path.join(outDir, rel), x.img); return { label, src: rel }; });
  };
  try {
    const screenOpen = { screen: open951.screen };
    const fresh = await sigAt(open951, screenOpen), fresh2 = await sigAt(open951, screenOpen);
    const noise = diff(fresh2, fresh).changed;
    const sev = noise ? 'check' : 'fix';
    const t = GEO.transientResize;
    const live = await sigAt(closed, {}, async (page) => {
      await page.setViewportSize({ width: t.width, height: t.height }); await sleep(t.settleMs + 10);
      await page.setViewportSize({ width: open951.viewport.width, height: open951.viewport.svh }); await sleep(1500);
    });
    const d1 = diff(live, fresh);
    if (d1.changed) add(sev, 'resize', 'Layout after opening differs from a fresh load at the open size', open951, { ...d1, noisy: noise, shots: pair('opened', fresh, 'Fresh load at Open', live, 'Loaded closed, then opened') });
    const macSig = await sigAt(open951, { ...screenOpen, userAgent: UA.mac, isMobile: false }), mac = diff(macSig, fresh);
    if (mac.changed) add('check', 'ua', 'Layout differs between the iPhone and Mac user agents at the same size', open951, { ...mac, noisy: noise, shots: pair('mac-ua', fresh, 'iPhone user agent', macSig, 'Mac user agent') });
    const staleSig = await sigAt(open951, { screen: closed.screen }), stale = diff(staleSig, fresh);
    if (stale.changed) add(sev, 'screen', 'Layout depends on screen.width, which stays at the closed size after opening', open951, { ...stale, noisy: noise, shots: pair('stale-screen', fresh, 'screen.width at the open size', staleSig, 'screen.width at the closed size') });
    entry.noisy = noise;
  } catch (e) { add('check', 'behaviour', 'Behaviour checks did not complete', null, { error: clean(e && e.message, 80) }); }
  entry.elsewhere = s.elsewhere;
  entry.items = itemsOf(entry);
  const keys = new Set(entry.items.map((i) => i.key));
  entry.fixedShots = {};
  for (const [k, rel] of Object.entries(now)) { if (keys.has(k)) fs.rmSync(path.join(outDir, rel), { force: true }); else entry.fixedShots[k] = rel; }
}
await browser.close();

// ——— items: one per thing to decide on, merged across poses, with a key that survives re-runs ———
function itemsOf(entry) {
  const items = new Map();
  const put = (key, f, it) => {
    const pose = f.pose ? { id: f.pose.id, label: f.pose.label } : null;
    const was = items.get(key);
    if (was) { if (pose && !was.poses.some((p) => p.id === pose.id)) was.poses.push(pose); if (it.lines) was.lines.push(...it.lines.map((l) => (pose ? `${pose.label}: ${l}` : l))); was.shot ||= it.shot || null; return; }
    items.set(key, { key, check: f.id, sev: f.sev, title: f.title, poses: pose ? [pose] : [], subject: it.subject || '', lines: it.lines || [], shot: it.shot || null, shots: it.shots || [], swatches: it.swatches || null, find: it.find || null });
  };
  const at = (f) => (f.pose ? `${f.pose.viewport.width} wide` : '');
  for (const f of entry.findings) {
    const d = f.detail;
    if (d.offenders) for (const o of d.offenders) put(keyOf(f.id, o.sel), f, { find: { sel: o.sel }, subject: `\`${o.sel}\``, lines: [`reaches x = ${o.right}, ${o.right - f.pose.viewport.width}px past the ${at(f)} edge (${o.width}px wide)`], shot: o.shot });
    else if (d.hits) for (const h of d.hits) put(keyOf(f.id, h.sel, h.text), f, { find: { sel: h.sel, text: h.text, nth: h.nth || 0 }, subject: `\`${h.sel}\`${h.text ? ` "${h.text}"` : ''}`, shot: h.shot,
      lines: [h.from != null ? `${h.to - h.from}px wide, spans x ${h.from}–${h.to}; the crease is at x = ${d.x}` : `crosses the line at y ≈ ${d.y}`, ...(h.frame ? [`inside a frame: ${h.frame}`] : [])] });
    else if (d.grids) for (const g of d.grids) put(keyOf('grid', g.sel), f, { find: { sel: g.sel }, subject: `\`${g.sel}\``, lines: [`${g.columns} equal columns; the middle one sits on the crease`], shot: g.shot });
    else if (f.id === 'bars') put(keyOf('bars', f.pose.id), f, { shot: d.shot, lines: [`${d.share}% of the ${f.pose.viewport.svh}px height`, ...d.bars.map((b) => `\`${b.sel}\` ${b.h}px tall at y ${b.y}`)] });
    else if (f.id === 'covered') put(keyOf('covered', f.pose.id), f, { shot: d.shot, lines: d.covered.map((c) => `\`${c.sel}\`${c.text ? ` "${c.text}"` : ''} under \`${c.by}\``) });
    else if (f.id === 'overlay') put(keyOf('overlay', d.sel), f, { subject: `\`${d.sel}\``, shot: d.shot, lines: ['covers more than 85% of the screen at load'] });
    else if (f.id === 'background') put('background', f, { shot: d.shot, swatches: { page: d.pageBg, edge: d.edge },
      lines: [`page background rgb(${d.pageBg.join(', ')}); at the right edge: ${d.edge.map((e) => (e === 'image' ? 'an image' : e ? `rgb(${e.join(', ')})` : '–')).join(', ')}`] });
    else if (d.selectors) d.selectors.forEach((x, i) => put(keyOf(f.id, x), f, { subject: `\`${x}\``,
      lines: f.id === 'vh' ? [d.sets[i].length ? `sets the element's height at: ${d.sets[i].join(', ')}` : "doesn't set the height at any of the five sizes: the content is taller"] : [] }));
    else if (d.moved != null) put(f.id, f, { shots: d.shots,
      lines: [`${d.moved} ${d.moved === 1 ? 'control' : 'controls'} moved, ${d.missing} missing, ${d.extra} extra; page height differs by ${d.dh}%`, ...(d.examples.length ? [`e.g. ${d.examples.map((x) => `\`${x}\``).join(', ')}`] : []), ...(d.noisy ? ['the page also changes between two fresh loads, so judge this by eye'] : [])] });
    else put(f.id, f, { lines: d.error ? [d.error] : [] });
  }
  return [...items.values()];
}

// ——— the report: markdown and JSON for agents, HTML for people ———
// The report can be written anywhere, so link to the skill's FIXES.md from where the report lands
// (absolute when the two share little more than the root).
const fixesAbs = path.join(HERE, 'FIXES.md'), fixesRel = path.relative(outDir, fixesAbs);
const FIXES = (fixesRel.length < fixesAbs.length ? fixesRel : fixesAbs).split(path.sep).join('/');
const F = { sideways: 'sideways-scroll', cutoff: 'sideways-scroll', crease: 'controls-on-the-crease', 'crease-moving': 'controls-on-the-crease', 'crease-h': 'controls-on-the-crease', grid: 'grids-across-the-crease', bars: 'fixed-bars-on-a-short-screen', covered: 'fixed-bars-on-a-short-screen', overlay: 'fixed-bars-on-a-short-screen',
  background: 'background-colour', vh: 'heights-in-vh', hover: 'hover-only-menus', insets: 'safe-areas', 'top-inset': 'safe-areas', cover: 'safe-areas', resize: 'sizes-read-once', screen: 'sizes-read-once', ua: 'user-agent-branching', behaviour: 'sizes-read-once' };
const fmt = (f) => {
  const where = f.pose ? ` (${f.pose.label}, ${f.pose.viewport.width} × ${f.pose.viewport.svh})` : '';
  const d = f.detail, lines = [`- **${f.title}**${where}. Fix: [FIXES.md](${FIXES}#${F[f.id]})`];
  if (d.offenders) d.offenders.forEach((o) => lines.push(`  - \`${o.sel}\` reaches x = ${o.right} (${o.width}px wide)`));
  if (d.hits) d.hits.forEach((h) => lines.push(`  - \`${h.sel}\` ${h.text ? `"${h.text}" ` : ''}${h.from != null ? `spans x ${h.from}–${h.to}, page y ${h.pageY}` : ''}${h.frame ? ` (in a frame: ${h.frame})` : ''}`));
  if (d.grids) d.grids.forEach((g) => lines.push(`  - \`${g.sel}\`, ${g.columns} columns`));
  if (d.bars) { lines.push(`  - ${d.share}% of the height:`); d.bars.forEach((b) => lines.push(`    - \`${b.sel}\` ${b.h}px tall at y ${b.y}`)); }
  if (d.covered) d.covered.forEach((c) => lines.push(`  - \`${c.sel}\` ${c.text ? `"${c.text}" ` : ''}under \`${c.by}\``));
  if (d.overlays) d.overlays.forEach((o) => lines.push(`  - \`${o}\``));
  if (d.selectors) d.selectors.forEach((x, i) => lines.push(`  - \`${x}\`${d.sets ? (d.sets[i].length ? `: sets the height at ${d.sets[i].join(', ')}` : ": doesn't set the height at any pose") : ''}`));
  if (d.elsewhere) lines.push(`  - and ${d.elsewhere} more in the stylesheet for elements not on this page (not counted)`);
  if (d.pageBg) lines.push(`  - page background rgb(${d.pageBg.join(', ')}); at the right edge: ${d.edge.map((e) => (e === 'image' ? 'an image' : e ? `rgb(${e.join(', ')})` : '–')).join(', ')}`);
  if (d.moved != null) lines.push(`  - ${d.moved} controls moved, ${d.missing} missing, ${d.extra} extra; page height differs by ${d.dh}%${d.examples.length ? `; e.g. ${d.examples.map((x) => `\`${x}\``).join(', ')}` : ''}${d.noisy ? '. The page also changes between two fresh loads, so judge this by eye' : ''}`);
  if (d.error) lines.push(`  - ${d.error}`);
  return lines.join('\n');
};
const today = new Date().toISOString().slice(0, 10);
// A to-fix item the owner agreed to leave (level "leave" in the triage, here or carried over from --before) doesn't fail
// the run. The report still shows it.
const triage = [path.join(outDir, 'duo-triage.json'), before && path.join(path.resolve(before), 'duo-triage.json')].filter(Boolean)
  .map((f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } }).find(Boolean) || {};
const fixItems = report.flatMap((e) => (e.items || []).filter((it) => it.sev === 'fix').map((it) => triage.pages?.[e.url]?.[it.key]?.level));
const leftFix = fixItems.filter((lvl) => lvl === 'leave').length, totalFix = fixItems.length - leftFix;
const intro = `Ran ${today} in Playwright ${engine === 'webkit' ? 'WebKit' : 'Chromium'} ${clean(version, 20)} at the viewports WebKit published for Safari 27.1 (\`poses.json\`, collected ${GEO.collected}). This is emulation: the right engine family and sizes, not Safari 27.1 itself. Confirm in Safari before calling it done (\`duo-simulator.sh\`, or a device). Pages are measured with reduced motion on, so animations are stopped where the page's reduced-motion styles leave them.`;
const md = [`# iPhone Duo audit`, '', intro, '', 'The visual report is `duo-report.html`. Triage: one entry per item key below in `duo-triage.json` (SKILL.md, step 3).', ''];
// Crease hits are counted only on "Open" (the vertical crease); elsewhere the column shows "–".
const creaseCell = (r) => {
  if (r.creaseHits == null) return '–';
  const moving = r.creaseMoving ? ` (+${r.creaseMoving} moving)` : '';
  return (r.creaseHits ? `**${r.creaseHits}**` : '0') + moving;
};
const sidewaysCell = (r) => {
  if (r.failed) return `not checked: ${r.failed}`;
  if (r.cutoff) return 'no (clipped at the edge)';
  return r.sideways ? '**yes**' : 'no';
};
for (const e of report) {
  md.push(`## ${clean(e.url, 120)}`, '');
  if (e.failed) { md.push(`**Not checked: ${e.failed}. This is not a pass.**`, ''); continue; }
  md.push('| Pose | Viewport | Sideways scroll | Controls on the crease | Fixed bars |', '|---|---|---|---|---|');
  for (const r of e.poses) md.push(`| ${r.label} | ${r.w} × ${r.h} | ${sidewaysCell(r)} | ${creaseCell(r)} | ${r.share ?? '–'}% |`);
  const fix = e.findings.filter((f) => f.sev === 'fix'), chk = e.findings.filter((f) => f.sev === 'check');
  md.push('', `### To fix (${fix.length})`, '', fix.length ? fix.map(fmt).join('\n') : 'Nothing.', '', `### To check (${chk.length})`, '', chk.length ? chk.map(fmt).join('\n') : 'Nothing.', '');
  md.push(`### Items to triage (${e.items.length})`, '', ...(e.items.length ? e.items.map((it) => `- \`${it.key}\`: ${it.title}${it.subject ? `, ${it.subject}` : ''}`) : ['Nothing.']), '');
}
fs.writeFileSync(path.join(outDir, 'duo-report.md'), md.join('\n'));
fs.writeFileSync(path.join(outDir, 'duo-report.json'), JSON.stringify({ ran: today, engine, version, poses: GEO.collected, intro,
  report: report.map((e) => ({ ...e, findings: e.findings.map((f) => ({ ...f, pose: f.pose ? f.pose.id : null })) })) }, null, 2));
const html = render(outDir, { before });
console.log(`\n${totalFix ? `${totalFix} to fix.` : 'Nothing to fix.'}${leftFix ? ` ${leftFix} more marked Leave in the triage.` : ''} Report: ${html}\nFor agents: ${path.join(outDir, 'duo-report.md')}, duo-report.json`);
process.exit(totalFix || report.some((e) => e.failed) ? 1 : 0);
