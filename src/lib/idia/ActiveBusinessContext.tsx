/**
 * NANO-BITE ID: sys.core.context
 * NANO-BITE NAME: Active Business Context
 * ROLE: Tenancy state distribution
 *
 * BACK-COMPAT: Preserves the original `ActiveBusinessProvider` + `useActiveBusinessId`
 * contract used by existing Nano-Bites, while extending the surface with
 * `role`, `pii`, and `logout` injected by the authoritative TenancyProvider.
 */
import { createContext, useContext, type ReactNode } from "react";
import { logPlanck } from "@/lib/error-capture";

export interface PiiData {
  first_name: string | null;
  last_name: string | null;
  full_name: string | null;
  display_name: string | null;
  email: string | null;
}

export interface TenancyContextValue {
  businessId: string | null;
  provisioningCode: string | null;
  role: string | null;
  pii: PiiData | null;
  logout: () => Promise<void>;
}

const ActiveBusinessContext = createContext<TenancyContextValue>({
  businessId: null,
  provisioningCode: null,
  role: null,
  pii: null,
  logout: async () => {},
});

export { ActiveBusinessContext };

/**
 * ActiveBusinessProvider — back-compat passthrough used by LiquidOS shell.
 * The authoritative writer is TenancyProvider at the root; nested usage
 * here merges any additional fields with the parent context.
 */
export function ActiveBusinessProvider({
  businessId,
  provisioningCode,
  children,
}: {
  businessId: string | null;
  provisioningCode: string | null;
  children: ReactNode;
}) {
  const parent = useContext(ActiveBusinessContext);
  return (
    <ActiveBusinessContext.Provider
      value={{
        ...parent,
        businessId: businessId ?? parent.businessId,
        provisioningCode: provisioningCode ?? parent.provisioningCode,
      }}
    >
      {children}
    </ActiveBusinessContext.Provider>
  );
}

/**
 * useActiveBusinessId — Nano-Bites call this on mount.
 * Returns null if no authoritative tenant anchor; caller MUST deploy the
 * error boundary on null and log a STALL.
 */
export function useActiveBusinessId(): string | null {
  const ctx = useContext(ActiveBusinessContext);
  if (!ctx.businessId) {
    logPlanck("STALL", "TENANT_CONTEXT_NULL", "Nano-Bite requested businessId but carton context is null.");
    return null;
  }
  return ctx.businessId;
}

export const useActiveBusinessRole = (): string | null =>
  useContext(ActiveBusinessContext).role;

export const useActiveBusinessPii = (): PiiData | null =>
  useContext(ActiveBusinessContext).pii;

export const useTenancyLogout = (): (() => Promise<void>) =>
  useContext(ActiveBusinessContext).logout;
