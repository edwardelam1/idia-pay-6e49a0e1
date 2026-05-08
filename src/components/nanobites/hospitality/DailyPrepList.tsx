/** * NANO-BITE ID: hosp.ft.ops.prep
 * NANO-BITE NAME: DailyPrepList
 * ROLE: Daily
 * INDUSTRY: tertiary.hospitality.food_truck
 */

import React, { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  ClipboardList,
  Plus,
  Trash2,
  CheckCircle2,
  ChevronLeft,
  X,
  Calculator,
  Truck,
  Search,
  Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";

// ============================================================================
// STRICT DATA SCHEMAS (NO MOCK DATA. NO STUBS. EVER.)
// ============================================================================
export interface PrepItem {
  location: string;
  item_name: string;
  unit: string;
  on_hand: number;
  par_level: number;
  need: number;
  station: "Cold" | "Griddle" | "Assembly";
}

// ============================================================================
// PLANCK SCALE ERROR LOGGING UTILITY
// ============================================================================
const logPlanck = (
  phase: "START" | "PROCESS" | "END" | "STALL" | "TRIGGER",
  action: string,
  details: string,
  error?: any,
) => {
  const timestamp = new Date().toISOString();
  const msg = `[${phase}] [${action}] [${timestamp}] - ${details}`;
  if (error) {
    console.error(`${msg} | TRACE:`, error);
  } else {
    console.log(msg);
  }
};

export default function DailyPrepList({ businessId = "default" }: { businessId?: string }) {
  const [logs, setLogs] = useState<PrepItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState<"list" | "entry">("list");
  const [isProcessing, setIsProcessing] = useState(false);

  // UX State
  const [isFlip3D, setIsFlip3D] = useState(false);
  const [editModeId, setEditModeId] = useState<string | null>(null);

  // Touch refs
  const touchStartX = useRef<number>(0);
  const holdTimer = useRef<NodeJS.Timeout | null>(null);

  const [formData, setFormData] = useState({
    location: "",
    item_name: "",
    unit: "Pans",
    on_hand: 0,
    par_level: 0,
    station: "Cold" as "Cold" | "Griddle" | "Assembly",
  });

  const triggerHaptic = useCallback((type: "light" | "heavy" = "light") => {
    try {
      if (typeof window !== "undefined" && window.navigator?.vibrate) {
        window.navigator.vibrate(type === "heavy" ? [50, 50, 50] : 50);
      }
    } catch (e) {
      logPlanck("STALL", "HAPTIC_ENGINE", "Hardware agnostic fallback triggered", e);
    }
  }, []);

  // ============================================================================
  // DISCOVERY LOGIC: LIQUID OS ARTIFACT RESOLUTION
  // ============================================================================
  const discoveryEngine = async () => {
    logPlanck("START", "DISCOVERY_ENGINE", `Resonating for Daily Prep List at business_id: ${businessId}`);
    setLoading(true);

    try {
      logPlanck("PROCESS", "DISCOVERY_FETCH", "Executing Supabase map resolution.");
      const { data, error } = await (supabase
        .from("daily_prep_list" as any)
        .select("*")
        .eq("business_id", businessId) as any);

      if (error) throw error;

      logPlanck("PROCESS", "DISCOVERY_HYDRATE", `Transforming ${data?.length || 0} remote entities to local matrix.`);
      const artifactMapping = (data || []).map((item: any) => ({
        ...item,
        need: Math.max(0, item.par_level - item.on_hand),
      }));

      setLogs(artifactMapping);
      logPlanck("END", "DISCOVERY_SUCCESS", `${artifactMapping.length} artifacts materialized from ledger.`);
    } catch (err: any) {
      logPlanck("STALL", "DISCOVERY_ENGINE", "Artifact registry unreachable.", err);
      toast.error("Discovery Failed: Artifact registry unreachable.");
    } finally {
      setLoading(false);
      logPlanck("END", "DISCOVERY_CYCLE", "Discovery sequence terminated.");
    }
  };

  useEffect(() => {
    if (businessId) {
      logPlanck("START", "USE_EFFECT_MOUNT", "Mounting component, invoking discovery engine.");
      discoveryEngine();
    }
  }, [businessId]);

  // ============================================================================
  // TRANSACTIONS: LEDGER COMMITMENT
  // ============================================================================
  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    logPlanck("START", "TRANSACTION_COMMIT", "Vaulting Prep Artifact to Ledger.");

    if (!formData.location || !formData.item_name) {
      logPlanck("STALL", "VALIDATION_FAIL", "Missing mandatory fields.");
      toast.error("Validation Error: Please complete required fields.");
      return;
    }

    setIsProcessing(true);
    triggerHaptic("heavy");

    try {
      const payload = {
        business_id: businessId,
        location: formData.location.trim().toUpperCase(),
        item_name: formData.item_name,
        unit: formData.unit,
        on_hand: formData.on_hand,
        par_level: formData.par_level,
        station: formData.station,
        created_at: new Date().toISOString(),
      };

      logPlanck("PROCESS", "TRANSACTION_INSERT", "Broadcasting payload to daily_prep_list table.");
      const { data, error } = await (supabase
        .from("daily_prep_list" as any)
        .insert([payload])
        .select()
        .single() as any);

      if (error) throw error;

      logPlanck("PROCESS", "TRANSACTION_UPDATE_STATE", "Merging new artifact into local matrix.");
      setLogs((prev) => [...prev, { ...data, need: Math.max(0, data.par_level - data.on_hand) }]);
      setStep("list");
      logPlanck("END", "TRANSACTION_SUCCESS", `Artifact ${data.location} vaulted successfully.`);

      // Reset form data defaults
      setFormData((prev) => ({ ...prev, item_name: "", on_hand: 0, par_level: 0 }));

      toast.success("Artifact Vaulted.", {
        action: { label: "Undo", onClick: () => logPlanck("TRIGGER", "UNDO_ACTION", "Undo not implemented yet.") },
      });
    } catch (err: any) {
      logPlanck("STALL", "TRANSACTION_COMMIT", "Vaulting failed.", err);
      toast.error("Stall: Failed to commit to ledger.");
    } finally {
      setIsProcessing(false);
      logPlanck("END", "TRANSACTION_COMMIT_CYCLE", "Transaction sequence closed.");
    }
  };

  const syncToCommissary = async () => {
    logPlanck("START", "INTEGRATION_SYNC", "Pushing Demand Signal to Commissary Restock.");
    setIsProcessing(true);
    triggerHaptic("heavy");

    try {
      const demandItems = logs
        .filter((item) => item.need > 0)
        .map((item) => ({
          business_id: businessId,
          item_name: item.item_name,
          quantity_needed: item.need,
          unit: item.unit,
          source: "Daily_Prep_List",
          status: "pending_restock",
        }));

      logPlanck("PROCESS", "INTEGRATION_EVALUATE", `Identified ${demandItems.length} items with outstanding needs.`);
      if (demandItems.length === 0) {
        logPlanck("END", "INTEGRATION_CANCEL", "Demand Signal Null: All Pars met.");
        toast.info("Demand Signal Null: All Pars met.");
        setIsProcessing(false);
        return;
      }

      logPlanck("PROCESS", "INTEGRATION_TRANSMIT", "Broadcasting to inventory_demand.");
      const { error } = await (supabase.from("inventory_demand" as any).insert(demandItems) as any);
      if (error) throw error;

      logPlanck("END", "INTEGRATION_SUCCESS", "Demand vaulted to Commissary Restock.");
      toast.success("Demand vaulted to Commissary Restock.");
    } catch (err: any) {
      logPlanck("STALL", "INTEGRATION_SYNC", "Egress failed to commissary ledger.", err);
      toast.error("Sync Stall: Commissary ledger unreachable.");
    } finally {
      setIsProcessing(false);
      logPlanck("END", "INTEGRATION_SYNC_CYCLE", "Integration sequence closed.");
    }
  };

  // ============================================================================
  // GESTURE & HARDWARE ENGINE
  // ============================================================================
  const handleGlobalTouchStart = (e: React.TouchEvent) => {
    logPlanck("START", "GLOBAL_TOUCH", "Tracking horizontal swipe vector.");
    touchStartX.current = e.touches[0].clientX;
  };

  const handleGlobalTouchEnd = (e: React.TouchEvent) => {
    const touchEndX = e.changedTouches[0].clientX;
    const diff = touchStartX.current - touchEndX;

    // Swipe logic: > 100px triggers Flip 3D metaphor
    if (Math.abs(diff) > 100) {
      logPlanck("TRIGGER", "FLIP_3D_METAPHOR", `Horizontal vector (${diff}px) exceeded threshold. Exploding matrix.`);
      setIsFlip3D((prev) => !prev);
      triggerHaptic("heavy");
    }
    logPlanck("END", "GLOBAL_TOUCH", "Touch tracking completed.");
  };

  const handleItemPointerDown = (id: string) => {
    logPlanck("START", "ITEM_HOLD", `Tracking hold gesture for ID: ${id}`);
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
      logPlanck("END", "ITEM_HOLD", "Hold gesture aborted prior to 3-second threshold.");
    }
  };

  // ============================================================================
  // RENDER: THE LAW (44px Targets, Single Column, Bottom-Weighted)
  // ============================================================================
  if (loading)
    return (
      <div className="h-screen flex items-center justify-center animate-pulse font-black text-xs uppercase tracking-widest text-[#86868B]">
        Resonating Registry...
      </div>
    );

  return (
    <div
      className="flex flex-col h-screen bg-[#F5F5F7] relative overflow-hidden perspective-container"
      onTouchStart={step === "list" ? handleGlobalTouchStart : undefined}
      onTouchEnd={step === "list" ? handleGlobalTouchEnd : undefined}
    >
      <style>{`
        .perspective-container { perspective: 1500px; }
        @keyframes wiggle {
          0% { transform: rotate(0deg); }
          25% { transform: rotate(-2deg) scale(1.02); }
          50% { transform: rotate(0deg); }
          75% { transform: rotate(2deg) scale(1.02); }
          100% { transform: rotate(0deg); }
        }
        .animate-wiggle {
          animation: wiggle 0.3s infinite;
          cursor: grab;
          z-index: 50;
        }
      `}</style>

      {/* HEADER: Action Button Top Right */}
      <div className="pt-10 pb-4 px-6 bg-white border-b flex justify-between items-center z-10 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="h-11 w-11 bg-[#1D1D1F] text-white rounded-xl flex items-center justify-center shadow-md">
            <ClipboardList size={22} />
          </div>
          <div className="flex flex-col">
            <h1 className="text-xl font-black tracking-tighter text-[#1D1D1F]">DPL</h1>
            <span className="text-[10px] font-bold text-[#86868B] uppercase tracking-[0.12em]">Daily Prep List</span>
          </div>
        </div>
        <Button
          onClick={() => {
            logPlanck("TRIGGER", "NAVIGATION", "Routing to single-column entry matrix.");
            triggerHaptic();
            setStep("entry");
          }}
          className="h-11 min-w-[44px] rounded-full bg-[#1D1D1F] text-white font-bold px-6 shadow-md"
        >
          <Plus className="mr-2 h-4 w-4" /> Add Item
        </Button>
      </div>

      <ScrollArea className="flex-1 w-full">
        <div className="p-4 pb-[200px] space-y-3 relative" style={{ transformStyle: "preserve-3d" }}>
          {logs.map((item, index) => (
            <div
              key={item.location}
              className={`transition-all duration-700 ease-in-out ${editModeId === item.location ? "animate-wiggle relative" : ""}`}
              style={
                isFlip3D
                  ? {
                      transform: `rotateX(190deg) translateY(${index * 96}px)`, // 190 deg tilt, spread 1 inch (96px)
                      transformOrigin: "top center",
                      position: index > 0 ? "absolute" : "relative",
                      top: index > 0 ? 0 : "auto",
                      width: "100%",
                      zIndex: logs.length - index,
                    }
                  : { transform: "rotateX(0deg) translateY(0px)" }
              }
              onPointerDown={() => handleItemPointerDown(item.location)}
              onPointerUp={clearHoldTimer}
              onPointerCancel={clearHoldTimer}
              onPointerLeave={clearHoldTimer}
            >
              <Card className="border-none shadow-sm rounded-[24px] overflow-hidden bg-white">
                <CardContent className="p-6 flex justify-between items-center min-h-[88px]">
                  <div className="flex flex-col pointer-events-none">
                    <span className="text-[11px] font-black text-[#007AFF] uppercase tracking-wider">
                      {item.station}
                    </span>
                    <h3 className="text-2xl font-black text-[#1D1D1F] mt-1">{item.item_name}</h3>
                    <div className="flex items-center gap-2 mt-2 text-[#86868B] font-bold text-sm">
                      <Calculator size={14} /> {item.on_hand} / {item.par_level} {item.unit}
                    </div>
                  </div>
                  <div
                    className={`flex flex-col items-end pointer-events-none ${item.need > 0 ? "text-[#FF3B30]" : "text-[#34C759]"}`}
                  >
                    <span className="text-[10px] font-black uppercase tracking-widest">Need</span>
                    <span className="text-4xl font-black leading-none mt-1">{item.need}</span>
                  </div>
                </CardContent>
                {/* THE LAW: Minimum 44px Interaction Target */}
                <div className="flex h-[56px] border-t border-[#F2F2F7]">
                  <button
                    className="flex-1 text-[13px] font-black uppercase text-[#1D1D1F] active:bg-[#F5F5F7] min-h-[44px]"
                    onClick={() => {
                      logPlanck("TRIGGER", "CALIBRATE_ACTION", `Calibration requested for ${item.location}`);
                      triggerHaptic("light");
                    }}
                  >
                    Calibrate Par
                  </button>
                </div>
              </Card>
            </div>
          ))}
        </div>
      </ScrollArea>

      {/* FOOTER: Bottom-Weighted Action (Thumb Zone) */}
      <div className="fixed bottom-0 left-0 w-full p-6 bg-white/90 backdrop-blur-xl border-t border-[#F2F2F7] z-20 flex flex-col gap-3">
        <div className="flex items-center gap-2 px-2 text-[#86868B]">
          <Info size={14} />
          <span className="text-[11px] font-bold uppercase tracking-tight">Egress: Commissary Restock Ledger</span>
        </div>
        <Button
          disabled={isProcessing || logs.length === 0}
          className="w-full h-[72px] min-h-[44px] text-xl font-black rounded-[24px] bg-[#007AFF] text-white shadow-2xl active:scale-[0.98] transition-transform"
          onClick={syncToCommissary}
        >
          {isProcessing ? "Transmitting..." : "VAULT DEMAND SIGNAL"}
        </Button>
      </div>

      {/* ============================================================================
          FORM ENTRY: THE LAW (Labels Above, Single Column, Contextual Keyboards)
          ============================================================================ */}
      {step === "entry" && (
        <div className="absolute inset-0 bg-white z-50 flex flex-col animate-in slide-in-from-bottom">
          <header className="p-6 border-b flex justify-between items-center bg-[#F5F5F7]">
            <h2 className="text-2xl font-black tracking-tighter">Log Demand Artifact</h2>
            <Button
              variant="ghost"
              className="h-12 w-12 min-h-[44px] min-w-[44px] rounded-full p-0 bg-white shadow-sm"
              onClick={() => {
                logPlanck("TRIGGER", "NAVIGATION", "Exiting entry matrix.");
                setStep("list");
              }}
            >
              <X size={24} />
            </Button>
          </header>

          <ScrollArea className="flex-1">
            <form onSubmit={handleSubmit} className="p-6 space-y-8 pb-32 max-w-2xl mx-auto w-full">
              <div className="space-y-3 bg-[#F5F5F7] p-4 rounded-3xl">
                <Label className="text-xs font-black text-[#86868B] uppercase tracking-widest ml-1">
                  Location Identifier *
                </Label>
                <Input
                  className="h-[60px] min-h-[44px] rounded-2xl text-xl font-bold border-none shadow-sm px-6"
                  placeholder="e.g. UNIT-01-A"
                  value={formData.location}
                  onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                />
              </div>

              <div className="space-y-3 bg-[#F5F5F7] p-4 rounded-3xl">
                <Label className="text-xs font-black text-[#86868B] uppercase tracking-widest ml-1">Item Name *</Label>
                <Input
                  className="h-[60px] min-h-[44px] rounded-2xl text-xl font-bold border-none shadow-sm px-6"
                  placeholder="e.g. Marinated Steak"
                  value={formData.item_name}
                  onChange={(e) => setFormData({ ...formData, item_name: e.target.value })}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-[#F5F5F7] p-4 rounded-3xl">
                {/* Selection Stepper replaces manual number typing */}
                <div className="space-y-3">
                  <Label className="text-xs font-black text-[#86868B] uppercase tracking-widest ml-1">On Hand</Label>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      onClick={() => {
                        triggerHaptic("light");
                        setFormData((f) => ({ ...f, on_hand: Math.max(0, f.on_hand - 1) }));
                      }}
                      className="h-[60px] w-[60px] min-h-[44px] min-w-[44px] rounded-2xl bg-white text-black shadow-sm text-2xl font-black"
                    >
                      -
                    </Button>
                    <Input
                      type="number"
                      inputMode="numeric"
                      className="h-[60px] min-h-[44px] flex-1 rounded-2xl text-center text-2xl font-bold border-none shadow-sm"
                      value={formData.on_hand}
                      readOnly
                    />
                    <Button
                      type="button"
                      onClick={() => {
                        triggerHaptic("light");
                        setFormData((f) => ({ ...f, on_hand: f.on_hand + 1 }));
                      }}
                      className="h-[60px] w-[60px] min-h-[44px] min-w-[44px] rounded-2xl bg-white text-black shadow-sm text-2xl font-black"
                    >
                      +
                    </Button>
                  </div>
                </div>

                <div className="space-y-3">
                  <Label className="text-xs font-black text-[#86868B] uppercase tracking-widest ml-1">
                    Par Level *
                  </Label>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      onClick={() => {
                        triggerHaptic("light");
                        setFormData((f) => ({ ...f, par_level: Math.max(0, f.par_level - 1) }));
                      }}
                      className="h-[60px] w-[60px] min-h-[44px] min-w-[44px] rounded-2xl bg-white text-black shadow-sm text-2xl font-black"
                    >
                      -
                    </Button>
                    <Input
                      type="number"
                      inputMode="numeric"
                      className="h-[60px] min-h-[44px] flex-1 rounded-2xl text-center text-2xl font-bold border-none shadow-sm"
                      value={formData.par_level}
                      readOnly
                    />
                    <Button
                      type="button"
                      onClick={() => {
                        triggerHaptic("light");
                        setFormData((f) => ({ ...f, par_level: f.par_level + 1 }));
                      }}
                      className="h-[60px] w-[60px] min-h-[44px] min-w-[44px] rounded-2xl bg-white text-black shadow-sm text-2xl font-black"
                    >
                      +
                    </Button>
                  </div>
                </div>
              </div>

              {/* Segmented Control replaces dropdown */}
              <div className="space-y-3 bg-[#F5F5F7] p-4 rounded-3xl">
                <Label className="text-xs font-black text-[#86868B] uppercase tracking-widest ml-1">
                  Production Station
                </Label>
                <div className="flex gap-2">
                  {(["Cold", "Griddle", "Assembly"] as const).map((station) => (
                    <Button
                      key={station}
                      type="button"
                      onClick={() => {
                        logPlanck("TRIGGER", "STATION_SELECT", `Station context shifted to: ${station}`);
                        triggerHaptic("light");
                        setFormData({ ...formData, station });
                      }}
                      className={`flex-1 h-[60px] min-h-[44px] rounded-2xl text-[13px] font-black uppercase tracking-wide transition-colors ${
                        formData.station === station
                          ? "bg-[#1D1D1F] text-white shadow-md"
                          : "bg-white text-[#86868B] shadow-sm hover:bg-[#E5E5EA]"
                      }`}
                    >
                      {station}
                    </Button>
                  ))}
                </div>
              </div>
            </form>
          </ScrollArea>

          <div className="fixed bottom-0 left-0 w-full p-6 bg-white/90 backdrop-blur-xl border-t z-50">
            <Button
              className="w-full h-[72px] min-h-[44px] text-2xl font-black rounded-[24px] bg-[#1D1D1F] text-white shadow-2xl active:scale-[0.98] transition-transform"
              onClick={handleSubmit}
              disabled={isProcessing}
            >
              {isProcessing ? "VAULTING..." : "LOG ARTIFACT"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
