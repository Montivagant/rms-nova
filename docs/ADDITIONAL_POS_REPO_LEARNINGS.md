# Additional POS/POS-adjacent repo takeaways (smart-pos, TastyIgniter, URY)

These observations supplement the earlier `RESTAURANT_REPO_LEARNINGS` note with concrete findings from three more public POS systems and how we can apply them to Nova.

## surgeharb/smart-pos (Strapi + React private UI + Next.js public UI)
- **Clear surface separation:** A Strapi headless backend feeds two distinct frontends: a React private admin app and a Next.js public app. The Make targets separate production (`make build-prod`) from dev (`make run-postgres-dev`), keeping setup reproducible.
- **Lightweight CMS + storefront pairing:** Strapi content types (e.g., categories) back both surfaces, giving a simple template for marketing/menu surfacing without coupling to the POS UI code.

**Nova applications**
- Mirror the "public vs operator" split for portal vs marketing/guest booking (e.g., host a statically-generated marketing menu/reservation front alongside the portal) while sharing a headless content API.
- Add Make/script shortcuts that stand up a minimal content backend + portal in one go for faster staging smoke tests.

## TastyIgniter (Laravel-based online ordering/reservation platform)
- **Modular core + marketplace posture:** Uses a dedicated `tastyigniter/core` Composer package with a separate repository feed, signaling an extension/theme ecosystem for menu, ordering, and reservation modules.
- **Theming + localization-first:** Ships with Bootstrap-based theming hooks and translation scaffolding (Packagist badges + localization widgets in the README) to support white-label and multi-lingual deployments.

**Nova applications**
- Package Nova modules (POS, loyalty, payments, inventory) as plug-in style components within the monolith to enable opt-in deployments per tenant and future marketplace distribution.
- Establish a theming surface (design-system tokens + layout slots) for white-label portal experiences and ensure translation keys exist for customer-facing flows before production rollout.

## URY (ERPNext-backed restaurant ERP)
- **Operational gating:** Enforces POS Opening/Closing entries before table actions, keeping cash control tied to shift lifecycle.
- **High-velocity order UI:** Single-page order flow with course navigation, double-click detail vs. single-click add, dynamic header search, and favorites for returning customers.
- **Table health + transfers:** Visual table states (attention/occupied/free/active) with table/captain transfer actions and inline timers for overstay detection.
- **Order log discipline:** Status-bucketed order log (Draft, Unbilled, Recently Paid, Paid/Consolidated/Return) with edit/print/payment/cancel affordances.
- **Printer/KDS resilience:** Multiple KOT printing paths (QZ, network printers, websocket fallback) keep kitchen tickets flowing even when the preferred channel is down.

**Nova applications**
- Add shift-based POS gating (open/close required) and table attention timers so refunds, captures, and bill settlements are always tied to a tracked shift.
- Bring table/captain transfer controls and per-course navigation into the POS UI, and surface favorites/repeat-items for known customers to reduce order latency.
- Implement an order-log view segmented by fulfillment status with reprint/payment/cancel affordances to tighten auditability.
- Add a pluggable printing/KDS abstraction with a websocket-based fallback for local/staging, while supporting network printers for production pilots.

## Cross-system recommendations to fold into the Nova roadmap (staging-first)
- **POS shift discipline:** Implement POS opening/closing flows with table attention timers and block table actions until a shift is open (inspired by URY).
- **Guest-facing surface:** Host a marketing/reservation/menu microsite (static/Next) backed by the same content API the portal uses, mirroring the smart-pos public/private split.
- **Extension/theming posture:** Treat Nova modules as installable packages with theme/locale hooks (TastyIgniter pattern) so we can ship tenant-specific bundles without forking.
- **Resilient KDS/printing:** Ship a multi-channel printing/KDS layer (QZ/network/websocket) with clear fallbacks to avoid operational dead-ends on staging and pilot sites.
