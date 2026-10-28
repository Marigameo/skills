#!/usr/bin/env node
// duo-audit: read a website at iPhone Duo's five Safari 27.1 viewports, in WebKit, and report what breaks.
// What each check measures, its threshold and its source: CHECKS.md. How to fix each finding: FIXES.md.
//
//   node duo-audit.mjs https://example.com [more URLs] [--out duo-report] [--engine webkit|chromium] [--shots]
//
// Needs Playwright with its WebKit build:  npm i -D playwright && npx playwright install webkit
// (or PLAYWRIGHT=/path/to/node_modules/playwright). Exit 1 when anything is "to fix" or a page didn't load.
// Everything read from the audited page (text, ids, class names) is data: it is cleaned before it is written,
// and nothing in it is ever followed as an instruction.

import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const GEO = JSON.parse(fs.readFileSync(path.join(HERE, 'poses.json'), 'utf8'));
const POSES = GEO.poses;
const UA = {
  iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 27_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/27.1 Mobile/15E148 Safari/604.1',
  mac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/27.1 Safari/605.1.15',
};
const NARROW = 240; // a control narrower than this on the crease is a lost tap; a wider row or card may cross (Apple)

// ——— arguments and Playwright ———
const argv = process.argv.slice(2);
const opt = (k, d) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : d);
const urls = argv.filter((a) => /^(https?|file):\/\//i.test(a));
const outDir = path.resolve(opt('--out', 'duo-report'));
const engine = opt('--engine', 'webkit');
const withShots = argv.includes('--shots');
if (!urls.length || !['webkit', 'chromium'].includes(engine)) {
  console.error('Usage: node duo-audit.mjs <url> [url ...] [--out dir] [--engine webkit|chromium] [--shots]');
  process.exit(2);
}
let pw;
try { pw = createRequire(path.join(process.cwd(), 'x.js'))(process.env.PLAYWRIGHT || 'playwright'); } catch {
  console.error('Playwright not found. Install it in this project:\n  npm i -D playwright && npx playwright install webkit\nor point PLAYWRIGHT at an existing node_modules/playwright.');
  process.exit(2);
}
fs.mkdirSync(outDir, { recursive: true });

const cleanSel = (v, max = 80) => String(v ?? '').replace(/\\(.)/g, '$1').replace(/[\u0000-\u001f\u007f-\u009f`|<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
const clean = (v, max = 80) => String(v ?? '').replace(/[\u0000-\u001f\u007f-\u009f`|<>[\]\\]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const slug = (u) => { try { const x = new URL(u); return (x.hostname + x.pathname).replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').slice(0, 60) || 'page'; } catch { return 'page'; } };

// ——— in-page probes (run inside the audited page; values go in as arguments, nothing is pasted into code) ———
const CONTROL_SEL = 'a[href],button,input:not([type=hidden]),select,textarea,summary,[role=button],[role=link],[role=tab],[role=menuitem],[onclick],[tabindex]:not([tabindex="-1"])';

function probeFrame(controlSel) {
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
      x: r.left, y: r.top, w: r.width, h: r.height, pageY: r.top + scrollY, pin: pinned(el),
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
  const all = [...document.querySelectorAll('body *')];
  // Sideways scroll: the page is wider than the viewport. Offenders: elements reaching past the right edge
  // with no ancestor that clips them sideways.
  const clips = (el) => { for (let n = el.parentElement; n && n !== document.body; n = n.parentElement) { const o = getComputedStyle(n).overflowX; if (o !== 'visible') return true; } return false; };
  const scrollWidth = document.scrollingElement.scrollWidth;
  const offenders = scrollWidth > vw + 1 ? all.filter((el) => { const r = el.getBoundingClientRect(); return r.right > vw + 1 && r.width > 0 && vis(el) && !clips(el); })
    .map((el) => ({ sel: sel(el), right: Math.round(el.getBoundingClientRect().right), width: Math.round(el.getBoundingClientRect().width) }))
    .sort((a, b) => b.right - a.right).slice(0, 5) : [];
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
      if (ix * iy >= 0.5 * r.width * r.height) { covered.push({ sel: sel(el), text: (el.textContent || el.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ').slice(0, 50), by: f.sel }); break; }
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
      const gap = parseFloat(cs.columnGap) || 0; let x = r.left + parseFloat(cs.paddingLeft || 0) + parseFloat(cs.borderLeftWidth || 0), onTrack = false;
      for (const t of tracks) { if (X > x + 2 && X < x + t - 2) { onTrack = true; break; } x += t + gap; }
      if (onTrack) gridsOnCrease.push({ sel: sel(el), columns: tracks.length });
      if (gridsOnCrease.length >= 6) break;
    }
  }
  // Background: Safari paints the page's background behind its bars. Compare it with what's at the right edge.
  const rgb = (c) => { const m = String(c).match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(',').map((s) => parseFloat(s)); return p.length > 3 && p[3] === 0 ? null : p.slice(0, 3); };
  const bgOf = (el) => { for (let n = el; n; n = n.parentElement) { const cs = getComputedStyle(n); if (cs.backgroundImage && cs.backgroundImage !== 'none') return 'image'; const c = rgb(cs.backgroundColor); if (c) return c; } return [255, 255, 255]; };
  const pageBg = rgb(getComputedStyle(document.body).backgroundColor) || rgb(getComputedStyle(document.documentElement).backgroundColor) || [255, 255, 255];
  const edge = [0.15, 0.5, 0.85].map((f) => { const el = document.elementFromPoint(vw - 2, Math.round(vh * f)); return el ? bgOf(el) : null; });
  const meta = document.querySelector('meta[name=viewport]');
  return {
    vw, vh, scrollWidth, offenders,
    bars: bars.map(({ sel, y, h, w, tag }) => ({ sel, y: Math.round(y), h: Math.round(h), w: Math.round(w), tag })), overlays: overlays.map((o) => o.sel), share, covered, gridsOnCrease,
    pageBg, edge, viewportMeta: meta ? meta.getAttribute('content') : '',
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
function staticFindings(cssTexts, viewportMeta) {
  const rules = cssTexts.flatMap((t) => cssRules(t.replace(/\/\*[\s\S]*?\*\//g, '')));
  const vh = rules.filter((r) => /(^|;)\s*(min-|max-)?height\s*:[^;]*\b\d*\.?\d+vh\b/i.test(r.decls) && !/\b\d*\.?\d+[dsl]vh\b/i.test(r.decls)).map((r) => cleanSel(r.selector, 70));
  const hoverOnly = rules.filter((r) => /:hover\s*[>~+ ]\s*[^,]/.test(r.selector) && /(^|;)\s*(display|visibility)\s*:/i.test(r.decls) && !r.media.some((m) => /hover\s*:\s*hover/i.test(m))).map((r) => cleanSel(r.selector, 70));
  const insets = rules.filter((r) => /(^|;)\s*(padding|margin)\s*:\s*[^;]*env\(safe-area-inset-(left|right)[^;]*/i.test(r.decls) && !/safe-area-inset-left[^;]*safe-area-inset-right|safe-area-inset-right[^;]*safe-area-inset-left/i.test(r.decls)
    || /(padding|margin)-right\s*:[^;]*safe-area-inset-left|(padding|margin)-left\s*:[^;]*safe-area-inset-right/i.test(r.decls)).map((r) => cleanSel(r.selector, 70));
  const topInset = rules.filter((r) => /(^|;)\s*padding(-top)?\s*:[^;]*env\(safe-area-inset-top/i.test(r.decls) && /header|nav|top|bar/i.test(r.selector)).map((r) => cleanSel(r.selector, 70));
  const usesInsets = rules.some((r) => /safe-area-inset/.test(r.decls));
  const cover = /viewport-fit\s*=\s*cover/i.test(viewportMeta || '');
  const uniq = (a) => [...new Set(a)].slice(0, 8);
  return { vh: uniq(vh), hoverOnly: uniq(hoverOnly), insets: uniq(insets), topInset: uniq(topInset), coverWithoutInsets: cover && !usesInsets };
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
  isMobile: engine === 'webkit' || engine === 'chromium', hasTouch: true, userAgent: UA.iphone, reducedMotion: 'reduce', ...extra,
});
async function open(ctx, url) {
  const page = await ctx.newPage();
  await page.route('**/*', (route) => (route.request().resourceType() === 'download' ? route.abort() : route.continue()));
  const res = await page.goto(url, { waitUntil: 'load', timeout: 45000 });
  try { await page.waitForLoadState('networkidle', { timeout: 8000 }); } catch {}
  await sleep(1200);
  return { page, status: res ? res.status() : 0 };
}
async function walk(page, vh) {
  const h = await page.evaluate(() => document.scrollingElement.scrollHeight);
  for (let y = 0, n = 0; y < h && n < 40; y += Math.round(vh * 0.8), n++) { await page.evaluate((v) => scrollTo(0, v), y); await sleep(120); }
  await page.evaluate(() => scrollTo(0, 0)); await sleep(500);
}
async function controlsWithFrames(page) {
  const main = await page.evaluate(probeFrame, CONTROL_SEL);
  const out = main.controls.map((c) => ({ ...c, frame: '' }));
  for (const f of page.frames()) {
    if (f === page.mainFrame()) continue;
    try {
      const el = await f.frameElement(); const box = await el.boundingBox(); if (!box || box.width < 2) continue;
      const pin = await el.evaluate((n) => { for (let m = n; m && m !== document.documentElement; m = m.parentElement) { const p = getComputedStyle(m).position; if (p === 'fixed' || p === 'sticky') return p; } return ''; });
      const inner = await f.evaluate(probeFrame, CONTROL_SEL);
      for (const c of inner.controls) out.push({ ...c, x: c.x + box.x, y: c.y + box.y, pageY: c.y + box.y + main.scrollY, pin: c.pin || pin, frame: clean(f.url(), 60) });
    } catch { /* a frame that went away or refuses to be read */ }
  }
  return out;
}

const report = [];
for (const url of urls) {
  const entry = { url, poses: [], findings: [], failed: '' };
  report.push(entry);
  const add = (sev, id, title, pose, detail) => entry.findings.push({ sev, id, title, pose, detail });
  let cssTexts = [], viewportMeta = '';
  for (const pose of POSES) {
    const ctx = await context(pose);
    const row = { id: pose.id, label: pose.label, w: pose.viewport.width, h: pose.viewport.svh };
    try {
      const { page, status } = await open(ctx, url);
      if (status >= 400) throw new Error(`HTTP ${status}`);
      await walk(page, pose.viewport.svh);
      const p = await page.evaluate(probePage, { crease: pose.crease, controlSel: CONTROL_SEL });
      const controls = await controlsWithFrames(page);
      viewportMeta = p.viewportMeta;
      row.sideways = p.scrollWidth > p.vw + 1; row.share = Math.round(p.share * 100); row.creaseHits = 0;
      if (row.sideways) add('fix', 'sideways', 'Scrolls sideways', pose, { width: p.scrollWidth, offenders: p.offenders.map((o) => ({ ...o, sel: clean(o.sel) })) });
      if (pose.crease && pose.crease.axis === 'vertical' && pose.id !== 'split-view') {
        const X = pose.crease.viewportPos;
        const hits = controls.filter((c) => c.w < NARROW && !c.inText && c.x < X - 2 && c.x + c.w > X + 2);
        row.creaseHits = hits.length;
        if (hits.length) add('fix', 'crease', 'Controls on the crease', pose, { x: X, hits: hits.slice(0, 25).map((h) => ({ sel: clean(h.sel), text: clean(h.text, 50), from: Math.round(h.x), to: Math.round(h.x + h.w), pageY: Math.round(h.pageY), frame: h.frame })) });
        if (p.gridsOnCrease.length) add('check', 'grid', 'Grid with a column on the crease', pose, { grids: p.gridsOnCrease.map((g) => ({ ...g, sel: clean(g.sel) })) });
        if (withShots && hits.length) {
          await page.evaluate((x) => { const d = document.createElement('div'); d.style.cssText = `position:fixed;top:0;bottom:0;left:${x}px;border-left:2px dashed #ff3b30;z-index:2147483647;pointer-events:none`; document.body.appendChild(d); }, X);
          for (const [i, h] of hits.slice(0, 6).entries()) {
            await page.evaluate((y) => scrollTo(0, y), Math.max(0, h.pageY - pose.viewport.svh / 2)); await sleep(300);
            await page.screenshot({ path: path.join(outDir, `${slug(url)}-${pose.id}-crease-${i + 1}.png`) });
          }
          await page.evaluate(() => scrollTo(0, 0)); await sleep(300);
        }
      }
      if (pose.crease && pose.crease.axis === 'horizontal') {
        const Y = pose.crease.viewportPos;
        const hits = controls.filter((c) => c.pin && c.h < 120 && c.y < Y - 2 && c.y + c.h > Y + 2);
        if (hits.length) add('check', 'crease-h', 'Fixed controls on the crease (open, tall; its height is estimated)', pose, { y: Y, hits: hits.slice(0, 10).map((h) => ({ sel: clean(h.sel), text: clean(h.text, 50) })) });
      }
      const short = pose.viewport.svh < 400;
      if (p.share >= (short ? 0.4 : 0.5)) add(short ? 'fix' : 'check', 'bars', 'Fixed bars take too much of the screen', pose, { share: row.share, bars: p.bars.map((b) => ({ ...b, sel: clean(b.sel) })) });
      if (p.covered.length) add('fix', 'covered', 'Fixed bars cover controls', pose, { covered: p.covered.map((c) => ({ sel: clean(c.sel), text: clean(c.text, 50), by: clean(c.by) })) });
      if (p.overlays.length) add('check', 'overlay', 'A full-screen overlay is open on load', pose, { overlays: p.overlays.map((o) => clean(o)) });
      if (pose.id === 'closed-portrait') {
        const far = p.edge.filter((e) => e && e !== 'image' && Math.hypot(e[0] - p.pageBg[0], e[1] - p.pageBg[1], e[2] - p.pageBg[2]) > 60);
        if (far.length >= 2) add('check', 'background', "Page background doesn't match the page at the edge", pose, { pageBg: p.pageBg, edge: p.edge });
        cssTexts = await page.evaluate(() => [...document.querySelectorAll('style')].map((s) => s.textContent || ''));
        const hrefs = await page.evaluate(() => [...document.querySelectorAll('link[rel~="stylesheet"][href]')].map((l) => l.href));
        let total = cssTexts.reduce((s, t) => s + t.length, 0);
        for (const h of hrefs.slice(0, 30)) { if (total > 4e6) break; try { const r = await ctx.request.get(h, { timeout: 15000 }); if (r.ok()) { const t = await r.text(); cssTexts.push(t); total += t.length; } } catch {} }
      }
      await page.screenshot({ path: path.join(outDir, `${slug(url)}-${pose.id}.png`) });
    } catch (e) {
      row.failed = clean(e && e.message, 80);
      entry.failed = entry.failed || row.failed;
    } finally { await ctx.close(); }
    entry.poses.push(row);
    process.stdout.write(`${row.failed ? '✗' : '·'} ${url} ${pose.id}${row.failed ? ` not checked: ${row.failed}` : ''}\n`);
  }
  if (entry.failed) continue;

  // Static checks on the CSS.
  const s = staticFindings(cssTexts, viewportMeta);
  if (s.vh.length) add('check', 'vh', 'Heights in vh', null, { selectors: s.vh });
  if (s.hoverOnly.length) add('check', 'hover', 'Content revealed on hover only', null, { selectors: s.hoverOnly });
  if (s.insets.length) add('check', 'insets', 'Safe-area insets applied to both sides from one edge', null, { selectors: s.insets });
  if (s.topInset.length) add('check', 'top-inset', 'Fixed header padded by safe-area-inset-top', null, { selectors: s.topInset });
  if (s.coverWithoutInsets) add('check', 'cover', 'viewport-fit=cover with no safe-area insets', null, {});

  // Behaviour: compare against fresh loads at the open size. Two fresh loads first: if they already
  // differ, the page changes on its own and these comparisons can only be "to check".
  const open951 = POSES.find((q) => q.id === 'open-landscape'), closed = POSES.find((q) => q.id === 'closed-portrait');
  const sigAt = async (pose, extra, steps) => {
    const ctx = await context(pose, extra);
    try { const { page } = await open(ctx, url); if (steps) await steps(page); await page.evaluate(() => scrollTo(0, 0)); await sleep(300); return await page.evaluate(signature); } finally { await ctx.close(); }
  };
  try {
    const screenOpen = { screen: { width: open951.screen.width, height: open951.screen.height } };
    const fresh = await sigAt(open951, screenOpen), fresh2 = await sigAt(open951, screenOpen);
    const noise = diff(fresh2, fresh).changed;
    const sev = noise ? 'check' : 'fix';
    const t = GEO.transientResize;
    const live = await sigAt(closed, {}, async (page) => {
      await page.setViewportSize({ width: t.width, height: t.height }); await sleep(t.settleMs + 10);
      await page.setViewportSize({ width: open951.viewport.width, height: open951.viewport.svh }); await sleep(1500);
    });
    const d1 = diff(live, fresh);
    if (d1.changed) add(sev, 'resize', 'Layout after opening differs from a fresh load at the open size', open951, { ...d1, noisy: noise });
    const mac = diff(await sigAt(open951, { ...screenOpen, userAgent: UA.mac, isMobile: false }), fresh);
    if (mac.changed) add('check', 'ua', 'Layout differs between the iPhone and Mac user agents at the same size', open951, { ...mac, noisy: noise });
    const stale = diff(await sigAt(open951, { screen: { width: closed.screen.width, height: closed.screen.height } }), fresh);
    if (stale.changed) add(sev, 'screen', 'Layout depends on screen.width, which stays at the closed size after opening', open951, { ...stale, noisy: noise });
    entry.noisy = noise;
  } catch (e) { add('check', 'behaviour', 'Behaviour checks did not complete', null, { error: clean(e && e.message, 80) }); }
}
await browser.close();

// ——— the report ———
const F = { sideways: 'sideways-scroll', crease: 'controls-on-the-crease', 'crease-h': 'controls-on-the-crease', grid: 'grids-across-the-crease', bars: 'fixed-bars-on-a-short-screen', covered: 'fixed-bars-on-a-short-screen', overlay: 'fixed-bars-on-a-short-screen',
  background: 'background-colour', vh: 'heights-in-vh', hover: 'hover-only-menus', insets: 'safe-areas', 'top-inset': 'safe-areas', cover: 'safe-areas', resize: 'sizes-read-once', screen: 'sizes-read-once', ua: 'user-agent-branching', behaviour: 'sizes-read-once' };
const fmt = (f) => {
  const where = f.pose ? ` (${f.pose.label}, ${f.pose.viewport.width} × ${f.pose.viewport.svh})` : '';
  const d = f.detail, lines = [`- **${f.title}**${where}. Fix: [FIXES.md](FIXES.md#${F[f.id]})`];
  if (d.offenders) d.offenders.forEach((o) => lines.push(`  - \`${o.sel}\` reaches x = ${o.right} (${o.width}px wide)`));
  if (d.hits) d.hits.forEach((h) => lines.push(`  - \`${h.sel}\` ${h.text ? `"${h.text}" ` : ''}${h.from != null ? `spans x ${h.from}–${h.to}, page y ${h.pageY}` : ''}${h.frame ? ` (in a frame: ${h.frame})` : ''}`));
  if (d.grids) d.grids.forEach((g) => lines.push(`  - \`${g.sel}\`, ${g.columns} columns`));
  if (d.bars) { lines.push(`  - ${d.share}% of the height:`); d.bars.forEach((b) => lines.push(`    - \`${b.sel}\` ${b.h}px tall at y ${b.y}`)); }
  if (d.covered) d.covered.forEach((c) => lines.push(`  - \`${c.sel}\` ${c.text ? `"${c.text}" ` : ''}under \`${c.by}\``));
  if (d.overlays) d.overlays.forEach((o) => lines.push(`  - \`${o}\``));
  if (d.selectors) d.selectors.forEach((x) => lines.push(`  - \`${x}\``));
  if (d.pageBg) lines.push(`  - page background rgb(${d.pageBg.join(', ')}); at the right edge: ${d.edge.map((e) => (e === 'image' ? 'an image' : e ? `rgb(${e.join(', ')})` : '–')).join(', ')}`);
  if (d.moved != null) lines.push(`  - ${d.moved} controls moved, ${d.missing} missing, ${d.extra} extra; page height differs by ${d.dh}%${d.examples.length ? `; e.g. ${d.examples.map((x) => `\`${x}\``).join(', ')}` : ''}${d.noisy ? '. The page also changes between two fresh loads, so judge this by eye' : ''}`);
  if (d.error) lines.push(`  - ${d.error}`);
  return lines.join('\n');
};
const today = new Date().toISOString().slice(0, 10);
const totalFix = report.reduce((s, e) => s + e.findings.filter((f) => f.sev === 'fix').length, 0);
const md = [`# iPhone Duo audit`, '',
  `Ran ${today} in Playwright ${engine === 'webkit' ? 'WebKit' : 'Chromium'} ${clean(version, 20)} at the viewports WebKit published for Safari 27.1 (\`poses.json\`, collected ${GEO.collected}). This is emulation: the right engine family and sizes, not Safari 27.1 itself. Confirm in Safari before calling it done (\`duo-simulator.sh\`, or a device).`, ''];
for (const e of report) {
  md.push(`## ${clean(e.url, 120)}`, '');
  if (e.failed) { md.push(`**Not checked: ${e.failed}. This is not a pass.**`, ''); continue; }
  md.push('| Pose | Viewport | Sideways scroll | Controls on the crease | Fixed bars |', '|---|---|---|---|---|');
  for (const r of e.poses) md.push(`| ${r.label} | ${r.w} × ${r.h} | ${r.failed ? `not checked: ${r.failed}` : r.sideways ? '**yes**' : 'no'} | ${r.creaseHits === undefined ? '–' : POSES.find((q) => q.id === r.id).crease && r.id !== 'split-view' && r.id !== 'open-portrait' ? (r.creaseHits ? `**${r.creaseHits}**` : '0') : '–'} | ${r.share ?? '–'}% |`);
  const fix = e.findings.filter((f) => f.sev === 'fix'), chk = e.findings.filter((f) => f.sev === 'check');
  md.push('', `### To fix (${fix.length})`, '', fix.length ? fix.map(fmt).join('\n') : 'Nothing.', '', `### To check (${chk.length})`, '', chk.length ? chk.map(fmt).join('\n') : 'Nothing.', '');
}
fs.writeFileSync(path.join(outDir, 'duo-report.md'), md.join('\n'));
fs.writeFileSync(path.join(outDir, 'duo-report.json'), JSON.stringify({ ran: today, engine, version, poses: GEO.collected, report: report.map((e) => ({ ...e, findings: e.findings.map((f) => ({ ...f, pose: f.pose ? f.pose.id : null })) })) }, null, 2));
console.log(`\n${totalFix ? `${totalFix} to fix.` : 'Nothing to fix.'} Report: ${path.join(outDir, 'duo-report.md')}`);
process.exit(totalFix || report.some((e) => e.failed) ? 1 : 0);
