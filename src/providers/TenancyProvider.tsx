/**
 * NANO-BITE ID: sys.core.tenancy
 * NANO-BITE NAME: IDIA Tenancy Provider
 * ROLE: Root Execution Gatekeeper
 */

import { useState, useEffect, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import AuthGate from "@/components/nanobites/system/AuthGate";
import {
  ActiveBusinessContext,
  type PiiData,
} from "@/lib/idia/ActiveBusinessContext";
import { logPlanck } from "@/lib/error-capture";
import { Loader2, AlertOctagon } from "lucide-react";
import { Button } from "@/components/ui/button";

type AuthStatus = "booting" | "unauthenticated" | "resolving" | "authenticated" | "rejected";

interface ResolvedTenancy {
  businessId: string;
  role: string;
  pii: PiiData;
}

const handleLogout = async () => {
  logPlanck("TRIGGER", "AUTH_SIGNOUT", "User initiated sign out.");
  await supabase.auth.signOut();
};

export function TenancyProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("booting");
  const [tenancy, setTenancy] = useState<ResolvedTenancy | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const resolveTenancy = async (session: Session) => {
      setStatus("resolving");
      logPlanck("START", "TENANCY_RESOLUTION", "Session verified. Executing IDIA Hub clearance check.");

      try {
        // 1. Fetch transient PII from Edge bridge (non-fatal).
        logPlanck("PROCESS", "PII_BRIDGE_SYNC", "Fetching PII from life-pii-bridge.");
        let piiData: PiiData = {
          first_name: null,
          last_name: null,
          full_name: null,
          display_name: null,
          email: session.user.email ?? null,
        };

        try {
          const { data: edgeData, error: piiError } = await supabase.functions.invoke(
            "life-pii-bridge",
            {
              headers: { Authorization: `Bearer ${session.access_token}` },
            },
          );
          if (piiError) {
            logPlanck("STALL", "PII_BRIDGE_SYNC", "Bridge unreachable.", piiError);
          } else if (edgeData) {
            piiData = { ...piiData, ...(edgeData as Partial<PiiData>) };
          }
        } catch (bridgeErr) {
          logPlanck("STALL", "PII_BRIDGE_SYNC", "Bridge invocation threw.", bridgeErr);
        }

        // 2. Fetch terminal clearance from IDIA Hub (business_users).
        logPlanck("PROCESS", "HUB_CLEARANCE", "Querying business_users for active roles.");
        const { data: hubData, error: hubError } = await supabase
          .from("business_users")
          .select("business_id, role")
          .eq("user_id", session.user.id)
          .eq("is_active", true);

        if (hubError) throw hubError;

        if (!hubData || hubData.length === 0) {
          logPlanck("FATAL", "HUB_CLEARANCE", "User has no active business clearances.");
          setStatus("rejected");
          return;
        }

        const activeClearance = hubData[0];
        setTenancy({
          businessId: activeClearance.business_id,
          role: activeClearance.role,
          pii: piiData,
        });
        setStatus("authenticated");
        logPlanck(
          "END",
          "TENANCY_RESOLUTION_SUCCESS",
          `Clearance granted for Business: ${activeClearance.business_id}`,
        );
      } catch (err) {
        logPlanck("STALL", "TENANCY_RESOLUTION", "Resolution sequence failed.", err);
        setStatus("rejected");
      }
    };

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" || event === "INITIAL_SESSION") {
        if (session) {
          void resolveTenancy(session);
        } else {
          setStatus("unauthenticated");
        }
      } else if (event === "SIGNED_OUT") {
        setStatus("unauthenticated");
        setTenancy(null);
      } else if (event === "TOKEN_REFRESHED" && session && !tenancy) {
        void resolveTenancy(session);
      }
    });

    return () => subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- RENDER MATRIX ---
  if (status === "booting" || status === "resolving") {
    return (
      <div className="min-h-screen w-full flex flex-col items-center justify-center bg-background p-4 gap-4">
        <Loader2 className="w-10 h-10 animate-spin text-primary" />
        <p className="text-lg font-bold text-foreground">
          {status === "booting" ? "Booting LiquidOS" : "Decrypting Clearance"}
        </p>
        <p className="text-sm text-muted-foreground">
          {status === "booting" ? "Establishing local matrices..." : "Connecting to IDIA Hub..."}
        </p>
      </div>
    );
  }

  if (status === "unauthenticated") {
    return <AuthGate />;
  }

  if (status === "rejected") {
    return (
      <div className="min-h-screen w-full flex flex-col items-center justify-center bg-background p-6 gap-4 text-center">
        <div className="w-16 h-16 rounded-2xl bg-destructive/10 flex items-center justify-center">
          <AlertOctagon className="w-8 h-8 text-destructive" />
        </div>
        <h1 className="text-2xl font-black text-foreground">Access Denied</h1>
        <p className="text-sm text-muted-foreground max-w-md">
          Your IDIA Life account is active, but you are not provisioned to operate any active IDIA Pay
          terminals. Please contact your Org Admin.
        </p>
        <Button onClick={handleLogout} variant="outline" className="mt-2">
          Sign Out & Switch Account
        </Button>
      </div>
    );
  }

  // Authenticated & Cleared.
  return (
    <ActiveBusinessContext.Provider
      value={{
        businessId: tenancy!.businessId,
        provisioningCode: null,
        role: tenancy!.role,
        pii: tenancy!.pii,
        logout: handleLogout,
      }}
    >
      {children}
    </ActiveBusinessContext.Provider>
  );
}
