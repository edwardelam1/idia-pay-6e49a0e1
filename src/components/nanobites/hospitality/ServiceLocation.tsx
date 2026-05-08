/*  NANO-BITE ID: hosp.ft.ops.service
 *  NANO-BITE NAME: Service-location schedule
 *  ROLE: Daily
 *  INDUSTRY: tertiary.hospitality.food_truck
 */

import React, { useState, useCallback, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { MapPin, Navigation, Clock, CheckCircle, PowerOff, Loader2 } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";

import { LiquidOSErrorBoundary } from "@/lib/error-boundary";
import { logPlanck } from "@/lib/error-capture";
import { useActiveBusinessId } from "@/lib/idia/ActiveBusinessContext";

type ViewStep = "loading" | "entry" | "active";

function ServiceLocationCore() {
  const businessId = useActiveBusinessId();

  if (!businessId) {
    logPlanck("STALL", "TENANT_CONTEXT_NULL", "Nano-Bite mounted without authoritative tenant ID.");
    throw new Error(
      "CRITICAL STALL: Tenant Context Null. Nano-Bite cannot execute without an authoritative business ID."
    );
  }

  const [step, setStep] = useState<ViewStep>("loading");
  const [address, setAddress] = useState("");
  const [activeLocationId, setActiveLocationId] = useState<string | null>(null);
  const [activeSince, setActiveSince] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const [isFlip3D, setIsFlip3D] = useState(false);
  const [editModeId, setEditModeId] = useState<string | null>(null);

  const touchStartX = useRef(0);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const triggerHaptic = useCallback((type: "light" | "heavy" = "light") => {
    try {
      if (typeof window !== "undefined" && window.navigator?.vibrate) {
        window.navigator.vibrate(type === "heavy" ? [50, 50, 50] : 50);
      }
    } catch (e) {
      logPlanck("STALL", "HAPTIC_ENGINE", "Hardware agnostic fallback triggered", e);
    }
  }, []);

  const fetchActiveLocation = useCallback(async () => {
    logPlanck("START", "DISCOVERY_ENGINE", `Resonating Active Location for business_id: ${businessId}`);
    try {
      const { data, error } = await supabase
        .from("business_locations")
        .select("id, address, created_at")
        .eq("business_id", businessId)
        .eq("is_active", true)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        logPlanck("END", "DISCOVERY_SUCCESS", `Found active location artifact: ${data.id}`);
        setAddress(data.address);
        setActiveLocationId(data.id);
        setActiveSince(data.created_at);
        setStep("active");
      } else {
        logPlanck("END", "DISCOVERY_EMPTY", "No active location found. Routing to entry matrix.");
        setStep("entry");
      }
    } catch (err) {
      logPlanck("STALL", "DISCOVERY_ENGINE", "Location registry unreachable.", err);
      toast.error("Discovery Failed: Location registry unreachable.");
      setStep("entry");
    }
  }, [businessId]);

  useEffect(() => {
    fetchActiveLocation();
  }, [fetchActiveLocation]);

  const handleCheckIn = async () => {
    logPlanck("START", "TRANSACTION_COMMIT", `Executing Check-In for address: ${address}`);
    if (!address.trim()) {
      logPlanck("STALL", "VALIDATION_FAIL", "Missing mandatory address field.");
      toast.error("Address required.");
      return;
    }

    setIsProcessing(true);
    triggerHaptic("heavy");

    try {
      const { error: deactivateError } = await supabase
        .from("business_locations")
        .update({ is_active: false })
        .eq("business_id", businessId)
        .eq("is_active", true);

      if (deactivateError) throw deactivateError;

      const { data: newLoc, error: insertError } = await supabase
        .from("business_locations")
        .insert({
          business_id: businessId,
          name: `Mobile Service - ${new Date().toLocaleDateString()}`,
          address: address.trim(),
          is_active: true,
          facility_type: "location",
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        })
        .select("id, created_at")
        .single();

      if (insertError) throw insertError;

      logPlanck("END", "TRANSACTION_SUCCESS", `Check-in successful. ID: ${newLoc.id}`);
      setActiveLocationId(newLoc.id);
      setActiveSince(newLoc.created_at);
      setStep("active");
      toast.success("Coordinates Secured & Broadcasted.");
    } catch (error) {
      logPlanck("STALL", "TRANSACTION_COMMIT", "Check-In failed.", error);
      toast.error("System Error: Could not broadcast location.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleEndService = async () => {
    if (!activeLocationId) return;
    logPlanck("START", "TRANSACTION_COMMIT", `Executing End Service for location: ${activeLocationId}`);

    setIsProcessing(true);
    triggerHaptic("heavy");

    try {
      const { error } = await supabase
        .from("business_locations")
        .update({ is_active: false })
        .eq("id", activeLocationId);

      if (error) throw error;

      logPlanck("END", "TRANSACTION_SUCCESS", "Location deactivated successfully.");
      setAddress("");
      setActiveLocationId(null);
      setActiveSince(null);
      setEditModeId(null);
      setStep("entry");
      toast.info("Service Ended & Disconnected.");
    } catch (error) {
      logPlanck("STALL", "TRANSACTION_COMMIT", "End Service failed.", error);
      toast.error("System Error: Could not end service.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleGlobalTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };

  const handleGlobalTouchEnd = (e: React.TouchEvent) => {
    const touchEndX = e.changedTouches[0].clientX;
    const diff = touchStartX.current - touchEndX;
    if (Math.abs(diff) > 100) {
      logPlanck("TRIGGER", "FLIP_3D_METAPHOR", `Horizontal vector (${diff}px) exceeded threshold.`);
      setIsFlip3D((prev) => !prev);
      triggerHaptic("heavy");
    }
  };

  const handleItemPointerDown = (id: string) => {
    holdTimer.current = setTimeout(() => {
      logPlanck("TRIGGER", "WIGGLE_MODE", `3-second hold elapsed. Activating Edit/Wiggle mode for ID: ${id}`);
      setEditModeId(id);
      triggerHaptic("heavy");
    }, 3000);
  };

  const clearHoldTimer = () => {
    if (holdTimer.current) {
      clearTimeout(holdTimer.current);
      holdTimer.current = null;
    }
  };

  if (step === "loading") {
    return (
      <div className="flex items-center justify-center h-full p-8">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <p className="ml-3 text-muted-foreground">Querying Ledger...</p>
      </div>
    );
  }

  const flipStyle: React.CSSProperties = isFlip3D
    ? { transform: "perspective(1200px) rotateX(190deg)", transformOrigin: "top center", transition: "transform 0.6s ease" }
    : { transform: "perspective(1200px) rotateX(0deg)", transition: "transform 0.6s ease" };

  if (step === "active") {
    return (
      <div
        className="flex flex-col h-full p-4 gap-4 select-none"
        onTouchStart={handleGlobalTouchStart}
        onTouchEnd={handleGlobalTouchEnd}
      >
        <style>{`
          @keyframes wiggle {
            0% { transform: rotate(0deg); }
            25% { transform: rotate(-2deg) scale(1.02); }
            50% { transform: rotate(0deg); }
            75% { transform: rotate(2deg) scale(1.02); }
            100% { transform: rotate(0deg); }
          }
          .animate-wiggle { animation: wiggle 0.3s infinite; cursor: grab; z-index: 50; }
        `}</style>

        <header>
          <h1 className="text-3xl font-black text-foreground">Active Operations</h1>
          <div className="flex items-center gap-2 mt-1">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500" />
            </span>
            <span className="text-sm text-muted-foreground">Broadcasting to IDIA Hub</span>
          </div>
        </header>

        <div style={flipStyle}>
          <Card
            className={`rounded-3xl shadow-lg ${editModeId === activeLocationId ? "animate-wiggle" : ""}`}
            onPointerDown={() => activeLocationId && handleItemPointerDown(activeLocationId)}
            onPointerUp={clearHoldTimer}
            onPointerCancel={clearHoldTimer}
            onPointerLeave={clearHoldTimer}
          >
            <CardContent className="p-6 flex gap-4">
              <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0">
                <MapPin className="w-7 h-7 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Current Service Spot</p>
                <p className="text-lg font-bold text-foreground break-words">{address}</p>
                <div className="flex items-center gap-2 mt-2 text-sm text-muted-foreground">
                  <Clock className="w-4 h-4" />
                  <span>
                    Online since{" "}
                    {activeSince
                      ? new Date(activeSince).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                      : "..."}
                  </span>
                </div>
              </div>
              <CheckCircle className="w-6 h-6 text-emerald-500 shrink-0" />
            </CardContent>
          </Card>
        </div>

        <div className="mt-auto pt-4">
          <Button
            variant="outline"
            onClick={() => {
              logPlanck("TRIGGER", "ACTION", "User initiated End Service");
              handleEndService();
            }}
            disabled={isProcessing}
            className="w-full min-h-[72px] text-2xl font-black border-2 border-destructive/20 text-destructive hover:bg-destructive hover:text-destructive-foreground active:scale-[0.98] transition-all rounded-3xl"
          >
            {isProcessing ? (
              "Updating Ledger..."
            ) : (
              <>
                <PowerOff className="w-6 h-6 mr-2" /> End Service & Disconnect
              </>
            )}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex flex-col h-full p-4 gap-6 select-none"
      onTouchStart={handleGlobalTouchStart}
      onTouchEnd={handleGlobalTouchEnd}
    >
      <header>
        <h1 className="text-3xl font-black text-foreground">Location Setup</h1>
        <p className="text-muted-foreground">Establish your daily coordinates.</p>
      </header>

      <div className="flex-1">
        <div className="space-y-2">
          <Label htmlFor="svc-address" className="text-base font-semibold">
            Current Service Spot *
          </Label>
          <div className="relative">
            <Navigation className="absolute left-5 top-1/2 -translate-y-1/2 w-6 h-6 text-muted-foreground" />
            <Input
              id="svc-address"
              type="text"
              inputMode="text"
              autoComplete="street-address"
              placeholder="123 Main St, City, ST"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="h-[80px] min-h-[44px] pl-16 rounded-2xl bg-card border-none text-2xl font-black shadow-sm placeholder:text-muted-foreground/50 focus-visible:ring-primary"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            This address will be broadcasted to the consumer app.
          </p>
        </div>
      </div>

      <div className="mt-auto">
        <Button
          onClick={() => {
            logPlanck("TRIGGER", "ACTION", "User initiated Check-In");
            handleCheckIn();
          }}
          disabled={!address.trim() || isProcessing}
          className="w-full min-h-[80px] bg-primary text-primary-foreground text-2xl font-black rounded-[32px] shadow-2xl active:scale-[0.98] transition-transform disabled:opacity-50"
        >
          {isProcessing ? (
            "Securing Coordinates..."
          ) : (
            <>
              <MapPin className="w-7 h-7 mr-2" /> Open for Service
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

export default function ServiceLocation() {
  return (
    <LiquidOSErrorBoundary>
      <ServiceLocationCore />
    </LiquidOSErrorBoundary>
  );
}
