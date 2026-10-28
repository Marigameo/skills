# fit-iphone-duo

Make your website work on iPhone Duo. Your coding agent audits the site at the five sizes Safari 27.1 really gives a page, fixes what breaks in your own code, and shows you the before and after.

It's for websites and web apps. Native iOS apps get Apple's own APIs and need a different skill.

**[Try your site in the playground first →](https://marigameo.github.io/iphone-duo-playground/)** It shows your site at the same sizes, with Safari's bars and the crease drawn in.

## Install

```bash
npx skills@latest add marigameo/skills
```

Then ask your coding agent to "make my site work on iPhone Duo". It starts at [SKILL.md](SKILL.md). The audit needs Playwright with WebKit (`npm i -D playwright && npx playwright install webkit`). The Safari check at the end needs Xcode 27.1 on a Mac, and skips cleanly without it.

## What's inside

| File | What it covers |
|---|---|
| [SKILL.md](SKILL.md) | The facts, the rules, the sequence, and a done checklist |
| [CHECKS.md](CHECKS.md) | What the audit measures, its thresholds and where each comes from |
| [FIXES.md](FIXES.md) | A fix at the cause for every finding, with code |
| `duo-audit.mjs` | The audit: WebKit, five poses, the crease, the CSS, and behaviour when the page resizes |
| `duo-simulator.sh` | An optional last look in real Safari on Xcode's iPhone Duo simulator |
| `poses.json` | The viewport numbers, shared with the playground |
| `test/` | A broken page, a fixed page and a self-test that proves every check catches what it should |

## What it catches

Sideways scroll. Buttons and links on the crease of the open screen. Sticky headers, banners and chat bubbles that bury a 368px-tall screen. Layouts read once at load, or from the user agent or `screen.width`, that stay wrong after the device opens. `vh` heights, hover-only menus, safe areas and the background colour Safari paints behind its bars.
