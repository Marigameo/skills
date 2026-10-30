// Self-test: duo-audit must find every planted problem in broken.html, nothing in fixed.html, and in edge.html
// every judgement call as "to check" with nothing to fix.
//   node test/selftest.mjs        (with Playwright reachable, as for duo-audit)
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const out = fs.mkdtempSync(path.join(fs.realpathSync(process.env.TMPDIR || '/tmp'), 'duo-selftest-'));
const pages = Object.fromEntries(['broken', 'fixed', 'edge'].map((n) => [n, pathToFileURL(path.join(HERE, `${n}.html`)).href]));
try { execFileSync(process.execPath, [path.join(HERE, '..', 'duo-audit.mjs'), ...Object.values(pages), '--out', out], { stdio: 'inherit' }); } catch { /* exit 1 is expected: broken.html has work to do */ }
const { report } = JSON.parse(fs.readFileSync(path.join(out, 'duo-report.json'), 'utf8'));
const findings = (u) => report.find((e) => e.url === u).findings;
const ids = (u) => new Set(findings(u).map((f) => f.id));
let failed = 0;
const check = (ok, label) => { console.log(`${ok ? '✓' : '✗'} ${label}`); if (!ok) failed++; };

const broken = ids(pages.broken);
for (const id of ['sideways', 'crease', 'grid', 'bars', 'covered', 'background', 'vh', 'hover', 'insets', 'top-inset', 'resize', 'ua', 'screen']) check(broken.has(id), `broken.html: ${id}`);

const fixedFindings = findings(pages.fixed);
check(fixedFindings.length === 0, `fixed.html: nothing found${fixedFindings.length ? ` (found: ${fixedFindings.map((f) => `${f.id}${f.pose ? '@' + f.pose : ''}`).join(', ')})` : ''}`);

const edge = ids(pages.edge), edgeFix = findings(pages.edge).filter((f) => f.sev === 'fix');
for (const id of ['cutoff', 'crease-moving', 'overlay', 'crease-h', 'cover']) check(edge.has(id), `edge.html: ${id}, to check`);
for (const id of ['sideways', 'crease', 'vh']) check(!edge.has(id), `edge.html: no ${id}`);
check(edgeFix.length === 0, `edge.html: nothing to fix${edgeFix.length ? ` (found: ${edgeFix.map((f) => f.id).join(', ')})` : ''}`);
const cut = findings(pages.edge).find((f) => f.id === 'cutoff');
check(!!cut && cut.detail.offenders.length > 0 && cut.detail.offenders.every((o) => /[.#]/.test(o.sel)), 'edge.html: only the element that sticks out is listed, not its children');
const side = findings(pages.broken).find((f) => f.id === 'sideways');
check(!!side && side.detail.offenders.some((o) => o.sel === 'figure.app-shot'), 'broken.html: the element that makes the page wide is named');

// The visual report: every item has a card, and every picture a card points to exists.
const html = fs.readFileSync(path.join(out, 'duo-report.html'), 'utf8');
for (const [name, u] of Object.entries(pages)) {
  const items = report.find((e) => e.url === u).items;
  const missing = items.filter((it) => !html.includes(`data-key="${it.key}"`));
  check(!missing.length, `report: every ${name}.html item has a card${missing.length ? ` (missing: ${missing.map((m) => m.key).join(', ')})` : ''}`);
  const visual = ['sideways', 'cutoff', 'crease', 'crease-moving', 'crease-h', 'grid', 'bars', 'covered', 'overlay', 'background'];
  const blind = items.filter((it) => visual.includes(it.check) && !it.shot);
  check(!blind.length, `report: every ${name}.html layout item has a picture${blind.length ? ` (none for: ${blind.map((b) => b.key).join(', ')})` : ''}`);
}
const srcs = [...html.matchAll(/src="([^"]+)"/g)].map((m) => m[1]);
const lost = srcs.filter((s) => !fs.existsSync(path.join(out, s)));
check(srcs.length > 0 && !lost.length, `report: all ${srcs.length} pictures exist${lost.length ? ` (missing: ${lost.join(', ')})` : ''}`);

fs.rmSync(out, { recursive: true, force: true });
console.log(failed ? `\n${failed} failed` : '\nall passed');
process.exit(failed ? 1 : 0);
