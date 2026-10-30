# iPhone Duo audit

Ran 2026-10-30 in Playwright WebKit 27.2 at the viewports WebKit published for Safari 27.1 (`poses.json`, collected 2026-10-27). This is emulation: the right engine family and sizes, not Safari 27.1 itself. Confirm in Safari before calling it done (`duo-simulator.sh`, or a device). Pages are measured with reduced motion on, so animations are stopped where the page's reduced-motion styles leave them.

The visual report is `duo-report.html`. Triage: one entry per item key below in `duo-triage.json` (SKILL.md, step 3).

## http://localhost:4173/broken.html

| Pose | Viewport | Sideways scroll | Controls on the crease | Fixed bars |
|---|---|---|---|---|
| Closed | 382 × 580 | **yes** | – | 32% |
| Closed, wide | 594 × 368 | no | – | 50% |
| Open | 951 × 585 | no | **1** | 31% |
| Open, tall | 669 × 867 | no | – | 21% |
| Split View | 385 × 571 | **yes** | – | 32% |

### To fix (8)

- **Scrolls sideways** (Closed, 382 × 580). Fix: [FIXES.md](../FIXES.md#sideways-scroll)
  - `figure.app-shot` reaches x = 444 (420px wide)
- **Fixed bars take too much of the screen** (Closed, wide, 594 × 368). Fix: [FIXES.md](../FIXES.md#fixed-bars-on-a-short-screen)
  - 50% of the height:
    - `header.wrap` 64px tall at y 0
    - `div.banner` 120px tall at y 248
- **Fixed bars cover controls** (Closed, wide, 594 × 368). Fix: [FIXES.md](../FIXES.md#fixed-bars-on-a-short-screen)
  - `a.lone` "Start writing, free" under `div.banner`
- **Controls on the crease** (Open, 951 × 585). Fix: [FIXES.md](../FIXES.md#controls-on-the-crease)
  - `a.lone` "Start writing, free" spans x 376–576, page y 401
- **Fixed bars cover controls** (Open, 951 × 585). Fix: [FIXES.md](../FIXES.md#fixed-bars-on-a-short-screen)
  - `button` "macOS" under `div.banner`
  - `button` "Windows" under `div.banner`
  - `button` "Linux" under `div.banner`
- **Scrolls sideways** (Split View, 385 × 571). Fix: [FIXES.md](../FIXES.md#sideways-scroll)
  - `figure.app-shot` reaches x = 444 (420px wide)
- **Layout after opening differs from a fresh load at the open size** (Open, 951 × 585). Fix: [FIXES.md](../FIXES.md#sizes-read-once)
  - 0 controls moved, 7 missing, 3 extra; page height differs by 5%
- **Layout depends on screen.width, which stays at the closed size after opening** (Open, 951 × 585). Fix: [FIXES.md](../FIXES.md#sizes-read-once)
  - 4 controls moved, 3 missing, 3 extra; page height differs by 5%; e.g. `BUTTON:Q3 pricing`, `BUTTON:Onboarding v2`, `BUTTON:Mobile nav`, `BUTTON:Brand refresh`

### To check (7)

- **Page background doesn't match the page at the edge** (Closed, 382 × 580). Fix: [FIXES.md](../FIXES.md#background-colour)
  - page background rgb(17, 17, 17); at the right edge: rgb(250, 248, 243), rgb(250, 248, 243), rgb(24, 22, 15)
- **Grid with a column on the crease** (Open, 951 × 585). Fix: [FIXES.md](../FIXES.md#grids-across-the-crease)
  - `div.grid`, 3 columns
- **Heights in vh**. Fix: [FIXES.md](../FIXES.md#heights-in-vh)
  - `.hero`: sets the height at Open, tall
- **Content revealed on hover only**. Fix: [FIXES.md](../FIXES.md#hover-only-menus)
  - `.menu:hover > .sub`
- **Safe-area insets applied to both sides from one edge**. Fix: [FIXES.md](../FIXES.md#safe-areas)
  - `.wrap`
- **Fixed header padded by safe-area-inset-top**. Fix: [FIXES.md](../FIXES.md#safe-areas)
  - `header`
- **Layout differs between the iPhone and Mac user agents at the same size** (Open, 951 × 585). Fix: [FIXES.md](../FIXES.md#user-agent-branching)
  - 0 controls moved, 0 missing, 5 extra; page height differs by 0%

### Items to triage (14)

- `sideways:figure-app-shot`: Scrolls sideways, `figure.app-shot`
- `background`: Page background doesn't match the page at the edge
- `bars:closed-landscape`: Fixed bars take too much of the screen
- `covered:closed-landscape`: Fixed bars cover controls
- `crease:a-lone:start-writing-free`: Controls on the crease, `a.lone` "Start writing, free"
- `grid:div-grid`: Grid with a column on the crease, `div.grid`
- `covered:open-landscape`: Fixed bars cover controls
- `vh:hero`: Heights in vh, `.hero`
- `hover:menu-hover-sub`: Content revealed on hover only, `.menu:hover > .sub`
- `insets:wrap`: Safe-area insets applied to both sides from one edge, `.wrap`
- `top-inset:header`: Fixed header padded by safe-area-inset-top, `header`
- `resize`: Layout after opening differs from a fresh load at the open size
- `ua`: Layout differs between the iPhone and Mac user agents at the same size
- `screen`: Layout depends on screen.width, which stays at the closed size after opening

## http://localhost:4173/edge.html

| Pose | Viewport | Sideways scroll | Controls on the crease | Fixed bars |
|---|---|---|---|---|
| Closed | 382 × 580 | no (clipped at the edge) | – | 12% |
| Closed, wide | 594 × 368 | no (clipped at the edge) | – | 18% |
| Open | 951 × 585 | no (clipped at the edge) | 0 (+1 moving) | 11% |
| Open, tall | 669 × 867 | no (clipped at the edge) | – | 7% |
| Split View | 385 × 571 | no (clipped at the edge) | – | 12% |

### To fix (0)

Nothing.

### To check (13)

- **Cut off at the edge (the page clips sideways, so it doesn't scroll)** (Closed, 382 × 580). Fix: [FIXES.md](../FIXES.md#sideways-scroll)
  - `div.release-strip` reaches x = 406 (382px wide)
- **A full-screen overlay is open on load** (Closed, 382 × 580). Fix: [FIXES.md](../FIXES.md#fixed-bars-on-a-short-screen)
  - `div.grain`
- **Cut off at the edge (the page clips sideways, so it doesn't scroll)** (Closed, wide, 594 × 368). Fix: [FIXES.md](../FIXES.md#sideways-scroll)
  - `div.release-strip` reaches x = 618 (594px wide)
- **A full-screen overlay is open on load** (Closed, wide, 594 × 368). Fix: [FIXES.md](../FIXES.md#fixed-bars-on-a-short-screen)
  - `div.grain`
- **Cut off at the edge (the page clips sideways, so it doesn't scroll)** (Open, 951 × 585). Fix: [FIXES.md](../FIXES.md#sideways-scroll)
  - `div.release-strip` reaches x = 975 (951px wide)
- **Moving controls on the crease, measured where reduced motion stops them** (Open, 951 × 585). Fix: [FIXES.md](../FIXES.md#controls-on-the-crease)
  - `a` "Ferro" spans x 344–484, page y 580
- **A full-screen overlay is open on load** (Open, 951 × 585). Fix: [FIXES.md](../FIXES.md#fixed-bars-on-a-short-screen)
  - `div.grain`
- **Cut off at the edge (the page clips sideways, so it doesn't scroll)** (Open, tall, 669 × 867). Fix: [FIXES.md](../FIXES.md#sideways-scroll)
  - `div.release-strip` reaches x = 693 (669px wide)
- **Fixed controls on the crease (open, tall; its height is estimated)** (Open, tall, 669 × 867). Fix: [FIXES.md](../FIXES.md#controls-on-the-crease)
  - `button.feedback` "Feedback" 
- **A full-screen overlay is open on load** (Open, tall, 669 × 867). Fix: [FIXES.md](../FIXES.md#fixed-bars-on-a-short-screen)
  - `div.grain`
- **Cut off at the edge (the page clips sideways, so it doesn't scroll)** (Split View, 385 × 571). Fix: [FIXES.md](../FIXES.md#sideways-scroll)
  - `div.release-strip` reaches x = 409 (385px wide)
- **A full-screen overlay is open on load** (Split View, 385 × 571). Fix: [FIXES.md](../FIXES.md#fixed-bars-on-a-short-screen)
  - `div.grain`
- **viewport-fit=cover with no safe-area insets**. Fix: [FIXES.md](../FIXES.md#safe-areas)

### Items to triage (5)

- `cutoff:div-release-strip`: Cut off at the edge (the page clips sideways, so it doesn't scroll), `div.release-strip`
- `overlay:div-grain`: A full-screen overlay is open on load, `div.grain`
- `crease-moving:a:ferro`: Moving controls on the crease, measured where reduced motion stops them, `a` "Ferro"
- `crease-h:button-feedback:feedback`: Fixed controls on the crease (open, tall; its height is estimated), `button.feedback` "Feedback"
- `cover`: viewport-fit=cover with no safe-area insets
