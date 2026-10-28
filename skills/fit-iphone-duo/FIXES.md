# Fixing what the audit finds

Fix the cause in the site's own code, in the order below: the earlier fixes often clear later findings. Every fix here works at any width. None of them detects iPhone Duo, because nothing should: a layout that holds from 382 to 951 pixels wide is right on this device and on the next one.

The one exception is the crease, which only exists on the open screen. Even there, the first choices are design fixes that hold everywhere. A width-scoped rule comes last, and comes with a comment that says when to delete it.

## Sideways scroll

The report names the elements reaching past the edge. Usually one of these:

```css
img, video, iframe, svg, canvas { max-width: 100%; height: auto; }
/* Flex and grid children default to min-width: auto and refuse to shrink below their content */
.row > *, .grid > * { min-width: 0; }
/* Long words, URLs and code */
.prose { overflow-wrap: anywhere; }
pre, table { max-width: 100%; overflow-x: auto; }
```

A fixed width (`width: 420px`) becomes `width: 100%; max-width: 420px`. A `100vw` element becomes `100%`, because `vw` includes the scrollbar gutter on some browsers.

## Controls on the crease

On the open screen the fold runs down the centre. Small controls there are hard to tap when the device is partly folded. Text, images and wide rows may cross it. In order of preference:

1. **Pair it.** Two buttons of equal width with the gap centred put the gap on the crease, not a button. This is a better layout at any width, so it needs no media query.
   ```css
   .cta { display: flex; justify-content: center; gap: 16px; flex-wrap: wrap; }
   .cta > * { flex: 0 1 200px; min-width: 0; }
   ```
   A pair only protects the crease while it stays a pair. If its container shrinks to fit its content (it sits in `display: grid; place-items: center`, or `inline-block`), the buttons wrap onto two lines and each lands alone on the centre. Give the container its full width (`width: 100%`).
2. **Even rows.** A centred row of 3 icons or links puts the middle one on the crease. Make it 2 or 4 items of equal width, or align the row to one side.
3. **Move it to one side** on wide screens, next to the content it acts on. Apple asks controls to sit near what they affect anyway.
   ```css
   .hero { container: hero / inline-size; }   /* a container query needs a declared container */
   @container hero (min-width: 760px) { .hero-actions { justify-content: flex-start; } }
   ```
4. **Nav triggers.** A desktop nav whose middle item lands on the centre: put the gap there with `justify-content: space-between` around two groups, or reorder so the centre falls between items.
5. **Last resort, scoped and labelled.** When the layout has to stay centred on desktop:
   ```css
   /* The crease of an open book-style foldable (iPhone Duo: 951px wide in Safari 27.1). No web API reports it
      by default, so this guesses from width and touch. Delete when the Viewport Segments API ships unflagged. */
   @media (pointer: coarse) and (min-width: 900px) and (max-width: 1000px) {
     .hero-buy { transform: translateX(calc(50% + 24px)); }
   }
   ```

Re-run the audit. A fix that moves a control off the crease at 951 shouldn't push it onto something else.

## Grids across the crease

Three equal columns put the middle card on the fold. Use two or four on wide screens:

```css
.cards-section { container-type: inline-size; }   /* the cards' parent; without it the queries below never match */
.cards { display: grid; gap: 20px; grid-template-columns: minmax(0, 1fr); }
@container (min-width: 600px) { .cards { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@container (min-width: 1100px) { .cards { grid-template-columns: repeat(4, minmax(0, 1fr)); } }
```

`repeat(auto-fit, minmax(280px, 1fr))` often lands on three columns at 951 wide. Prefer explicit even counts.

## Fixed bars on a short screen

"Closed, wide" gives the page 594 × 368. Sticky headers, chat bubbles, cookie and app banners stack up fast.

```css
/* Short screens: the banner joins the page instead of floating over it */
@media (max-height: 420px) {
  .cookie-banner, .app-banner { position: static; }
  .site-header { position: static; }          /* or: hide on scroll down, show on scroll up */
  .chat-launcher { transform: scale(0.8); bottom: 8px; right: 8px; }
}
/* Anything fixed and tall scrolls inside itself, close button first */
.modal { max-height: 90dvh; overflow-y: auto; }
```

For a third-party widget in an iframe (chat, consent), use the vendor's setting for position, size or "hide on mobile" before overriding its frame. Keep the close or minimise control reachable at 368px tall.

