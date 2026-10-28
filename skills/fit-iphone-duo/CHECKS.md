# What the audit checks

`duo-audit.mjs` opens each URL at the five viewports Safari 27.1 gives a page on iPhone Duo (`poses.json`, from WebKit), in Playwright's WebKit, with touch, a pixel ratio of 3 and Safari 27.1's iPhone user agent. It scrolls the whole page so lazy sections load, then measures. It reads inside iframes too, so a chat widget's own buttons count.

**To fix** fails the run (exit 1). **To check** needs a person's judgement: it's often right, sometimes deliberate.

## At each pose

| Check | Level | How it's measured | Threshold | Source |
|---|---|---|---|---|
| **Sideways scroll** (`sideways`) | To fix | The page's `scrollWidth` against the viewport width. Lists the elements reaching furthest past the right edge that nothing clips | 1px | Any pose that scrolls sideways is broken. Safari shrinks such a page to fit, which makes everything smaller |
| **Controls on the crease** (`crease`) | To fix | On "Open" (951 wide), every link, button, field and tab whose box straddles x = 475.5, the centre of the inner screen, including those inside iframes | Narrower than 240px; links inside a sentence don't count | Apple: buttons in the fold are hard to tap, so keep interactive elements out of it; scrolling content may cross. A row or card wider than 240px is content crossing, not a control, and so is a link inside running text, which can't move without reflowing the paragraph |
| **Fixed controls on the crease, open tall** (`crease-h`) | To check | On "Open, tall", fixed or sticky controls straddling the horizontal crease. Scrolling content isn't checked: it passes over the line and moves on | Crosses the line | Same rule. The line's height inside Safari's page (y ≈ 426.5) is **estimated**, so this stays "to check" until it's measured in Safari |
| **Fixed bars take too much** (`bars`) | To fix below 400px tall; to check otherwise | Fixed and sticky bars in the first screen (full-screen overlays aside), as a share of the height | 40% when the screen is under 400px tall ("Closed, wide" is 368); 50% elsewhere | Safari's own bars already take the rest. On a 368px screen a header plus a chat bubble can leave a third for the page |
| **Fixed bars cover controls** (`covered`) | To fix | A control in the first screen with at least half its area under a fixed bar it isn't part of | Half the control | It can't be tapped |
| **Overlay open on load** (`overlay`) | To check | A fixed element covering more than 85% of the screen at load | 85% | Usually a consent wall or a modal. Check its close button fits on a 368px screen |
| **Grid with a column on the crease** (`grid`) | To check | On "Open", a grid at least 60% of the width with three or more roughly equal columns (an odd number), where x = 475.5 falls inside a column rather than a gap | Odd count, equal within 30% | Apple: prefer an even number of columns, so content divides cleanly either side of the fold. Two-column label-and-value rows are text, not a card grid, and aren't flagged |
| **Background colour** (`background`) | To check | On "Closed", the page's background against what's actually at the right edge, where Safari's column meets the page, at three heights | RGB distance over 60, at two of three points | WebKit: Safari doesn't draw the page behind its side column; it extends the page's background colour into it. A dark body behind a light page shows as a dark strip |

## On the page's CSS

The audit reads every inline `<style>` and linked stylesheet (cross-origin ones through Playwright, which isn't bound by CORS), and walks the rules with their surrounding `@media`.

| Check | Level | What it looks for | Why |
|---|---|---|---|
| **Heights in vh** (`vh`) | To check | `height`, `min-height` or `max-height` in `vh` with no `dvh`, `svh` or `lvh` in the same rule | With Safari's bars showing, `100vh` is the large height: 38px taller than what's visible on the closed screen (618 against 580). Full-height heroes push their buttons under the bars |
| **Hover-only content** (`hover`) | To check | A rule that shows or hides something (`display`, `visibility`) on `:hover` of an ancestor, outside `@media (hover: hover)` | Every iPhone Duo pose is touch. A menu that opens on hover is unreachable or sticky |
| **One edge's inset for both sides** (`insets`) | To check | `padding` or `margin` shorthand using `safe-area-inset-left` or `-right` without the other, or a right side set from the left inset | The closed screen's side insets differ (Safari's column is on one side). One value for both is wrong on one side |
| **Header padded by the top inset** (`top-inset`) | To check | A header, nav or top bar with `padding-top` from `safe-area-inset-top` | In-app browsers (Instagram, LinkedIn) report a large top inset under their own toolbar, opening a dead strip above the nav (measured by duo-ready on iOS 26.5) |
| **`viewport-fit=cover` with no insets** (`cover`) | To check | The viewport meta asks for `cover` and no CSS uses a safe-area inset | Content can run under system UI. WebKit says most sites using `cover` don't inset all four edges |

## Behaviour

Three comparisons at the "Open" size. Each compares the visible controls in the first two screens (which ones, where, how wide) and the page height against a fresh load. Two fresh loads are compared first: if the page differs from itself (a rotating banner, a randomised hero), the comparisons below drop to "to check" and say so.

| Check | Level | How | Why |
|---|---|---|---|
| **Layout after opening** (`resize`) | To fix | Load at "Closed" (382 × 580), resize to the mid-fold size (466 × 498) and on to "Open" (951 × 585) without reloading, then compare with a fresh load at "Open" | Opening the device resizes the page without a reload. Code that measured the window once keeps the closed layout on the open screen |
| **User agent** (`ua`) | To check | A fresh load at "Open" with Safari's Mac user agent, compared with the iPhone one | iPhone Duo says "iPhone". A site that picks its layout from that serves a phone layout to a 951px screen. It stays "to check" because some sites differ by user agent on purpose (app banners) |
| **screen.width** (`screen`) | To fix | A fresh load at "Open" with `screen` at the closed size (466 × 678), compared with `screen` at the open size | On the Xcode 27.1 simulator, `screen.width` stays at the closed value after opening. Layout read from it is wrong when open |

A comparison counts as changed when three or more controls appear or disappear, when at least three controls (and a quarter of them) move or resize by more than 12px, or when the page height differs by more than 15%.

## What it can't see

- **Safari's own UI.** Emulation draws no bars. Their effect on your page (the viewport sizes) is modelled exactly; their look, and the colour Safari paints behind them, need Safari. The [playground](https://marigameo.github.io/iphone-duo-playground/) draws them, and `duo-simulator.sh` shows the real ones.
- **The real fold.** The Viewport Segments and Device Posture APIs are behind flags in Safari 27.1 and off by default, so the audit treats the page as most visitors' Safari does: it never learns it's folded. The enhancement layer in [FIXES.md](FIXES.md#if-the-flags-are-on) is checked in the playground with its flags switch.
- **Taps.** It measures where controls are, not whether a finger lands on them.
- **Pages behind a login.** It loads what an anonymous visitor gets. Audit a logged-in page by pointing it at a local or staging build.

## Self-test

`test/broken.html` has one instance of every problem above. `test/fixed.html` is the same page done right. `node test/selftest.mjs` runs the audit on both and fails unless every problem is found on the first and nothing on the second. Run it after changing a check.
