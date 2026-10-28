// Self-test: duo-audit must find every planted problem in broken.html and nothing to fix in fixed.html.
//   node test/selftest.mjs        (with Playwright reachable, as for duo-audit)
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const out = fs.mkdtempSync(path.join(fs.realpathSync(process.env.TMPDIR || '/tmp'), 'duo-selftest-'));
const pages = { broken: pathToFileURL(path.join(HERE, 'broken.html')).href, fixed: pathToFileURL(path.join(HERE, 'fixed.html')).href };
try { execFileSync(process.execPath, [path.join(HERE, '..', 'duo-audit.mjs'), pages.broken, pages.fixed, '--out', out], { stdio: 'inherit' }); } catch { /* exit 1 is expected: broken.html has work to do */ }
const { report } = JSON.parse(fs.readFileSync(path.join(out, 'duo-report.json'), 'utf8'));
const ids = (u) => new Set(report.find((e) => e.url === u).findings.map((f) => f.id));
const broken = ids(pages.broken);
const expected = ['sideways', 'crease', 'grid', 'bars', 'covered', 'background', 'vh', 'hover', 'insets', 'top-inset', 'resize', 'ua', 'screen'];
let failed = 0;
for (const id of expected) { const ok = broken.has(id); console.log(`${ok ? '✓' : '✗'} broken.html: ${id}`); if (!ok) failed++; }
const fixedFindings = report.find((e) => e.url === pages.fixed).findings;
const ok = fixedFindings.length === 0;
console.log(`${ok ? '✓' : '✗'} fixed.html: nothing found${ok ? '' : ` (found: ${fixedFindings.map((f) => `${f.id}${f.pose ? '@' + f.pose : ''}`).join(', ')})`}`);
if (!ok) failed++;
fs.rmSync(out, { recursive: true, force: true });
console.log(failed ? `\n${failed} failed` : '\nall passed');
process.exit(failed ? 1 : 0);