## Heights in vh

`100vh` in Safari is the height with its bars hidden, so a full-height section is taller than the screen while they show.

```css
.hero { min-height: 100vh; min-height: 100svh; }   /* fallback first: svh is what's visible with the bars shown */
.app-shell { height: 100dvh; }                     /* tracks the bars as they collapse */
```

Use `svh` for "fits with the bars showing" and `dvh` for "follows the bars". Most heroes want `svh`, or no forced height at all.

## Sizes read once

Opening the device resizes the page without a reload, and fires 2 or 3 `resize` events on the way, including a mid-fold size that matches no pose.

- **Prefer CSS.** Media queries and container queries re-apply on their own.
- **When JavaScript must measure,** observe instead of reading once:
  ```js
  const ro = new ResizeObserver(([entry]) => layout(entry.contentRect.width));
  ro.observe(container);
  ```
- **Swap a whole layout only once the size settles** (about 150ms without a resize). Don't debounce ordinary reflow.
- **Never lay out from `screen.width` or `screen.height`.** On the Xcode 27.1 simulator they keep the closed values after opening.
- **Carousels, charts, maps and embeds** sized on mount need their own resize hook. Most libraries have an `update()` or `resize()` call for this.

## User-agent branching

iPhone Duo's user agent says "iPhone", so a `/iPhone/` check serves the phone layout to the 951px open screen. Replace device checks with what you actually need to know:

```js
matchMedia('(pointer: coarse)').matches   // touch input
matchMedia('(hover: hover)').matches      // can hover
matchMedia('(min-width: 760px)').matches  // has room
```

If the server picks a template by user agent ("m-dot" sites, dynamic serving), serve one responsive page, or at least send tablet-width iPhones the full one.

## Hover-only menus

Every pose is touch. Open on tap, keep hover as an extra:

```css
.menu:focus-within > .submenu, .menu.is-open > .submenu { display: block; }
@media (hover: hover) and (pointer: fine) { .menu:hover > .submenu { display: block; } }
```

Toggle `.is-open` on click, close it on Escape and on a click outside, and set `aria-expanded` on the trigger.

## Safe areas

The closed screen's side insets differ, because Safari's column is on one side. Set each edge from its own inset:

```css
.bar {
  padding-left: max(16px, env(safe-area-inset-left));
  padding-right: max(16px, env(safe-area-inset-right));
}
```

- Write `env()` inline in each declaration rather than through a custom property. Some WebKit builds drop the whole declaration when the substitution fails.
- Only add `viewport-fit=cover` if you inset all four edges.
- Don't pad a fixed header by `safe-area-inset-top` unless the page draws under the status bar. In-app browsers report a large top inset under their own toolbar, and the padding becomes a dead strip.

## Background colour

Safari doesn't draw the page behind its side column on the closed screen. It extends the page's background colour into it. If `body` is dark and the page is light (or the reverse), that column shows the wrong colour beside your content.

```css
html { background: #faf9f5; }  /* the colour of the page's edges, usually the main section's */
```

For a page whose sections change colour, choose the colour of the top section, since that's what's beside the column most of the time.

## If the flags are on

Safari 27.1 has the Device Posture and Viewport Segments APIs behind flags, off by default. Treat them as an enhancement and never depend on them. These widen the gaps you already made so they span the fold exactly, when a browser reports it:

```css
@media (horizontal-viewport-segments: 2) {
  .cta   { gap: calc(env(viewport-segment-left 1 0) - env(viewport-segment-right 0 0) + 24px); }
  .cards { column-gap: calc(env(viewport-segment-left 1 0) - env(viewport-segment-right 0 0) + 20px); }
}
@media (device-posture: folded) {
  /* Book pose: Apple moves alerts to the trailing side. A dialog can do the same: */
  .dialog { margin-left: env(viewport-segment-left 1 0, auto); }
}
```

```js
if ('devicePosture' in navigator) navigator.devicePosture.addEventListener('change', relayout);
const segments = window.viewport?.segments; // DOMRects, one per segment; check again on resize
```

Try it in the [playground](https://marigameo.github.io/iphone-duo-playground/) with the flags switch on and the open device folded. Apple's advice for the fold is to move only what's needed and keep every control reachable in every pose. A two-pane redesign for book pose is a product decision, not a fix.
