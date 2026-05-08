## Goal

Re-sequence the boot so **Device Identity (Hub Provisioning Code) runs first**, then **Human Identity (Email OTP)** is gated against the specific business the device just provisioned. Also ensure the auth email delivers a 6-digit code (not a magic link).

---

## 1. Remove TenancyProvider from the root

**File:** `src/routes/__root.tsx`

- Delete the `import { TenancyProvider } from "@/providers/TenancyProvider"` line.
- Unwrap `<TenancyProvider>` from around `<Outlet />` in `RootComponent` so the root only renders `QueryClientProvider → LiquidOSErrorBoundary → Outlet`.

Result: visiting any route boots straight into LiquidOS with no auth prompt.

---

## 2. Rewrite `src/providers/TenancyProvider.tsx`

Adopt the user-supplied contract:

- New props: `provisionedBusinessId: string`, `onUnprovisionDevice: () => void`, `children`.
- Resolution query becomes strictly scoped:
  ```
  business_users
    .eq("user_id", session.user.id)
    .eq("business_id", provisionedBusinessId)   // STRICT
    .eq("is_active", true)
  ```
- Add the `RotateCcw` icon and an "Unbind Device" button on the `rejected` screen that calls `onUnprovisionDevice` (in addition to the existing Sign Out).
- Re-run resolution when `provisionedBusinessId` changes (effect dep).
- Restore the typed state (`useState<AuthStatus>("booting")`, `useState<ResolvedTenancy | null>(null)`) and the proper JSX that the user's pasted snippet had stripped — the existing TSX layout (Loader2 booting screen, AuthGate, rejected screen, ActiveBusinessContext.Provider passing `businessId/role/pii/logout/provisioningCode`) is kept verbatim, only the query and the rejected-screen action row change.

---

## 3. Rewrite `src/lib/idia/LiquidOS.tsx`

- Import `TenancyProvider` from `@/providers/TenancyProvider`.
- Keep Phase 1 (`provisioning`) **outside** any auth wrapper — the hub code form stays publicly accessible.
- Compute `tenantId = (phase.carton.raw as any)?.business_id` once Phase 1 completes.
- Wrap **Phase 2 (`selection`) and Phase 3 (`operational`)** inside:
  ```tsx
  <TenancyProvider
    provisionedBusinessId={tenantId}
    onUnprovisionDevice={reset}
  >
    {/* selection / operational JSX */}
  </TenancyProvider>
  ```
- `NanoBiteRenderer` keeps `ActiveBusinessProvider` as a nested pass-through (TenancyProvider is the authoritative writer; ActiveBusinessProvider just forwards `businessId` + `provisioningCode` to the existing Nano-Bite contract).
- Preserve all existing JSX, gesture handlers, sidebar state, `DynamicNanoBite`, `BrandMark`, `uniqueScreens`, `prettyTitle`, `isPaymentSpec`, and `recordExecution` flow — only the wrapper around Phases 2/3 changes.

---

## 4. Magic-link → 6-digit code

Client code is already correct: `AuthGate.tsx` calls `signInWithOtp({ email })` and verifies with `verifyOtp({ type: "email", token })`. Supabase decides link-vs-code purely from the **Magic Link email template** in the dashboard.

Required (one-time, dashboard, not code):
- Open **Supabase → Authentication → Email Templates → Magic Link**.
- Replace the body's `{{ .ConfirmationURL }}` with `{{ .Token }}` so the email contains the 6-digit code instead of a clickable link.
- Save.

No code changes needed for this step — the existing AuthGate already consumes the token. Since you confirmed the IDIA Life infrastructure already has the OTP template, this step may already be done; if codes still aren't arriving after the template swap, we'll inspect Supabase Auth logs.

---

## Technical notes

- `provisioningCode` continues to flow through `ActiveBusinessContext` from the `ActiveBusinessProvider` inside `NanoBiteRenderer`, so existing Nano-Bites that read `useActiveBusinessId()` keep working unchanged.
- `handleLogout` stays a module-level helper calling `supabase.auth.signOut()`; on sign-out, `onAuthStateChange` flips status to `unauthenticated` → AuthGate re-mounts inside the same provisioned tenancy.
- `onUnprovisionDevice` (= `LiquidOS.reset`) clears `localStorage[idia_terminal_provision_code]` and returns the shell to Phase 1, fully unbinding the device.
- No DB migrations, no edge function changes, no new packages.

---

## Files touched

1. `src/routes/__root.tsx` — remove TenancyProvider wrap.
2. `src/providers/TenancyProvider.tsx` — new strict-business-scoped contract + Unbind action.
3. `src/lib/idia/LiquidOS.tsx` — wrap Phases 2/3 in TenancyProvider, pass `tenantId` and `reset`.
4. (Dashboard, not a file) Supabase Magic Link template → use `{{ .Token }}`.
