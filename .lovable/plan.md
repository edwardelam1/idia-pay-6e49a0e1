## Goal

Make `TenancyProvider` the single root gatekeeper that owns BOTH device binding (TerminalProvisionGate) and human binding (AuthGate). `LiquidOS` becomes a pure consumer that reads `provisioningCode` from `ActiveBusinessContext`, hydrates the carton, and renders Nano-Bites.

## Changes

### 1. `src/components/nanobites/system/TerminalProvisionGate.tsx`
In `handleProvision`, after a successful business lookup, also persist the typed code:
```ts
HardwareStorage.setItem('idia_provisioned_business_id', targetBusiness.id);
HardwareStorage.setItem('idia_provisioned_business_name', targetBusiness.name);
HardwareStorage.setItem('idia_provisioned_code', sanitizedCode);  // NEW
```
(All other logic — native bridge, multi-code + legacy fallback query, error handling — stays as previously specified.)

### 2. `src/providers/TenancyProvider.tsx`
- In the boot `useEffect`, also read `idia_provisioned_code`. Treat the device as unprovisioned if either value is missing:
  ```ts
  const storedBusinessId = HardwareStorage.getItem('idia_provisioned_business_id');
  const storedCode = HardwareStorage.getItem('idia_provisioned_code');
  if (!storedBusinessId || !storedCode) { setStatus('unprovisioned'); return; }
  ```
- In the `<TerminalProvisionGate onProvisioned=...>` branch, after provisioning succeeds, set BOTH `provisionedBusinessId` and trigger a re-read so the code is in scope.
- In the authenticated `<ActiveBusinessContext.Provider>` value, expose:
  ```ts
  provisioningCode: HardwareStorage.getItem('idia_provisioned_code'),
  ```
- `handleUnprovisionDevice` already removes business id/name; also remove `idia_provisioned_code`.

### 3. `src/lib/idia/LiquidOS.tsx` (rewrite)
Delete the entire Phase 1 (provisioning code text input) and the `reset`/`tenantId` props/wrappers. New responsibilities only:
- `const { provisioningCode, logout } = useContext(ActiveBusinessContext)`
- `useEffect` on `provisioningCode` → call `executeHydration(provisioningCode)` which calls `fetchProvisioningBlueprint`
- Phases reduce to: `loading | error | selection | operational`
- Selection view: list `carton.subModules`; "End Session" button calls `logout()` (no more `reset`)
- Operational view: sidebar with screens + Nano-Bite renderer; "End Session" → `logout()`; "Module Library" → back to selection
- Remove imports of `TenancyProvider` and `ActiveBusinessProvider` from this file (TenancyProvider now lives at root and is the sole writer of context)
- Keep verbatim: `NanoBiteRenderer`, `DynamicNanoBite`, `BrandMark`, `uniqueScreens`, `isPaymentSpec`, `prettyTitle`, `ATOM_FILE_MAP`, `rawAtoms`, `SovereignWrapper` usage, `recordExecution`/`subscribeExecutions` flow, gesture handlers, sidebar state

### 4. `src/routes/__root.tsx`
Re-introduce the root-level wrap:
```tsx
import { TenancyProvider } from "@/providers/TenancyProvider";
...
<QueryClientProvider client={queryClient}>
  <LiquidOSErrorBoundary>
    <TenancyProvider>
      <Outlet />
    </TenancyProvider>
  </LiquidOSErrorBoundary>
</QueryClientProvider>
```
`TenancyProvider` takes no props in this final form (it owns provisioning internally).

### 5. `src/components/nanobites/system/AuthGate.tsx`
Already accepts optional `onUnprovisionDevice` prop and renders the "Detach Hardware From Fleet" button when present. `TenancyProvider` passes `handleUnprovisionDevice` into it on the `unauthenticated` branch. No further changes.

## Boot flow (final)

```
__root.tsx
  └── TenancyProvider  (owns: hardware bind + human auth + clearance)
        ├── status=unprovisioned → <TerminalProvisionGate />
        ├── status=unauthenticated → <AuthGate onUnprovisionDevice={...} />
        ├── status=rejected → Terminal Locked + Sign Out / Detach
        └── status=authenticated → <ActiveBusinessContext.Provider value={{ businessId, provisioningCode, role, pii, logout }}>
              └── <Outlet />
                    └── routes/index.tsx → <LiquidOS />
                          ├── reads provisioningCode from context
                          ├── fetchProvisioningBlueprint(code)
                          ├── selection view (sub-modules)
                          └── operational view (Nano-Bites)
```

## Out of scope (no changes)
- No DB migrations. Multi-code (`provisioning_codes`) query already attempts the array column with graceful fallback to legacy `provisioning_code`.
- No edge function changes.
- Supabase email template (`{{ .Token }}` vs `{{ .ConfirmationURL }}`) is still a dashboard-only fix on the user's side.

## Risks / notes
- Existing devices with stale `localStorage` (business id but no code) will be forced back through `TerminalProvisionGate` on next boot — this is intentional and acceptable.
- `LiquidOS` no longer renders any auth/provisioning UI; if a future route is added outside `TenancyProvider`'s wrap, it will crash on `useContext` returning the default null context. Keep the root wrap intact.