# Performance and bandwidth review

## Overview
This document highlights loading-efficiency, bandwidth, and storage considerations identified in the current codebase, with actionable recommendations to improve user experience.

## Findings and recommendations

### 1) Third-party analytics loaded on every page
`posthog-js` is initialized for all routes inside `_app.tsx`. This adds an extra network request and payload to every visitor, including unauthenticated flows, and it runs on first render without feature gating or consent checks.

**Recommendation**
- Lazy-load analytics after user consent or when running in production, using dynamic `import()` to avoid blocking the critical path. Wrap initialization in a `useEffect` that is guarded by a flag derived from consent storage.

### 2) Google Fonts pulled from the CDN on each request
The app pulls the Space Mono family via `<link>` tags in `_app.tsx`, which can delay first paint and increase layout shift risk when the font swaps in. The font is also not subsetted, so all styles are downloaded even if unused.

**Recommendation**
- Switch to `next/font` to self-host and automatically subset the exact weights/styles in use. That removes render-blocking requests, enables automatic preloading, and improves caching across pages.

### 3) Large unoptimized PNG assets in `public/`
The `public` folder contains several PNGs in the 200–800 KB range (e.g., `landing-page-banner.png` at ~540 KB and `desk-booking-law-firms-privacy-productivity-infographic.png` at ~831 KB). These ship as-is to clients and are likely served without responsive variants, driving up bandwidth on slower connections.

**Recommendation**
- Convert heavy marketing assets to modern formats (WebP/AVIF) and provide responsive sizes via `next/image`. Use `priority` only where needed (above-the-fold hero) and leverage blur placeholders to avoid jank on slow networks.

### 4) Raw `<img>` elements bypass Next.js image optimizations
Floor plan and occupant avatars in desk-booking components render with plain `<img>` tags, so they miss automatic resizing, lazy-loading, and format negotiation. These images are interactive (zoomable) but still benefit from controlled sizing and lazy-load thresholds.

**Recommendation**
- Replace `<img>` with `next/image` where possible, supplying explicit dimensions and responsive `sizes`. For dynamic floor plans that must preserve intrinsic dimensions, wrap `next/image` with `fill` layout and CSS `object-fit: contain` inside a sized container. Enable `loading="lazy"` for non-critical imagery.

### 5) Client-side floor-plan uploads accept large files without compression
The floor-plan uploader accepts images up to 5 MB and immediately stores them; there is no client-side compression or server-side downscaling before persisting or serving the asset back to end users.

**Recommendation**
- Compress or resize uploads on the client (e.g., with `canvas`/`browser-image-compression`) before sending, and enforce server-side image resizing to sane maximum dimensions. Store multiple derivatives (thumbnail + display) to reduce downstream bandwidth for booking views.

### 6) Static asset caching strategy is unclear
The project does not configure long-lived cache headers for static assets (favicons, PNGs, uploads). Without caching, repeat visits will re-download imagery and fonts.

**Recommendation**
- Configure CDN or Next.js headers to set immutable cache control for versioned assets and short-lived caching for user-uploaded files that can change.

## Quick wins to prioritize
1. Migrate Google Fonts to `next/font` and remove the blocking `<link>` tags.
2. Convert heavy PNGs in `public/` to WebP/AVIF and serve them through `next/image` with responsive sizes.
3. Gate PostHog initialization behind consent and lazy-load it only in production.
4. Adopt `next/image` for floor plans and avatars with lazy loading to cut initial payloads.
