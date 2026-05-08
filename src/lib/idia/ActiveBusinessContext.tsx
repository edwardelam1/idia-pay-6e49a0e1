/**
 * ACTIVE BUSINESS CONTEXT
 * Source-of-truth for the tenant ID a Nano-Bite operates against.
 * Sourced from the provisioned carton at mount, NOT from props.
 */
import { createContext, useContext, type ReactNode } from "react";
import { logPlanck } from "@/lib/error-capture";

type ActiveBusinessValue = {
  businessId: string | null;
  provisioningCode: string | null;
};

const ActiveBusinessContext = createContext<ActiveBusinessValue>({
  businessId: null,
  provisioningCode: null,
});

export function ActiveBusinessProvider({
  businessId,
  provisioningCode,
  children,
}: {
  businessId: string | null;
  provisioningCode: string | null;
  children: ReactNode;
}) {
  return (
    <ActiveBusinessContext.Provider value={{ businessId, provisioningCode }}>
      {children}
    </ActiveBusinessContext.Provider>
  );
}

/**
 * useActiveBusinessId — Nano-Bites call this on mount.
 * Returns null if the carton has no tenant anchor; the caller MUST
 * deploy the error boundary on null and log a STALL.
 */
export function useActiveBusinessId(): string | null {
  const ctx = useContext(ActiveBusinessContext);
  if (!ctx.businessId) {
    logPlanck("STALL", "TENANT_CONTEXT_NULL", "Nano-Bite requested businessId but carton context is null.");
    return null;
  }
  return ctx.businessId;
}
