#!/usr/bin/env node
// duo-report: renders duo-report.html, the report people read, from an audit's duo-report.json, the agent's
// duo-triage.json (a level and a recommended fix per item) and, with --before, an earlier run to compare with.
//
//   node duo-report.mjs duo-report [--before duo-report-before]
//
// duo-audit.mjs calls this itself; run it again after writing or changing duo-triage.json.
// Every string from the audited page is escaped here: it is data, never markup.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const LEVELS = {
  you: { label: 'Needs you', hint: 'Changes content, links or product behaviour, or might be deliberate. Nothing happens until you answer.' },
  pick: { label: 'My pick', hint: 'More than one reasonable layout. The agent picks one you can easily undo, and lists it after.' },
  safe: { label: 'Safe fix', hint: 'One reasonable answer, a small change, holds at every width.' },
  leave: { label: 'Leave', hint: 'True but harmless or deliberate. No change; the reason is recorded.' },
  none: { label: 'Not triaged', hint: 'The agent has not sorted this yet (SKILL.md, step 3).' },
};
const ORDER = ['you', 'pick', 'safe', 'leave', 'none'];

// Why each check matters, in a sentence. The detail is in CHECKS.md.
const WHY = {
  sideways: 'The page scrolls sideways at this size. Safari shrinks such a page to fit, so everything gets smaller.',
  cutoff: "Nothing scrolls (the page clips sideways), but this part is cut off at the right edge.",
  crease: 'On the open screen the fold runs down the middle. Partly folded, a small control there is hard to tap. Apple: keep controls out of the fold.',
  'crease-moving': 'This control moves (a marquee or an autoplaying track), so for most visitors it only passes the fold. With reduced motion on, it stops here, on the fold.',
  'crease-h': 'Open and turned tall, the fold runs across the screen. A fixed control on it stays there. The line\'s height is estimated.',
  grid: 'An odd number of equal columns puts the middle one on the fold. Apple prefers an even number.',
  bars: 'Fixed bars take this much of the screen, on top of Safari\'s own bars.',
  covered: 'A fixed bar sits over these controls at load, so they can\'t be tapped.',
  overlay: 'Something covers the screen at load. Check its close button fits on the 368px-tall screen.',
  background: 'On the closed screen Safari paints the page\'s background colour behind its side column. It doesn\'t match what\'s at the page\'s edge.',
  vh: 'In Safari, 100vh is the height with its bars hidden, 35 to 38px more than what\'s visible. It only matters where the rule sets the height.',
  hover: 'Every iPhone Duo pose is touch. Content that only opens on hover can\'t be reached.',
  insets: 'The closed screen\'s two side insets differ. One value for both sides is wrong on one of them.',
  'top-inset': 'In-app browsers report a large top inset under their own toolbar, which turns this padding into a dead strip.',
  cover: 'viewport-fit=cover lets content run under system UI, and no CSS insets it.',
  resize: 'Opening the device resizes the page without a reload. This layout kept something from the closed size.',
  ua: 'iPhone Duo says "iPhone" at every size. The layout changes with the user agent.',
  screen: 'screen.width keeps the closed value after opening. Layout read from it is wrong when open.',
  behaviour: 'The behaviour checks didn\'t finish, so resizing, user agent and screen.width weren\'t checked.',
};
// A card is one thing, so it gets a singular title; the audit's titles describe a whole finding.
const TITLE = {
  sideways: 'Scrolls sideways', cutoff: 'Cut off at the edge', crease: 'Control on the crease', 'crease-moving': 'Moving control on the crease',
  'crease-h': 'Fixed control on the crease, open tall', grid: 'Grid with a column on the crease', bars: 'Fixed bars take too much of the screen',
  covered: 'Fixed bar covers controls', overlay: 'Full-screen overlay on load', background: "Background colour doesn't match the edge", vh: 'Height in vh',
  hover: 'Shown on hover only', insets: 'One inset for both sides', 'top-inset': 'Header padded by the top inset', cover: 'viewport-fit=cover with no insets',
  resize: 'Layout stays closed after opening', ua: 'Layout changes with the user agent', screen: 'Layout reads screen.width', behaviour: "Behaviour checks didn't finish",
};
const KIND = { vh: 'CSS rule', hover: 'CSS rule', insets: 'CSS rule', 'top-inset': 'CSS rule', cover: 'Viewport meta', resize: 'Behaviour', ua: 'Behaviour', screen: 'Behaviour', behaviour: 'Behaviour' };

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const rich = (v) => esc(v).replace(/`([^`]+)`/g, '<code>$1</code>'); // the audit's own `code` marks, after escaping
const readJSON = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
const plural = (n, one, many = one + 's') => `${n} ${n === 1 ? one : many}`;
const rgb = (c) => (Array.isArray(c) ? `rgb(${c.map(Number).join(',')})` : 'transparent');

export function render(dir, { before = '' } = {}) {
  dir = path.resolve(dir);
  const data = readJSON(path.join(dir, 'duo-report.json'));
  if (!data) throw new Error(`No duo-report.json in ${dir}`);
  const beforeDir = before ? path.resolve(before) : '';
  const prev = beforeDir ? readJSON(path.join(beforeDir, 'duo-report.json')) : null;
  // The triage carries over from the earlier run until the agent writes a new one.
  const triage = readJSON(path.join(dir, 'duo-triage.json')) || (beforeDir && readJSON(path.join(beforeDir, 'duo-triage.json'))) || {};
  const relBefore = (src) => (src ? path.relative(dir, path.join(beforeDir, src)).split(path.sep).join('/') : null);

  const pages = data.report.map((e) => {
    const t = (triage.pages && triage.pages[e.url]) || {};
    const prevItems = prev ? (prev.report.find((p) => p.url === e.url) || {}).items || [] : null;
    const prevKeys = new Set((prevItems || []).map((i) => i.key));
    const sorted = (e.items || []).map((it, i) => {
      const tr = t[it.key] || {};
      const level = LEVELS[tr.level] && tr.level !== 'none' ? tr.level : 'none';
      return { ...it, tr, level, status: prevItems ? (prevKeys.has(it.key) ? 'still' : 'new') : null, order: i };
    }).sort((a, b) => ORDER.indexOf(a.level) - ORDER.indexOf(b.level) || (a.sev === 'fix' ? 0 : 1) - (b.sev === 'fix' ? 0 : 1) || a.order - b.order);
    // An item that another item's fix clears ("with" in the triage) comes right after that item's card.
    const byKey = new Map(sorted.map((i) => [i.key, i]));
    for (const it of sorted) it.parent = it.tr.with && it.tr.with !== it.key ? byKey.get(it.tr.with) || null : null;
    const items = [];
    const place = (it) => { if (items.includes(it)) return; items.push(it); sorted.filter((f) => f.parent === it).forEach(place); };
    sorted.filter((i) => !i.parent).forEach(place);
    sorted.forEach(place);
    const keys = new Set(items.map((i) => i.key));
    // A fixed item shows its earlier picture, and beside it the same element in this run when the audit found it again.
    const fixed = (prevItems || []).filter((i) => !keys.has(i.key)).map((i) => {
      const after = (e.fixedShots || {})[i.key], was = relBefore(i.shot);
      const shots = after ? [...(was ? [{ label: `Before · ${i.poses[0]?.label || ''}`, src: was }] : []), { label: 'After', src: after }] : (i.shots || []).map((s) => ({ ...s, src: relBefore(s.src) }));
      return { ...i, shot: after ? null : was, shots };
    });
    return { e, items, fixed };
  });

  const all = pages.flatMap((p) => p.items);
  // Numbered across the whole report, so "#3" means one item even when several pages were audited.
  all.forEach((it, i) => { it.n = i + 1; it.anchor = `item-${i + 1}`; });
  const count = (lvl) => all.filter((i) => i.level === lvl).length;
  const counts = Object.fromEntries(ORDER.map((l) => [l, count(l)]));

  // ——— the plan: what "go" does, and what needs an answer ———
  const plan = [];
  if (!all.length) plan.push('<p class="plan-lead">Nothing found at any of the five sizes.</p>');
  else if (counts.none === all.length) plan.push(`<p class="plan-lead">${plural(all.length, 'item')} found, not triaged yet. Your agent sorts each one into a level next and re-renders this page.</p>`);
  else {
    // Count changes, not items: an item another fix clears is no extra work.
    // A Needs-you item the owner has answered ("answer" in the triage) is a change like the others.
    const answered = (i) => i.level === 'you' && !!i.tr.answer;
    const doing = all.filter((i) => i.level === 'safe' || i.level === 'pick' || answered(i)), changes = doing.filter((i) => !i.parent);
    const cs = changes.filter((i) => i.level === 'safe').length, cp = changes.filter((i) => i.level === 'pick').length, ca = changes.length - cs - cp;
    const parts = [cs && plural(cs, 'safe fix', 'safe fixes'), cp && `${cp} of its picks`, ca && (ca === 1 ? 'the change you answered' : `the ${ca} changes you answered`)].filter(Boolean);
    if (changes.length) plan.push(`<p class="plan-lead">Reply <b>go</b> and your agent makes ${parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}` : parts[0]}${doing.length > changes.length ? `, which clear ${doing.length} items` : ''}.</p>`);
    else plan.push(`<p class="plan-lead">${all.some((i) => (i.level === 'you' && !i.tr.answer) || i.level === 'none') ? 'Nothing for the agent to do on its own.' : 'Nothing left to change.'}</p>`);
    const asks = pages.flatMap((p) => p.items.filter((i) => i.level === 'you' && !i.tr.answer));
    if (asks.length) plan.push(`<p>${asks.length === 1 ? 'One needs' : `${asks.length} need`} your answer first:</p><ol class="asks">${asks.map((i) => `<li><a href="#${i.anchor}">#${i.n}</a> ${rich(i.tr.question || i.title)}</li>`).join('')}</ol>`);
    if (counts.leave) plan.push(`<p>${plural(counts.leave, 'item')} stay${counts.leave === 1 ? 's' : ''} as ${counts.leave === 1 ? 'it is' : 'they are'}, each with its reason.</p>`);
    if (counts.none) plan.push(`<p>${plural(counts.none, 'item')} not triaged yet.</p>`);
    plan.push('<p class="muted">Answer by number, like "#3: keep four links", or change a level the same way.</p>');
  }
  if (prev) {
    const still = all.filter((i) => i.status === 'still').length, fresh = all.filter((i) => i.status === 'new').length, gone = pages.reduce((s, p) => s + p.fixed.length, 0);
    plan.push(`<p class="since"><b>Since the last run:</b> ${gone} fixed · ${still} still there · ${fresh} new</p>`);
  }

  const tiles = ORDER.filter((l) => l !== 'none' || counts.none).map((l) => `<button class="tile lv-${l}" data-filter="${l}" title="${esc(LEVELS[l].hint)}"><span class="tile-n">${counts[l]}</span><span class="tile-l">${LEVELS[l].label}</span></button>`).join('');

  // ——— one card per item ———
  const figure = (it) => {
    if (it.shots && it.shots.length) return `<div class="shots pair">${it.shots.map((s) => `<figure><a href="${esc(s.src)}" target="_blank"><img src="${esc(s.src)}" alt="${esc(s.label)}"></a><figcaption>${esc(s.label)}</figcaption></figure>`).join('')}</div>`;
    if (it.shot) return `<div class="shots"><figure><a href="${esc(it.shot)}" target="_blank"><img src="${esc(it.shot)}" alt="${esc(it.title)}"></a>${it.poses.length ? `<figcaption>${esc(it.poses[0].label)}${it.check.startsWith('crease') || it.check === 'grid' ? ' · red line: the crease' : ''}</figcaption>` : ''}</figure></div>`;
    return `<div class="shots none"><span>${esc(KIND[it.check] || 'No picture')}</span></div>`;
  };
  const swatches = (s) => (s ? `<div class="swatches"><span><i style="background:${rgb(s.page)}"></i>page background</span>${s.edge.map((c, i) => `<span><i style="background:${c === 'image' ? 'repeating-linear-gradient(45deg,#999 0 4px,#ccc 4px 8px)' : rgb(c)}"></i>edge ${i + 1}</span>`).join('')}</div>` : '');
  const card = (it, fixedCard = false) => {
    const tr = it.tr || {}, lvl = fixedCard ? 'fixed' : it.level;
    return `<article class="card lv-${lvl}${it.shot || (it.shots && it.shots.length) ? '' : ' textonly'}" ${fixedCard ? `data-fixed-key="${esc(it.key)}"` : `id="${it.anchor}" data-key="${esc(it.key)}" data-level="${lvl}"`}>
  ${figure(it)}
  <div class="body">
    <header><span class="num">${fixedCard ? '✓' : it.n}</span><h3>${esc(TITLE[it.check] || it.title)}</h3></header>
    <div class="chips">${fixedCard ? '<span class="chip lv-fixed">Fixed</span>' : `<span class="chip lv-${lvl}">${LEVELS[lvl].label}</span>`}<span class="chip sev-${it.sev}">${it.sev === 'fix' ? 'To fix' : 'To check'}</span>${it.poses.map((p) => `<span class="chip">${esc(p.label)}</span>`).join('')}${it.status === 'new' ? '<span class="chip st-new">New</span>' : it.status === 'still' ? '<span class="chip st-still">Still there</span>' : ''}${it.parent ? `<a class="chip with" href="#${it.parent.anchor}">Cleared by #${it.parent.n}</a>` : ''}</div>
    ${it.subject ? `<p class="subject">${rich(it.subject)}</p>` : ''}
    ${it.lines.length ? `<ul class="facts">${it.lines.map((l) => `<li>${rich(l)}</li>`).join('')}</ul>` : ''}
    ${swatches(it.swatches)}
    ${tr.answer && lvl === 'you' ? `<div class="box ask"><b>Your answer</b><p>${rich(tr.answer)}</p>${tr.question ? `<p class="asked">Asked: ${rich(tr.question)}</p>` : ''}</div>`
      : tr.question && lvl === 'you' ? `<div class="box ask"><b>Your call</b><p>${rich(tr.question)}</p></div>` : ''}
    ${tr.fix ? `<div class="box rec"><b>${lvl === 'leave' ? 'Why leave it' : lvl === 'you' ? 'Options' : 'The fix'}</b><p>${rich(tr.fix)}</p>${tr.where ? `<p class="where">${rich(tr.where)}</p>` : ''}</div>` : ''}
    ${tr.why ? `<p class="reason">${rich(tr.why)}</p>` : ''}
    <p class="why">${esc(WHY[it.check] || '')}</p>
    <p class="key">${esc(it.key)}</p>
  </div>
</article>`;
  };

  const poseStrip = (e) => `<div class="poses">${e.poses.map((r) => `<figure>${r.shot ? `<a href="${esc(r.shot)}" target="_blank"><img src="${esc(r.shot)}" alt="${esc(r.label)}"></a>` : '<div class="noimg"></div>'}<figcaption><b>${esc(r.label)}</b> ${r.w} × ${r.h}<br>${r.failed ? `not checked: ${esc(r.failed)}` : [r.sideways ? '<span class="bad">scrolls sideways</span>' : r.cutoff ? 'clipped at the edge' : 'no sideways scroll', r.creaseHits != null ? `${r.creaseHits} on the crease${r.creaseMoving ? ` (+${r.creaseMoving} moving)` : ''}` : '', `bars ${r.share ?? '–'}%`].filter(Boolean).join(' · ')}</figcaption></figure>`).join('')}</div>`;

  const pageSection = ({ e, items, fixed }) => {
    if (e.failed) return `<section class="page"><h2 class="url">${esc(e.url)}</h2><p class="failed">Not checked: ${esc(e.failed)}. This is not a pass.</p></section>`;
    const left = Object.values(e.elsewhere || {}).reduce((s, n) => s + n, 0);
    const groups = ORDER.map((l) => { const g = items.filter((i) => i.level === l); return g.length ? `<div class="group" data-group="${l}"><h3 class="group-h lv-${l}"><i></i>${LEVELS[l].label} <span>${g.length}</span><small>${esc(LEVELS[l].hint)}</small></h3>${g.map((i) => card(i)).join('\n')}</div>` : ''; }).join('');
    return `<section class="page">
  <h2 class="url">${esc(e.url)}</h2>
  ${poseStrip(e)}
  ${left ? `<p class="muted">${plural(left, 'CSS rule')} in the stylesheet ${left === 1 ? 'is' : 'are'} for elements not on this page, and ${left === 1 ? 'isn\'t' : 'aren\'t'} counted.</p>` : ''}
  ${items.length ? groups : '<p class="clear">Nothing found on this page.</p>'}
  ${fixed.length ? `<div class="group fixed"><h3 class="group-h lv-fixed"><i></i>Fixed since the last run <span>${fixed.length}</span></h3>${fixed.map((i) => card(i, true)).join('\n')}</div>` : ''}
</section>`;
  };

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>iPhone Duo audit</title>
<style>
:root{--bg:#f6f5f1;--surface:#fff;--ink:#1c1b19;--muted:#66635c;--line:#e4e1d8;--code:#f1efe8;--accent:#0a64d6;
--you:#b4410e;--you-bg:#fdefe4;--pick:#6b3fd4;--pick-bg:#f1ecfd;--safe:#18794e;--safe-bg:#e6f5ec;--leave:#5f5c55;--leave-bg:#eeece7;--none:#8a6a00;--none-bg:#fbf2d6;--fixed:#18794e;--fixed-bg:#e6f5ec;--bad:#c62828}
@media (prefers-color-scheme:dark){:root{--bg:#141412;--surface:#1d1c1a;--ink:#ecebe6;--muted:#a3a097;--line:#34322d;--code:#2a2925;--accent:#6aa8ff;
--you:#f59e64;--you-bg:#3a2416;--pick:#bba4ff;--pick-bg:#2a2240;--safe:#6fd39f;--safe-bg:#16301f;--leave:#b8b4ab;--leave-bg:#2b2a27;--none:#e9c75b;--none-bg:#352d12;--fixed:#6fd39f;--fixed-bg:#16301f;--bad:#ff7b72}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif}
.wrap{max-width:1160px;margin:0 auto;padding:28px 16px 64px}
h1{font-size:26px;line-height:1.2;margin:0 0 6px;letter-spacing:-.01em}
.intro{color:var(--muted);font-size:13px;max-width:80ch;margin:0 0 4px}
code{font:12.5px/1.4 ui-monospace,SFMono-Regular,Menlo,monospace;background:var(--code);padding:1px 5px;border-radius:4px;overflow-wrap:anywhere}
a{color:var(--accent)}
.muted{color:var(--muted);font-size:13px}
.summary{display:grid;gap:18px;grid-template-columns:minmax(0,1fr);background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:18px;margin:20px 0 28px}
@media (min-width:860px){.summary{grid-template-columns:minmax(0,.9fr) minmax(0,1.1fr)}}
.tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:8px;align-content:start}
.tile{all:unset;cursor:pointer;display:flex;flex-direction:column;gap:2px;padding:12px 14px;border-radius:10px;background:var(--bg);border:1px solid var(--line)}
.tile:focus-visible{outline:2px solid var(--accent)}
.tile.on{border-color:currentColor}
.tile-n{font-size:28px;font-weight:700;line-height:1}
.tile-l{font-size:13px;font-weight:600}
.lv-you{color:var(--you)}.lv-pick{color:var(--pick)}.lv-safe{color:var(--safe)}.lv-leave{color:var(--leave)}.lv-none{color:var(--none)}.lv-fixed{color:var(--fixed)}
.plan p{margin:0 0 8px}.plan-lead{font-size:17px;font-weight:600}
.asks{margin:0 0 10px;padding-left:20px}.asks li{margin:4px 0}
.since{padding-top:8px;border-top:1px solid var(--line)}
.filters{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 6px}
.filters button{font:inherit;font-size:13px;padding:5px 12px;border-radius:999px;border:1px solid var(--line);background:var(--surface);color:var(--ink);cursor:pointer}
.filters button.on{background:var(--ink);color:var(--surface);border-color:var(--ink)}
.page{margin-top:28px}
.url{font-size:18px;margin:0 0 12px;overflow-wrap:anywhere}
.poses{display:flex;gap:12px;overflow-x:auto;padding-bottom:8px;margin-bottom:8px}
.poses figure{margin:0;flex:none}
.poses img,.poses .noimg{display:block;height:150px;width:auto;border:1px solid var(--line);border-radius:8px;background:var(--code)}
.poses .noimg{width:120px}
.poses figcaption{font-size:12px;color:var(--muted);margin-top:6px;max-width:260px}
.bad{color:var(--bad);font-weight:600}
.group{margin-top:26px}
.group-h{display:flex;flex-wrap:wrap;align-items:baseline;gap:8px;font-size:16px;margin:0 0 12px}
.group-h i{width:10px;height:10px;border-radius:50%;background:currentColor;align-self:center}
.group-h span{color:var(--muted);font-weight:500}
.group-h small{flex-basis:100%;color:var(--muted);font-weight:400;font-size:13px}
.card{display:grid;grid-template-columns:minmax(0,1fr);gap:0;background:var(--surface);border:1px solid var(--line);border-left:4px solid currentColor;border-radius:12px;margin:0 0 14px;overflow:hidden}
@media (min-width:860px){.card{grid-template-columns:minmax(0,1.2fr) minmax(0,1fr)}.card.textonly{grid-template-columns:150px minmax(0,1fr)}}
.card .body{padding:16px 18px;color:var(--ink);min-width:0}
.card header{display:flex;gap:10px;align-items:flex-start}
.num{flex:none;min-width:26px;height:26px;padding:0 6px;border-radius:999px;display:grid;place-items:center;font-size:13px;font-weight:700;color:var(--surface);background:var(--muted)}
.card.lv-you .num{background:var(--you)}.card.lv-pick .num{background:var(--pick)}.card.lv-safe .num{background:var(--safe)}.card.lv-leave .num{background:var(--leave)}.card.lv-none .num{background:var(--none)}.card.lv-fixed .num{background:var(--fixed)}
.card h3{font-size:16px;line-height:1.3;margin:2px 0 0}
.chips{display:flex;flex-wrap:wrap;gap:6px;margin:10px 0}
.chip{font-size:12px;font-weight:600;padding:2px 9px;border-radius:999px;background:var(--code);color:var(--muted)}
.chip.lv-you{background:var(--you-bg)}.chip.lv-pick{background:var(--pick-bg)}.chip.lv-safe{background:var(--safe-bg)}.chip.lv-leave{background:var(--leave-bg)}.chip.lv-none{background:var(--none-bg)}.chip.lv-fixed{background:var(--fixed-bg)}
.chip.sev-fix{color:var(--bad)}.chip.st-new{color:var(--bad)}.chip.with{color:var(--accent);text-decoration:none}
.subject{margin:0 0 6px;font-weight:600;overflow-wrap:anywhere}
.facts{margin:0 0 10px;padding-left:18px;font-size:14px}.facts li{margin:2px 0}
.box{border-radius:8px;padding:10px 12px;margin:10px 0;font-size:14px}
.box b{display:block;font-size:12px;text-transform:uppercase;letter-spacing:.04em;margin-bottom:3px}
.box p{margin:0}.box .where{margin-top:6px}
.ask{background:var(--you-bg)}.ask b{color:var(--you)}.ask .asked{margin-top:6px;font-size:13px;color:var(--muted)}
.rec{background:var(--code)}
.reason{font-size:14px;margin:8px 0}
.why{font-size:13px;color:var(--muted);margin:10px 0 0}
.key{font:11px/1.4 ui-monospace,SFMono-Regular,Menlo,monospace;color:var(--muted);opacity:.75;margin:8px 0 0;overflow-wrap:anywhere}
.shots{background:var(--code);display:flex;align-items:center;justify-content:center;min-height:120px;padding:10px}
.shots figure{margin:0;width:100%}
.shots img{display:block;width:100%;height:auto;max-height:460px;object-fit:contain;border-radius:6px}
.shots figcaption{font-size:12px;color:var(--muted);margin-top:6px;text-align:center}
.shots.pair{display:grid;grid-template-columns:1fr 1fr;gap:10px;align-items:start}
.shots.none span{font-size:12px;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:.05em}
.swatches{display:flex;flex-wrap:wrap;gap:10px;font-size:12px;color:var(--muted);margin:4px 0 8px}
.swatches span{display:flex;align-items:center;gap:6px}
.swatches i{width:22px;height:22px;border-radius:50%;border:1px solid var(--line)}
.failed{color:var(--bad);font-weight:600}.clear{color:var(--safe);font-weight:600}
.legend{margin-top:40px;font-size:13px;color:var(--muted)}.legend dt{font-weight:700;margin-top:8px}.legend dd{margin:0}
[hidden]{display:none!important}
</style>
</head>
<body>
<div class="wrap">
<h1>iPhone Duo audit</h1>
<p class="intro">${rich(data.intro || '')}</p>
<p class="intro">${triage.safari ? `Safari pass: ${esc(triage.safari)}` : 'Safari pass: not recorded yet.'}</p>
<section class="summary">
  <div class="tiles">${tiles}</div>
  <div class="plan">${plan.join('\n')}</div>
</section>
<nav class="filters" aria-label="Show"><button class="on" data-filter="all">All ${all.length}</button>${ORDER.filter((l) => counts[l]).map((l) => `<button data-filter="${l}">${LEVELS[l].label} ${counts[l]}</button>`).join('')}</nav>
${pages.map(pageSection).join('\n')}
<dl class="legend">${ORDER.map((l) => `<dt class="lv-${l}">${LEVELS[l].label}</dt><dd>${esc(LEVELS[l].hint)}</dd>`).join('')}</dl>
</div>
<script>
// Filters by level. Without script, everything shows.
const buttons = document.querySelectorAll('[data-filter]');
function show(level) {
  buttons.forEach((b) => b.classList.toggle('on', b.dataset.filter === level));
  document.querySelectorAll('.card[data-level]').forEach((c) => { c.hidden = level !== 'all' && c.dataset.level !== level; });
  document.querySelectorAll('.group[data-group]').forEach((g) => { g.hidden = level !== 'all' && g.dataset.group !== level; });
  document.querySelectorAll('.group.fixed').forEach((g) => { g.hidden = level !== 'all'; });
}
buttons.forEach((b) => b.addEventListener('click', () => show(b.classList.contains('on') && b.dataset.filter !== 'all' ? 'all' : b.dataset.filter)));
</script>
</body>
</html>
`;
  const out = path.join(dir, 'duo-report.html');
  fs.writeFileSync(out, html);
  return out;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const dir = args.find((a) => !a.startsWith('--') && args[args.indexOf(a) - 1] !== '--before') || 'duo-report';
  const i = args.indexOf('--before');
  console.log(`Report: ${render(dir, { before: i >= 0 ? args[i + 1] : '' })}`);
}
