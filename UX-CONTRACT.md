# AuthForge console UX contract

## Product context

- Audience: One deployment-scoped demo operator.
- Primary jobs: Create, copy, revoke, and inspect API keys and synthetic application sessions.
- Active locales: English.
- Accessibility target: WCAG 2.2 AA.

## Business-context sources

| Domain / scope | Authoritative source | Source type | Reviewed date |
|---|---|---|---|
| Console and API key lifecycle | `docs/API_CONTRACTS.md` | API contract | 2026-10-23 |
| Session lifecycle | `docs/API_CONTRACTS.md` | API contract | 2026-10-23 |
| Credential and data restrictions | `docs/SECURITY.md` | Security policy | 2026-10-23 |

## Visual contract

- Project `DESIGN.md`: `DESIGN.md`
- Token ownership model: `DESIGN.md` is canonical and maps directly to the inline CSS custom properties in `src/api/dashboard-page.ts`.
- Supported themes: Dark only.

## Canonical UI map

| Capability | Canonical owner | Source of truth | Allowed variants | Verification |
|---|---|---|---|---|
| Form | Native labeled forms in `dashboard-page.ts` | This contract | login / create key / static configuration preview | Browser E2E |
| Scrollbar | Global console stylesheet | `dashboard-page.ts` | list geometry only | Browser inspection |
| Toast | `showToast` in `dashboardClient` | This contract | success / error | Browser E2E |
| CRUD | Fastify API routes + dashboard client | `docs/API_CONTRACTS.md` | create / revoke | Browser E2E |

## Component behavior

| Component | Default | Hover | Focus | Disabled | Busy | Error |
|---|---|---|---|---|---|---|
| Button | Label and icon where useful | Visible surface change | 3px ring | Cannot act | Same geometry, spinner | Inline message |
| Input | Visible label and help | n/a | 3px ring | n/a | Preserves value | Inline message |
| Dialog | Closed | n/a | Focus on Cancel | n/a | Confirm disabled | Inline message |

## Flow ledger

| Operation | Trigger | Pending | Success feedback | Failure recovery | Focus outcome | Source ref |
|---|---|---|---|---|---|---|
| Unlock console | Login form | Disable button | Show console | Inline error, retain input | Dashboard title | API contracts |
| Create API key | Key form | Disable button | One-time reveal and toast | Inline error, retain name | Copy key | API contracts |
| Copy API key | Copy button | Button label changes briefly | Toast without secret | Inline error | Copy button | Security policy |
| Revoke API key | Confirm dialog | Disable confirm | List refresh and toast | Inline error, keep dialog open | Triggering revoke button | API contracts |
| Revoke session | Confirm dialog | Disable confirm | List refresh and toast | Inline error, keep dialog open | Triggering revoke button | API contracts |
| Lock console | Header action | Disable button | Return to unlock screen | Inline error | Access-code input | API contracts |

## Navigation and responsive behavior

- The active console view is client-side only and does not alter the URL because the view is operator-private and non-shareable.
- In-scope console views are overview, user and authentication, MFA, sessions, hosted paths, webhooks, and API keys. Organizations, billing, public user administration, social login, and production controls are excluded.
- Authentication, MFA, session policy, hosted paths, and webhook controls are explicitly static previews until their corresponding backend contracts exist. Static actions acknowledge preview state only; no setting is saved.
- At 960px the configuration rail is removed and the primary navigation remains horizontally scrollable. At 700px, cards and forms stack.
- Lists have visible internal scrollbars and do not force the page into a fixed-height layout.

## Overlays and feedback

- Dialog primitive: One accessible app-owned confirmation dialog with Escape, focus trap, Cancel, and focus restoration.
- Destructive confirmation: Required for revoking API keys or sessions. The dialog names the consequence.
- Cancel, Escape, and backdrop dismissal clear the pending action without sending a mutation. Browsing console sections does not revoke credentials.
- Toast: Bottom-right, six seconds, one status message at a time. It never includes a secret.

## Async and resilience

- Mutations are pessimistic. Each control is busy while its request is pending.
- The console rerenders authoritative state after each successful mutation.
- A console session failure returns to the unlock view and explains that the access session has expired or is invalid.

## Validation

- Server-side Zod schemas remain authoritative.
- Browser forms use `noValidate` and show application-owned errors.
- Names are retained after failed API-key creation; access codes are not retained after logout.

## Verification

- Static commands: `npm run build`, `npm run lint`, `npm test`.
- Browser coverage: unlock, empty state, create/copy/revoke key, session inspection/revocation, logout, failure path, keyboard dialog, narrow viewport.

## Hosted authentication

The hosted page restores `{user,csrf_token}` through `/v1/auth/me` on reload. Sign-out keeps the account visible and shows an error if server revocation fails. Secrets are never included in toasts. Console locking and dismissing the one-time API key clear the displayed secret text. Session failures return to the console unlock form. Browser tests exercise the dialog focus trap, signup/reload/signout, key and session revocation, and narrow layouts.
