/**
 * NANO-BITE ID: sys.core.tenancy
 * NANO-BITE NAME: IDIA Tenancy Provider
 * ROLE: Root Execution Gatekeeper & Hardware Binder
 *
 * THE LAW: Owns BOTH the device-binding (TerminalProvisionGate) and the
 * human-binding (AuthGate). Hands a fully cleared ActiveBusinessContext
 * down to LiquidOS only after both gates pass.
 */

import { useState, useEffect, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import AuthGate from "@/components/nanobites/system/AuthGate";
import TerminalProvisionGate, {
  HardwareStorage,
} from "@/components/nanobites/system/TerminalProvisionGate";
import {
  ActiveBusinessContext,
  type PiiData,
} from "@/lib/idia/ActiveBusinessContext";
import { logPlanck } from "@/lib/error-capture";
import { Loader2, AlertOctagon, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

type AuthStatus =
  | "booting"
  | "unprovisioned"
  | "unauthenticated"
  | "resolving"
  | "authenticated"
  | "rejected";

interface ResolvedTenancy {
  businessId: string;
  role: string;
  pii: PiiData;
}

export function TenancyProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("booting");
  const [provisionedBusinessId, setProvisionedBusinessId] = useState<string | null>(null);
  const [provisionedCode, setProvisionedCode] = useState<string | null>(null);
  const [tenancy, setTenancy] = useState<ResolvedTenancy | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;

    logPlanck("START", "BOOT_SEQUENCE", "TenancyProvider mounting. Checking native hardware bindings.");

    const storedBusinessId = HardwareStorage.getItem("idia_provisioned_business_id");
    const storedCode = HardwareStorage.getItem("idia_provisioned_code");

    if (!storedBusinessId || !storedCode) {
      logPlanck("STALL", "DEVICE_UNLINKED", "No hardware binding. Halting for provisioning.");
      setStatus("unprovisioned");
      return;
    }

    logPlanck("PROCESS", "DEVICE_LINKED", `Hardware linked to business: ${storedBusinessId}`);
    setProvisionedBusinessId(storedBusinessId);
    setProvisionedCode(storedCode);

    const resolveTenancy = async (session: Session) => {
      setStatus("resolving");
      logPlanck("START", "TENANCY_RESOLUTION", "Session verified. Executing IDIA Hub clearance check.");

      try {
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
            { headers: { Authorization: `Bearer ${session.access_token}` } },
          );
          if (piiError) {
            logPlanck("STALL", "PII_BRIDGE_SYNC", "Bridge unreachable.", piiError);
          } else if (edgeData) {
            piiData = { ...piiData, ...(edgeData as Partial<PiiData>) };
          }
        } catch (bridgeErr) {
          logPlanck("STALL", "PII_BRIDGE_SYNC", "Bridge invocation threw.", bridgeErr);
        }

        logPlanck(
          "PROCESS",
          "HUB_CLEARANCE",
          `Querying business_users scoped to terminal: ${storedBusinessId}`,
        );
        const { data: hubData, error: hubError } = await supabase
          .from("business_users")
          .select("business_id, role")
          .eq("user_id", session.user.id)
          .eq("business_id", storedBusinessId)
          .eq("is_active", true);

        if (hubError) throw hubError;

        if (!hubData || hubData.length === 0) {
          logPlanck("FATAL", "HUB_CLEARANCE", "User has no active clearance for this terminal.");
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
  }, [provisionedBusinessId]);

  const handleLogout = async () => {
    logPlanck("TRIGGER", "AUTH_SIGNOUT", "User initiated human sign out.");
    await supabase.auth.signOut();
  };

  const handleUnprovisionDevice = async () => {
    logPlanck("TRIGGER", "DEVICE_UNBIND", "Wiping native secure hardware constraints.");
    HardwareStorage.removeItem("idia_provisioned_business_id");
    HardwareStorage.removeItem("idia_provisioned_business_name");
    HardwareStorage.removeItem("idia_provisioned_code");
    await supabase.auth.signOut();
    setTenancy(null);
    setProvisionedBusinessId(null);
    setProvisionedCode(null);
    setStatus("unprovisioned");
  };

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

  if (status === "unprovisioned") {
    return (
      <TerminalProvisionGate
        onProvisioned={(bId) => {
          setProvisionedBusinessId(bId);
          setProvisionedCode(HardwareStorage.getItem("idia_provisioned_code"));
          setStatus("unauthenticated");
        }}
      />
    );
  }

  if (status === "unauthenticated") {
    return <AuthGate onUnprovisionDevice={handleUnprovisionDevice} />;
  }

  if (status === "rejected") {
    return (
      <div className="min-h-screen w-full flex flex-col items-center justify-center bg-background p-6 gap-4 text-center">
        <div className="w-16 h-16 rounded-2xl bg-destructive/10 flex items-center justify-center">
          <AlertOctagon className="w-8 h-8 text-destructive" />
        </div>
        <h1 className="text-2xl font-black text-foreground">Terminal Locked</h1>
        <p className="text-sm text-muted-foreground max-w-md">
          Your IDIA Life identity is valid, but you do not hold active clearance to operate this
          specific terminal. Contact your Org Admin.
        </p>
        <div className="flex flex-col sm:flex-row gap-2 mt-2">
          <Button onClick={handleLogout} variant="outline">
            Sign Out Human
          </Button>
          <Button onClick={handleUnprovisionDevice} variant="ghost">
            <RotateCcw className="w-4 h-4 mr-2" /> Detach Hardware From Fleet
          </Button>
        </div>
      </div>
    );
  }

  // Authenticated & Cleared.
  return (
    <ActiveBusinessContext.Provider
      value={{
        businessId: tenancy!.businessId,
        provisioningCode: provisionedCode,
        role: tenancy!.role,
        pii: tenancy!.pii,
        logout: handleLogout,
      }}
    >
      {children}
    </ActiveBusinessContext.Provider>
  );
}
