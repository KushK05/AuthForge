---
version: alpha
name: AuthForge
description: Developer console for a temporary AWS authentication showcase.
colors:
  ink: "#0B1720"
  slate: "#10232D"
  canvas: "#0B1720"
  surface: "#17313C"
  line: "#2A4651"
  signal: "#D8F26B"
  success: "#4ECF8F"
  danger: "#FF8B7C"
typography:
  sans:
    fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
  mono:
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"
rounded:
  sm: "0.375rem"
  DEFAULT: "0.625rem"
  lg: "1rem"
spacing:
  page-max: "90rem"
  shell-gap: "2rem"
  section-gap: "2rem"
components:
  button: {}
  field: {}
  panel: {}
  dialog: {}
  toast: {}
---

# AuthForge design system

## Overview

### Creative North Star

The console should feel like the hosted identity-routing surface brought into a control plane: midnight blue, cool informational copy, and a lime state signal. The configuration rail stays dense and operational without making the credential and session surfaces theatrical.

### Product context and register

- **Audience and primary job:** A demo user signs up or signs in to a hosted identity flow; a demo operator creates API keys and observes application sessions.
- **Target market(s) and evidence:** English-language temporary AWS showcase, defined by `README.md` and `docs/API_CONTRACTS.md`.
- **Locale(s) and language policy:** English only. Dates use the browser locale because the temporary console has no locale preference service.
- **Usage scene:** Laptop or desktop during a live demo, with mobile support for inspection and emergency key revocation.
- **Register:** Product.
- **Memorable signature:** The midnight shell, nested configuration rail, and lime state signal establish the identity-control-plane character.
- **Restraint:** Data tables, dialogs, fields, and destructive controls are plain and familiar. Static previews never imply that a backend setting was persisted.
- **Anti-references:** Avoid consumer social-app styling, neon "cybersecurity" motifs, generic metric-card dashboards, organizations, billing, and production-account administration.
- **Token ownership/runtime mapping:** This file is the visual source of truth. The small server-rendered console maps its tokens directly to CSS custom properties in `src/api/dashboard-page.ts`.

## Colors

`ink` and `slate` build the console frame and nested configuration panels. `canvas` and `surface` establish the layered midnight workspace. `signal` is reserved for active navigation and configuration states. `success` and `danger` always include text or icon context. Focus uses a visible cyan ring derived from the hosted identity route.

## Typography

The UI uses the sans stack for all interface copy and the mono stack only for prefixes, identifiers, and one-time secrets. Sentence case is used throughout. Titles are compact and strong; metadata stays readable at 13px or larger.

## Layout

The desktop shell uses one fixed-width configuration rail and a fluid document-scrolling workspace. The rail groups user authentication, sessions, and developer tools into an explicit hierarchy. At narrow widths the rail is removed and the workspace remains focused. Lists have bounded height with their own visible scrollbars.

## Elevation & Depth

Panels use layered charcoal surfaces, dark edges, and a minimal grounding shadow. Overlays darken the page with a translucent ink layer. Static content never uses dramatic shadows.

## Shapes

Fields and controls use `sm`; panels use `lg`. Buttons are rectangular with modest rounding. Toggles, chips, and status dots are the only pill-like shapes.

## Components

### Foundational visual states

Buttons and inputs show hover, focus-visible, pressed, disabled, busy, and error states. Forms reserve help and error space. Loading leaves panel geometry intact. Motion is limited to short feedback transitions and is removed when reduced motion is requested.

### Buttons and actions

Solid slate buttons perform the main action. Outline controls are secondary. Danger controls are separated from primary actions and require the app-owned confirmation dialog. Busy buttons keep their dimensions and cannot be submitted twice.

### Navigation and data display

Navigation is a real button group with `aria-current` for the active view. The overview is operational guidance, API keys are a lifecycle list, and sessions are a bounded, scrollable table-like list. Long identifiers wrap or truncate safely.

### Forms and overlays

Native labeled inputs provide the baseline interaction. Sign-up and sign-in use full labels, password-manager semantics, and inline errors. Errors are announced through a polite live region. The single shared dialog confirms revocation and restores focus when dismissed. A single toast acknowledges successful operations without displaying secrets.

### Iconography

Text labels are preferred because this console is a temporary, low-density operational surface. Simple Unicode symbols are decorative only and never carry an action's meaning alone.

### Motion

Feedback transitions complete within 160ms. No decorative motion runs automatically. Reduced motion removes all transitions.

### Content and data visualization

Copy describes concrete actions: create, copy, revoke, lock. Secrets are only rendered in the one-time reveal panel and are never included in toasts or list items.

## Do's and Don'ts

- **Do:** Keep the next demo action visible from the overview.
- **Do:** Explain the effect of revocation before the operator confirms it.
- **Don't:** Treat placeholder text as a field label.
- **Don't:** Put raw secrets in persistent lists, browser dialogs, or feedback messages.
