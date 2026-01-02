---
description: Implement Progressive Web App (PWA) features
---

# PWA Implementation

1.  **Dependencies**: Install `next-pwa` or `@ducanh2912/next-pwa`.
2.  **Manifest**: Create `public/manifest.json` with app details and icons.
3.  **Icons**: Ensure PWA icons exist in `public/` (I might need to generate placeholders if not present, but user has `logo.png`).
4.  **Configuration**: Update `next.config.ts` to wrap with PWA config.
5.  **Metadata**: Update `src/app/layout.tsx` with PWA-specific viewport and metadata configurations (apple-touch-icon, etc).
