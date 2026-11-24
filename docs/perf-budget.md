# Performance budget: logging screen

The logging screen is opened mid-set, between racks, on a phone. It has to be usable within a couple of seconds of a cold load on a mid-range phone, then never wait on the network again. This budget is set before any UI code and `bun run size` enforces the byte caps in CI.

## Measurement conditions

- **Cold load.** Lighthouse mobile defaults: simulated slow 4G (150 ms RTT, 1.6 Mbps down), 4x CPU slowdown, Moto G Power viewport. Run `npx lighthouse` headless against the production build served by `vite preview`, 3 runs, report the median.
- **Field thresholds** come from web.dev Core Web Vitals ("good" at the 75th percentile): LCP ≤ 2.5 s, INP ≤ 200 ms, CLS ≤ 0.1. Lighthouse scores TBT as the lab stand-in for INP, with 200 ms as its "good" control point on mobile.

## Byte caps (production build, gzip)

| Asset | Cap | Why |
| --- | --- | --- |
| Initial JS (all `<script>` and modulepreload chunks reachable from `index.html`) | 90 KB | React 19 + react-dom is about 60 KB gzip. The rest covers UI SDK parts, the engine and the app. Preact compat would cut this sharply but only counts if UI SDK works on it. |
| CSS | 8 KB | One stylesheet, hand-written from the mockup tokens. `@ui-sdk/core/web.css` is not imported wholesale. |
| Fonts | 60 KB total (raw woff2, already compressed) | The mockup's two variable fonts are 140 KB together. Subset both to Basic Latin plus the glyphs the UI uses (`× − ✓ · ’ …`), keep the weight axis. Preload only fonts that render in the first paint: both do (Geist for the text, Geist Mono for the weight and reps numbers). Measured with applied mobile throttling: without the Mono preload it lands 0.56 s after first paint, so the numbers paint in a fallback face and swap (CLS 0.0003); with it, Mono is ready 0.45 s before first paint at a cost of 43 ms FCP. |
| Service worker | 3 KB | Hand-written precache, no workbox runtime. |

The size check (`bun run size`) reads `dist/`, gzips each JS and CSS file at level 9, and fails when a cap is exceeded. It also fails on font bytes over the cap.

## Timing targets (Lighthouse mobile, median of 3)

| Metric | Target | Lighthouse "good" |
| --- | --- | --- |
| Performance score | ≥ 95 | 90 |
| FCP | ≤ 1.8 s | 1.8 s |
| LCP | ≤ 2.0 s | 2.5 s |
| TBT | ≤ 100 ms | 200 ms |
| CLS | 0 (≤ 0.02 hard limit) | 0.1 |
| Speed Index | ≤ 2.5 s | 3.4 s |

LCP is the big weight number or the exercise title. Both are text, so LCP is bounded by HTML + JS + CSS + one font. `font-display: swap` with metric-compatible fallbacks keeps text visible while the font loads; the fields reserve their size so the swap moves nothing (CLS 0).

## INP (lab proxy)

INP needs real interactions, so it is measured locally with Playwright on the production build:

1. Chromium at 390x844, CPU throttled 4x through CDP `Emulation.setCPUThrottlingRate`.
2. A `PerformanceObserver` for `event` entries with `durationThreshold: 16` is installed before interacting.
3. Tap the weight `+` stepper 10 times, tap an RIR segment, then tap "Log set".
4. Report the worst `duration` per interaction (`interactionId > 0`). Target: worst ≤ 100 ms, hard limit 200 ms.

## Runtime rules that protect the budget

- No WebGL, no animation library, no analytics, no third-party requests. The only network traffic is the app's own shell, and after the first load the service worker serves it.
- Timers recompute from absolute timestamps and wake only when the shown second changes (and when the page is shown again); no per-frame work.
- IndexedDB reads happen once at startup, in parallel with the first render of the shell.
