/**
 * NANO-BITE ID: sys.core.provision
 * NANO-BITE NAME: Terminal Provision Gate
 * ROLE: Device-to-Business Hardware Binding
 * INDUSTRY: agnostic
 */

import React, { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { HardDrive, ScanLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { LiquidOSErrorBoundary } from "@/lib/error-boundary";
import { logPlanck } from "@/lib/error-capture";

// ============================================================================
// NATIVE KOTLIN/SWIFT HARDWARE BRIDGE CONTRACT
// ============================================================================
declare global {
  interface Window {
    IDIA_Hardware_Bridge?: {
      setSecureItem: (key: string, value: string) => void;
      getSecureItem: (key: string) => string | null;
      removeSecureItem: (key: string) => void;
    };
  }
}

export const HardwareStorage = {
  setItem: (key: string, value: string) => {
    if (typeof window !== "undefined" && window.IDIA_Hardware_Bridge) {
      window.IDIA_Hardware_Bridge.setSecureItem(key, value);
    } else if (typeof window !== "undefined") {
      window.localStorage.setItem(key, value);
    }
  },
  getItem: (key: string): string | null => {
    if (typeof window === "undefined") return null;
    if (window.IDIA_Hardware_Bridge) {
      return window.IDIA_Hardware_Bridge.getSecureItem(key);
    }
    return window.localStorage.getItem(key);
  },
  removeItem: (key: string) => {
    if (typeof window === "undefined") return;
    if (window.IDIA_Hardware_Bridge) {
      window.IDIA_Hardware_Bridge.removeSecureItem(key);
    } else {
      window.localStorage.removeItem(key);
    }
  },
};

interface TerminalProvisionGateProps {
  onProvisioned: (businessId: string, name: string) => void;
}

function TerminalProvisionGateCore({ onProvisioned }: TerminalProvisionGateProps) {
  const [code, setCode] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);

  const handleProvision = async (e: React.FormEvent) => {
    e.preventDefault();
    logPlanck("START", "DEVICE_PROVISIONING", `Attempting to bind terminal with code: ${code}`);

    if (!code.trim() || code.length < 5) {
      logPlanck("STALL", "VALIDATION_FAIL", "Invalid provisioning code format.");
      toast.error("Invalid provisioning code format.");
      return;
    }

    setIsProcessing(true);
    const sanitizedCode = code.trim().toUpperCase();

    try {
      logPlanck("PROCESS", "PROVISION_LOOKUP", "Querying authoritative ledger.");

      let targetBusiness: { id: string; name: string } | null = null;
      const db = supabase as unknown as {
        from: (t: string) => {
          select: (c: string) => {
            contains: (col: string, val: unknown) => { maybeSingle: () => Promise<{ data: unknown; error: unknown }> };
            eq: (col: string, val: unknown) => { maybeSingle: () => Promise<{ data: unknown; error: unknown }> };
          };
        };
      };

      // ATTEMPT A: multi-issue codes column (jsonb/text[]: provisioning_codes)
      try {
        const { data: arrayData } = await db
          .from("businesses")
          .select("id, name")
          .contains("provisioning_codes", [sanitizedCode])
          .maybeSingle();
        if (arrayData) targetBusiness = arrayData as { id: string; name: string };
      } catch (arrErr) {
        logPlanck("STALL", "PROVISION_LOOKUP", "Array column unavailable; falling back.", arrErr);
      }

      // ATTEMPT B: legacy single-string column
      if (!targetBusiness) {
        const { data: singleData, error: singleError } = await db
          .from("businesses")
          .select("id, name")
          .eq("provisioning_code", sanitizedCode)
          .maybeSingle();
        if (singleError) throw singleError as Error;
        if (singleData) targetBusiness = singleData as { id: string; name: string };
      }

      if (!targetBusiness) {
        logPlanck("STALL", "PROVISION_FAILED", "No business found for code.");
        toast.error("Provisioning code not recognized. Verify with your Org Admin.");
        setIsProcessing(false);
        return;
      }

      logPlanck("END", "PROVISION_SUCCESS", `Device bound to Business: ${targetBusiness.id}`);

      HardwareStorage.setItem("idia_provisioned_business_id", targetBusiness.id);
      HardwareStorage.setItem("idia_provisioned_business_name", targetBusiness.name);
      HardwareStorage.setItem("idia_provisioned_code", sanitizedCode);

      toast.success(`Terminal successfully linked to ${targetBusiness.name}`);
      onProvisioned(targetBusiness.id, targetBusiness.name);
    } catch (err: unknown) {
      logPlanck("STALL", "DEVICE_PROVISIONING", "Database lookup failed.", err);
      toast.error("System Error: Could not verify provisioning code.");
      setIsProcessing(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md rounded-3xl shadow-2xl border-none">
        <CardContent className="p-8 space-y-8">
          <div className="text-center space-y-2">
            <div className="w-20 h-20 mx-auto rounded-2xl bg-primary/10 flex items-center justify-center">
              <HardDrive className="w-10 h-10 text-primary" />
            </div>
            <h1 className="text-3xl font-black text-foreground">Provision Terminal</h1>
            <p className="text-sm text-muted-foreground">Unlinked Hardware Detected</p>
          </div>

          <form onSubmit={handleProvision} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="prov-code" className="text-base font-semibold flex items-center gap-2">
                <ScanLine className="w-4 h-4" /> Organization Code
              </Label>
              <Input
                id="prov-code"
                type="text"
                placeholder="IDIA-XXXX-XXXX"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                className="h-[72px] min-h-[44px] rounded-2xl bg-background border-none text-center text-2xl font-black tracking-widest shadow-sm px-6 uppercase"
                disabled={isProcessing}
                autoFocus
              />
            </div>
            <Button
              type="submit"
              disabled={isProcessing}
              className="w-full min-h-[72px] text-xl font-black rounded-3xl shadow-lg active:scale-[0.98] transition-transform"
            >
              {isProcessing ? "LINKING HARDWARE..." : "BIND TERMINAL"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

export default function TerminalProvisionGate(props: TerminalProvisionGateProps) {
  return (
    <LiquidOSErrorBoundary>
      <TerminalProvisionGateCore {...props} />
    </LiquidOSErrorBoundary>
  );
}
