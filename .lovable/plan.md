## Execution Matrix Installation Plan

Install the three-artifact tenancy system (Context + AuthGate + TenancyProvider) and wire it into the app root. Several **conflicts with existing code** must be reconciled before installing — flagging them here for approval before any file is written.

---

### Conflicts found in current architecture

1. **`src/lib/idia/ActiveBusinessContext.tsx` already exists** with a different shape:
   - Current: `ActiveBusinessProvider({ businessId, provisioningCode })` + `useActiveBusinessId()` (returns `string | null`, logs STALL on null).
   - Current consumers: `LiquidOS.tsx`, `ServiceLocation.tsx`, `MobilePosSale.tsx`, `HealthPermitLog.tsx`, `TvAVarianceManager.tsx` — all call `useActiveBusinessId()` and expect the existing return contract.
   - Proposed file changes the contract (adds `role`, `pii`, `logout`, drops `provisioningCode`, drops `ActiveBusinessProvider` export).
   - **Resolution:** Merge the two contracts — keep the `useActiveBusinessId()` signature returning `string | null` (so existing Nano-Bites keep working untouched), keep `ActiveBusinessProvider` as a passthrough used by `LiquidOS.tsx`, AND add the new `role`, `pii`, `logout` fields plus the new hooks (`useActiveBusinessRole`, `useActiveBusinessPii`, `useTenancyLogout`). The `TenancyProvider` will be the authoritative top-level writer; `ActiveBusinessProvider` inside `LiquidOS.tsx` becomes a no-op pass-through (or is removed from `LiquidOS.tsx`).

2. **`src/routes/__root.tsx` is more complex than the snippet shown.** Current file uses `createRootRouteWithContext<{ queryClient }>()`, defines `shellComponent` (html/head/body + `HeadContent`/`Scripts`), `NotFoundComponent`, `ErrorComponent`, and wraps `<Outlet />` in `QueryClientProvider` + `LiquidOSErrorBoundary`.
   - The proposed `__root.tsx` snippet would **destroy SSR shell, query client, head metadata, and 404/error boundaries**.
   - **Resolution:** Surgically insert `<TenancyProvider>` *inside* `QueryClientProvider` and *around* `<Outlet />`, leaving everything else intact.

3. **`life-pii-bridge` edge function does not exist.** Only `fiat-payment-processing` and `flexa-payment-processing` are deployed.
   - **Resolution:** Per "NO MOCK DATA / power through errors" — the `TenancyProvider` will still invoke it; `piiError` is already non-fatal in the proposed code (it logs STALL and continues with email-only PII). The user must create that edge function separately later. **Flagging this so it is acknowledged**, not blocked.

4. **`AuthGate.tsx` import is wrong**: it imports `LiquidOSErrorBoundary` from `@/lib/error-capture`, but the boundary lives in `@/lib/error-boundary`. `logPlanck` lives in `@/lib/error-capture`. Will be split correctly.

5. **`business_users` and `businesses` tables exist** ✅ — clearance query is valid.

---

### Files to create / modify

```text
CREATE  src/components/nanobites/system/AuthGate.tsx
CREATE  src/providers/TenancyProvider.tsx
MODIFY  src/lib/idia/ActiveBusinessContext.tsx   (extend contract, preserve back-compat)
MODIFY  src/routes/__root.tsx                    (insert <TenancyProvider> only)
```

No DB migrations. No edge function changes (life-pii-bridge deferred).

---

### Technical details

**`ActiveBusinessContext.tsx` (merged contract):**
- Context value: `{ businessId, provisioningCode, role, pii, logout }`
- Hooks: `useActiveBusinessId` (existing semantics — returns string|null, logs STALL), `useActiveBusinessRole`, `useActiveBusinessPii`, `useTenancyLogout`
- Keeps `ActiveBusinessProvider` export so `LiquidOS.tsx` continues to compile unchanged

**`AuthGate.tsx`:** Exact behavior from snippet — email → OTP via `supabase.auth.signInWithOtp` + `verifyOtp({ type: 'email' })`. Wrapped in `LiquidOSErrorBoundary` (imported from `@/lib/error-boundary`). `logPlanck` from `@/lib/error-capture`. Full JSX restored (the user's snippet has rendering gaps from copy/paste).

**`TenancyProvider.tsx`:** Exact state machine from snippet — `booting | unauthenticated | resolving | authenticated | rejected`. Subscribes to `onAuthStateChange`, on `SIGNED_IN`/`INITIAL_SESSION` invokes `life-pii-bridge` (non-fatal), then queries `business_users` filtered by `user_id` + `is_active`, picks first clearance, injects context. Rejected state offers Sign Out.

**`__root.tsx`:** Single surgical change — wrap `<Outlet />` inside `LiquidOSErrorBoundary` with `<TenancyProvider>`. Everything else (shellComponent, HeadContent, Scripts, QueryClientProvider, NotFoundComponent, ErrorComponent, route meta) preserved.

---

### Post-install state

- Unauthenticated visit to `/` → AuthGate (OTP flow).
- Authenticated user with no `business_users` row → Rejected screen with Sign Out.
- Authenticated user with active clearance → existing `LiquidOS` shell renders with `businessId` available via `useActiveBusinessId()` (Nano-Bites keep working).
- `life-pii-bridge` 404 logs a STALL but does not block — PII falls back to `{ email }` only until the function is deployed.

Approve to proceed.