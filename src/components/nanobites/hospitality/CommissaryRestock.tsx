/**
 * NANO-BITE ID: hosp.ft.ops.restock
 * NANO-BITE NAME: Commissary Restock Factory (Liquid 3D)
 * ROLE: Daily Operations / Inventory / Audit / Financials
 * INDUSTRY: tertiary.hospitality.food_truck
 *
 * Pico-Bites: Dashboard, Intake Factory (3 phases), Receive PO,
 * Physical Count, Audit Variance, Adjust Stock.
 * Live Supabase only — no mock data, no stubs.
 */

import React, {
  useState,
  useCallback,
  useEffect,
  useRef,
  useMemo,
} from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Plus,
  ChevronLeft,
  ChevronRight,
  Truck,
  ClipboardCheck,
  BarChart3,
  Edit3,
  X,
  QrCode,
  Layers,
  Info,
  AlertTriangle,
  Printer,
  Save,
  GripVertical,
  Minus,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";

// ============================================================================
// CONSTANTS
// ============================================================================
const UOMS = [
  "Each",
  "Pound",
  "Case",
  "Ounce",
  "Gallon",
  "Quart",
  "Sleeve",
  "Box",
  "1/6 Pan",
  "Full Pan",
];
const STORAGE_LOCATIONS = [
  "Walk-in Cooler",
  "Walk-in Freezer",
  "Dry Storage",
  "Reach-in",
  "Bar",
  "Prep Line",
];
const ADJUST_REASONS = [
  "Waste",
  "Spoilage",
  "Theft",
  "Recount Correction",
  "Scrap",
  "Transfer Out",
  "Transfer In",
];

// ============================================================================
// PLANCK LOGGING
// ============================================================================
function PicoLog(
  action: string,
  phase: "BEGIN" | "INFO" | "ERROR" | "END",
  payload?: unknown,
) {
  const ts = (
    typeof performance !== "undefined" ? performance.now() : Date.now()
  ).toFixed(4);
  // eslint-disable-next-line no-console
  console.log(`[${ts}ms][${phase}] PicoBite_${action}`, payload ?? "");
}

function haptic(kind: "light" | "heavy" = "light") {
  try {
    if (typeof window !== "undefined" && window.navigator?.vibrate) {
      window.navigator.vibrate(kind === "heavy" ? [40, 30, 40] : 25);
    }
  } catch (e) {
    PicoLog("Haptic", "ERROR", (e as Error).message);
  }
}

// ============================================================================
// TYPES (mirror live inventory_items columns)
// ============================================================================
interface InventoryItem {
  id: string;
  business_id: string;
  name: string;
  category: string | null;
  unit_of_measure: string | null;
  current_cost: number | null;
  par_level: number | null;
  current_stock: number | null;
  barcode: string | null;
  vendor_sku: string | null;
  storage_requirements: string | null;
  is_active: boolean | null;
}

interface IntakeForm {
  name: string;
  category: string;
  barcode: string;
  vendor_sku: string;
  unit_of_measure: string;
  current_stock: number;
  par_level: number;
  current_cost: number;
  storage_requirements: string;
  is_active: boolean;
}

const EMPTY_FORM: IntakeForm = {
  name: "",
  category: "",
  barcode: "",
  vendor_sku: "",
  unit_of_measure: "Each",
  current_stock: 0,
  par_level: 0,
  current_cost: 0,
  storage_requirements: "Dry Storage",
  is_active: true,
};

// ============================================================================
// MAIN FACTORY
// ============================================================================
const DEFAULT_ORDER = [
  "DASHBOARD",
  "INTAKE_FACTORY",
  "RECEIVE_PO",
  "PHYSICAL_COUNT",
  "AUDIT_VARIANCE",
  "ADJUST_STOCK",
] as const;
type CardId = (typeof DEFAULT_ORDER)[number];

export default function CommissaryRestockFactory({
  businessId,
}: {
  businessId: string;
}) {
  const orderKey = `idia.restock.order.${businessId}`;
  const [workflowOrder, setWorkflowOrder] = useState<CardId[]>(() => {
    if (typeof window === "undefined") return [...DEFAULT_ORDER];
    try {
      const raw = localStorage.getItem(orderKey);
      if (raw) {
        const parsed = JSON.parse(raw) as CardId[];
        if (
          Array.isArray(parsed) &&
          parsed.length === DEFAULT_ORDER.length &&
          DEFAULT_ORDER.every((c) => parsed.includes(c))
        ) {
          return parsed;
        }
      }
    } catch (e) {
      PicoLog("OrderHydrate", "ERROR", (e as Error).message);
    }
    return [...DEFAULT_ORDER];
  });

  const [activeIdx, setActiveIdx] = useState(0);
  const [isExploded, setIsExploded] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [locationId, setLocationId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [intakePhase, setIntakePhase] = useState<1 | 2 | 3>(1);
  const [formData, setFormData] = useState<IntakeForm>(EMPTY_FORM);

  const touchStart = useRef<{ x: number; y: number; t: number }>({
    x: 0,
    y: 0,
    t: 0,
  });
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ----- LIVE LEDGER SYNC ---------------------------------------------------
  const syncLedger = useCallback(async () => {
    PicoLog("SyncLedger", "BEGIN", { businessId });
    setIsLoading(true);
    try {
      const [itemsRes, locRes] = await Promise.all([
        supabase
          .from("inventory_items")
          .select(
            "id,business_id,name,category,unit_of_measure,current_cost,par_level,current_stock,barcode,vendor_sku,storage_requirements,is_active",
          )
          .eq("business_id", businessId)
          .order("name", { ascending: true }),
        supabase
          .from("business_locations")
          .select("id")
          .eq("business_id", businessId)
          .eq("is_active", true)
          .limit(1)
          .maybeSingle(),
      ]);
      if (itemsRes.error) throw itemsRes.error;
      if (locRes.error) throw locRes.error;
      setInventory((itemsRes.data ?? []) as InventoryItem[]);
      setLocationId(locRes.data?.id ?? null);
      PicoLog("SyncLedger", "INFO", {
        count: itemsRes.data?.length ?? 0,
        locationId: locRes.data?.id ?? null,
      });
    } catch (e) {
      PicoLog("SyncLedger", "ERROR", (e as Error).message);
      toast.error(`Ledger stall: ${(e as Error).message}`);
    } finally {
      setIsLoading(false);
      PicoLog("SyncLedger", "END");
    }
  }, [businessId]);

  useEffect(() => {
    if (businessId) void syncLedger();
  }, [syncLedger, businessId]);

  // ----- PERSIST WORKFLOW ORDER --------------------------------------------
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      localStorage.setItem(orderKey, JSON.stringify(workflowOrder));
    } catch (e) {
      PicoLog("OrderPersist", "ERROR", (e as Error).message);
    }
  }, [workflowOrder, orderKey]);

  // ----- GESTURE ENGINE -----------------------------------------------------
  const handleTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    touchStart.current = { x: t.clientX, y: t.clientY, t: Date.now() };
    longPressTimer.current = setTimeout(() => {
      PicoLog("EditMode", "INFO", "3000ms hold → wiggle");
      setIsEditMode(true);
      haptic("heavy");
    }, 3000);
  };

  const handleTouchMove = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    const end = e.changedTouches[0];
    const dx = end.clientX - touchStart.current.x;
    const dy = end.clientY - touchStart.current.y;
    const w = typeof window !== "undefined" ? window.innerWidth : 800;
    if (Math.abs(dx) > w * 0.4 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      PicoLog("Flip3D", "INFO", { dx, exploded: !isExploded });
      setIsExploded((v) => !v);
      haptic();
    }
  };

  // ----- LOADING STATE ------------------------------------------------------
  if (isLoading) {
    return (
      <div className="flex h-full min-h-[60vh] flex-col items-center justify-center gap-3 bg-[#FBFBFD]">
        <RefreshCw className="h-8 w-8 animate-spin text-[#007AFF]" />
        <p className="text-xs font-black uppercase tracking-widest text-[#86868B]">
          Planck Syncing Ledger…
        </p>
      </div>
    );
  }

  return (
    <div
      className="relative h-full min-h-[100svh] w-full overflow-hidden bg-[#FBFBFD] [perspective:1800px]"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      <style>{`
        @keyframes wiggle {
          0% { transform: rotate(-0.8deg); }
          50% { transform: rotate(0.8deg); }
          100% { transform: rotate(-0.8deg); }
        }
        .wiggle { animation: wiggle 0.13s infinite linear; }
        .preserve-3d { transform-style: preserve-3d; }
        @media print {
          body * { visibility: hidden !important; }
          #variance-print, #variance-print * { visibility: visible !important; }
          #variance-print { position: absolute; inset: 0; padding: 24px; }
          .no-print { display: none !important; }
        }
      `}</style>

      {/* FLIP 3D DECK */}
      <div className="relative h-[100svh] w-full preserve-3d">
        {workflowOrder.map((id, idx) => {
          const offset = idx - activeIdx;
          const isActive = offset === 0;

          let transform = `translateX(${offset * 35}px) translateZ(${
            -Math.abs(offset) * 180
          }px) rotateY(${-offset * 10}deg)`;

          if (isExploded) {
            transform = `translateY(${idx * 96}px) translateZ(-600px) rotateX(-190deg) rotateY(15deg)`;
          }

          const interactive = isActive && !isExploded;

          return (
            <div
              key={id}
              onClick={() => {
                if (!isEditMode && isExploded) {
                  setActiveIdx(idx);
                  setIsExploded(false);
                  haptic();
                }
              }}
              className={`absolute inset-0 transition-all duration-700 ease-[cubic-bezier(0.23,1,0.32,1)] ${
                isActive && !isExploded
                  ? "z-50"
                  : "z-10 opacity-40 grayscale"
              } ${isEditMode ? "wiggle" : ""}`}
              style={{
                transform,
                pointerEvents: interactive || isExploded || isEditMode
                  ? "auto"
                  : "none",
              }}
            >
              <div className="mx-auto flex h-full max-w-md flex-col bg-white shadow-2xl ring-1 ring-black/5 [border-radius:36px]">
                {/* Header */}
                <div className="flex items-center justify-between border-b border-[#F2F2F7] px-6 py-5">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#86868B]">
                      Commissary Factory
                    </p>
                    <h2 className="text-xl font-black tracking-tight text-[#1D1D1F]">
                      {id.replaceAll("_", " ")}
                    </h2>
                  </div>
                  {isEditMode ? (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (idx === 0) return;
                        const next = [...workflowOrder];
                        [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
                        setWorkflowOrder(next);
                        haptic();
                      }}
                      className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#F2F2F7] active:scale-95"
                      aria-label="Reorder up"
                    >
                      <GripVertical className="h-5 w-5 text-[#1D1D1F]" />
                    </button>
                  ) : (
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50">
                      <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-emerald-500" />
                    </div>
                  )}
                </div>

                {/* Workflow Body */}
                <ScrollArea className="flex-1">
                  <div className="px-6 py-5 pb-32">
                    {id === "DASHBOARD" && (
                      <DashboardView
                        items={inventory}
                        jumpTo={(target: CardId) =>
                          setActiveIdx(workflowOrder.indexOf(target))
                        }
                        onRefresh={syncLedger}
                      />
                    )}
                    {id === "INTAKE_FACTORY" && (
                      <IntakeFactory
                        phase={intakePhase}
                        setPhase={setIntakePhase}
                        data={formData}
                        setData={setFormData}
                        businessId={businessId}
                        onComplete={() => {
                          void syncLedger();
                          setFormData(EMPTY_FORM);
                          setIntakePhase(1);
                          setActiveIdx(0);
                        }}
                      />
                    )}
                    {id === "RECEIVE_PO" && (
                      <ReceivePO
                        items={inventory}
                        businessId={businessId}
                        onComplete={() => {
                          void syncLedger();
                          setActiveIdx(0);
                        }}
                      />
                    )}
                    {id === "PHYSICAL_COUNT" && (
                      <PhysicalCount
                        items={inventory}
                        businessId={businessId}
                        onComplete={() => {
                          void syncLedger();
                          setActiveIdx(0);
                        }}
                      />
                    )}
                    {id === "AUDIT_VARIANCE" && (
                      <AuditVariance
                        items={inventory}
                        businessId={businessId}
                      />
                    )}
                    {id === "ADJUST_STOCK" && (
                      <AdjustStock
                        items={inventory}
                        businessId={businessId}
                        onComplete={() => {
                          void syncLedger();
                          setActiveIdx(0);
                        }}
                      />
                    )}
                  </div>
                </ScrollArea>

                {/* Sticky Footer Nav */}
                {interactive && (
                  <div className="no-print flex items-center justify-between border-t border-[#F2F2F7] bg-white/95 px-6 py-4 backdrop-blur">
                    <button
                      onClick={() => {
                        const next =
                          (activeIdx - 1 + workflowOrder.length) %
                          workflowOrder.length;
                        setActiveIdx(next);
                        haptic();
                      }}
                      className="flex h-12 w-12 items-center justify-center rounded-full bg-[#F2F2F7] active:scale-90"
                      aria-label="Previous card"
                    >
                      <ChevronLeft className="h-5 w-5 text-[#1D1D1F]" />
                    </button>
                    <span className="text-[11px] font-black uppercase tracking-[0.2em] text-[#86868B]">
                      {isEditMode
                        ? "Edit Mode · Hold to drag"
                        : `${activeIdx + 1} / ${workflowOrder.length}`}
                    </span>
                    <button
                      onClick={() => {
                        const next = (activeIdx + 1) % workflowOrder.length;
                        setActiveIdx(next);
                        haptic();
                      }}
                      className="flex h-12 w-12 items-center justify-center rounded-full bg-[#007AFF] text-white active:scale-90"
                      aria-label="Next card"
                    >
                      <ChevronRight className="h-5 w-5" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* EDIT MODE PUBLISH BAR */}
      {isEditMode && (
        <button
          onClick={() => {
            setIsEditMode(false);
            haptic("heavy");
            toast.success("Workflow order published.");
          }}
          className="no-print fixed left-1/2 top-8 z-[100] -translate-x-1/2 rounded-full bg-[#FF3B30] px-10 py-4 text-sm font-black uppercase tracking-widest text-white shadow-2xl active:scale-95"
        >
          Publish Workflow
        </button>
      )}
    </div>
  );
}

// ============================================================================
// DASHBOARD
// ============================================================================
function DashboardView({
  items,
  jumpTo,
  onRefresh,
}: {
  items: InventoryItem[];
  jumpTo: (id: CardId) => void;
  onRefresh: () => Promise<void> | void;
}) {
  const lowStock = items.filter(
    (i) =>
      (i.current_stock ?? 0) <= (i.par_level ?? 0) && (i.par_level ?? 0) > 0,
  );

  const actions: Array<{
    id: CardId;
    label: string;
    path: string;
    icon: React.ReactNode;
    color: string;
  }> = [
    {
      id: "INTAKE_FACTORY",
      label: "Intake Factory",
      path: "Inventory / Items",
      icon: <Plus className="h-6 w-6 text-white" />,
      color: "bg-blue-500",
    },
    {
      id: "RECEIVE_PO",
      label: "Receive P.O.",
      path: "Purchasing / Receive",
      icon: <Truck className="h-6 w-6 text-white" />,
      color: "bg-emerald-500",
    },
    {
      id: "PHYSICAL_COUNT",
      label: "Physical Count",
      path: "Stock Take",
      icon: <ClipboardCheck className="h-6 w-6 text-white" />,
      color: "bg-amber-500",
    },
    {
      id: "AUDIT_VARIANCE",
      label: "Variance Audit",
      path: "Reports / Audit",
      icon: <BarChart3 className="h-6 w-6 text-white" />,
      color: "bg-purple-500",
    },
    {
      id: "ADJUST_STOCK",
      label: "Adjust Stock",
      path: "Inventory / Adjust",
      icon: <Edit3 className="h-6 w-6 text-white" />,
      color: "bg-red-500",
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-2xl font-black tracking-tight text-[#1D1D1F]">
            Operations Hub
          </h3>
          <p className="text-xs font-bold text-[#86868B]">
            {items.length} resident artifacts · {lowStock.length} below par
          </p>
        </div>
        <button
          onClick={() => void onRefresh()}
          className="flex h-11 w-11 items-center justify-center rounded-full bg-[#F2F2F7] active:scale-90"
          aria-label="Refresh ledger"
        >
          <RefreshCw className="h-4 w-4 text-[#1D1D1F]" />
        </button>
      </div>

      {lowStock.length > 0 && (
        <div className="flex items-center gap-3 rounded-3xl border border-amber-200 bg-amber-50 p-4">
          <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600" />
          <p className="text-xs font-bold text-amber-900">
            {lowStock.length} item{lowStock.length === 1 ? "" : "s"} at or below
            par level. Review Receive P.O.
          </p>
        </div>
      )}

      {actions.map((a) => (
        <button
          key={a.id}
          onClick={() => jumpTo(a.id)}
          className="flex w-full items-center gap-4 rounded-[28px] bg-[#F2F2F7] p-5 text-left transition-all active:scale-[0.98]"
        >
          <div
            className={`flex h-14 w-14 items-center justify-center rounded-2xl ${a.color}`}
          >
            {a.icon}
          </div>
          <div className="flex-1">
            <p className="text-base font-black text-[#1D1D1F]">{a.label}</p>
            <p className="text-[11px] font-bold uppercase tracking-widest text-[#86868B]">
              Path: {a.path}
            </p>
          </div>
          <ChevronRight className="h-5 w-5 text-[#86868B]" />
        </button>
      ))}
    </div>
  );
}

// ============================================================================
// INTAKE FACTORY (3 PHASES)
// ============================================================================
function IntakeFactory({
  phase,
  setPhase,
  data,
  setData,
  businessId,
  onComplete,
}: {
  phase: 1 | 2 | 3;
  setPhase: (p: 1 | 2 | 3) => void;
  data: IntakeForm;
  setData: React.Dispatch<React.SetStateAction<IntakeForm>>;
  businessId: string;
  onComplete: () => void;
}) {
  const [submitting, setSubmitting] = useState(false);

  const publish = async () => {
    PicoLog("Intake_Publish", "BEGIN", { sku: data.vendor_sku });
    if (!data.name.trim()) {
      toast.error("Item name is required.");
      return;
    }
    setSubmitting(true);
    try {
      const { error } = await supabase.from("inventory_items").insert({
        business_id: businessId,
        name: data.name.trim(),
        category: data.category.trim() || "Uncategorized",
        barcode: data.barcode.trim() || null,
        vendor_sku: data.vendor_sku.trim() || null,
        unit_of_measure: data.unit_of_measure,
        current_stock: data.current_stock,
        par_level: data.par_level,
        current_cost: data.current_cost,
        storage_requirements: data.storage_requirements,
        is_active: data.is_active,
      });
      if (error) throw error;
      haptic("heavy");
      toast.success("Artifact published to ledger.");
      PicoLog("Intake_Publish", "END");
      onComplete();
    } catch (e) {
      PicoLog("Intake_Publish", "ERROR", (e as Error).message);
      toast.error(`Publish stall: ${(e as Error).message}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex gap-2">
        {[1, 2, 3].map((p) => (
          <div
            key={p}
            className={`h-1.5 flex-1 rounded-full ${
              phase >= p ? "bg-[#007AFF]" : "bg-[#E5E5EA]"
            }`}
          />
        ))}
      </div>

      {phase === 1 && (
        <div className="space-y-5">
          <div>
            <h3 className="text-2xl font-black text-[#1D1D1F]">
              Phase 1 · Identification
            </h3>
            <p className="text-xs font-bold text-[#86868B]">
              Internal mapping & lookup keys
            </p>
          </div>

          <FieldShell label="Item Name *">
            <Input
              value={data.name}
              onChange={(e) =>
                setData((p) => ({ ...p, name: e.target.value }))
              }
              placeholder="Beef Patty 4oz"
              className="h-14 rounded-2xl border-none bg-[#F2F2F7] px-5 text-lg font-black"
            />
          </FieldShell>

          <FieldShell label="Category" hint="Used for kitchen routing">
            <Input
              value={data.category}
              onChange={(e) =>
                setData((p) => ({ ...p, category: e.target.value }))
              }
              placeholder="Protein, Produce, Bar…"
              className="h-14 rounded-2xl border-none bg-[#F2F2F7] px-5 text-lg font-black"
            />
          </FieldShell>

          <FieldShell label="Barcode / UPC">
            <div className="relative">
              <QrCode className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[#86868B]" />
              <Input
                value={data.barcode}
                onChange={(e) =>
                  setData((p) => ({ ...p, barcode: e.target.value }))
                }
                inputMode="numeric"
                placeholder="12-digit UPC"
                className="h-14 rounded-2xl border-none bg-[#F2F2F7] pl-12 text-lg font-black"
              />
            </div>
          </FieldShell>

          <FieldShell label="Vendor SKU">
            <Input
              value={data.vendor_sku}
              onChange={(e) =>
                setData((p) => ({ ...p, vendor_sku: e.target.value }))
              }
              placeholder="Supplier reference"
              className="h-14 rounded-2xl border-none bg-[#F2F2F7] px-5 text-lg font-black"
            />
          </FieldShell>

          <button
            onClick={() => setPhase(2)}
            className="h-16 w-full rounded-[28px] bg-black text-base font-black uppercase tracking-widest text-white shadow-xl active:scale-[0.98]"
          >
            Next · Configuration
          </button>
        </div>
      )}

      {phase === 2 && (
        <div className="space-y-5">
          <div>
            <h3 className="text-2xl font-black text-[#1D1D1F]">
              Phase 2 · Configuration
            </h3>
            <p className="text-xs font-bold text-[#86868B]">
              Inventory physics & tracking
            </p>
          </div>

          <FieldShell label="Unit of Measure">
            <select
              value={data.unit_of_measure}
              onChange={(e) =>
                setData((p) => ({ ...p, unit_of_measure: e.target.value }))
              }
              className="h-14 w-full appearance-none rounded-2xl border-none bg-[#F2F2F7] px-5 text-lg font-black outline-none"
            >
              {UOMS.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </FieldShell>

          <div className="grid grid-cols-2 gap-3">
            <FieldShell label="Initial Qty">
              <Stepper
                value={data.current_stock}
                onChange={(v) =>
                  setData((p) => ({ ...p, current_stock: v }))
                }
              />
            </FieldShell>
            <FieldShell label="Par Level">
              <Stepper
                value={data.par_level}
                onChange={(v) => setData((p) => ({ ...p, par_level: v }))}
              />
            </FieldShell>
          </div>

          <FieldShell label="Storage Location">
            <select
              value={data.storage_requirements}
              onChange={(e) =>
                setData((p) => ({
                  ...p,
                  storage_requirements: e.target.value,
                }))
              }
              className="h-14 w-full appearance-none rounded-2xl border-none bg-[#F2F2F7] px-5 text-lg font-black outline-none"
            >
              {STORAGE_LOCATIONS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </FieldShell>

          <div className="flex items-center justify-between rounded-2xl bg-[#F2F2F7] px-5 py-4">
            <div>
              <p className="text-base font-black text-[#1D1D1F]">
                Active in POS
              </p>
              <p className="text-[11px] font-bold text-[#86868B]">
                Disable to hide without deleting
              </p>
            </div>
            <Switch
              checked={data.is_active}
              onCheckedChange={(v) =>
                setData((p) => ({ ...p, is_active: v }))
              }
            />
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => setPhase(1)}
              className="flex h-16 w-16 items-center justify-center rounded-[28px] bg-[#F2F2F7] active:scale-95"
              aria-label="Back"
            >
              <ChevronLeft className="h-6 w-6 text-[#1D1D1F]" />
            </button>
            <button
              onClick={() => setPhase(3)}
              className="h-16 flex-1 rounded-[28px] bg-black text-base font-black uppercase tracking-widest text-white shadow-xl active:scale-[0.98]"
            >
              Next · Financials
            </button>
          </div>
        </div>
      )}

      {phase === 3 && (
        <div className="space-y-5">
          <div>
            <h3 className="text-2xl font-black text-[#1D1D1F]">
              Phase 3 · Financials
            </h3>
            <p className="text-xs font-bold text-[#86868B]">
              Cost basis for variance & COGS
            </p>
          </div>

          <FieldShell label="Cost Per Unit" hint="USD, exclusive of tax">
            <div className="relative">
              <span className="pointer-events-none absolute left-5 top-1/2 -translate-y-1/2 text-lg font-black text-[#86868B]">
                $
              </span>
              <Input
                type="number"
                inputMode="decimal"
                step="0.01"
                value={data.current_cost}
                onChange={(e) =>
                  setData((p) => ({
                    ...p,
                    current_cost: Number(e.target.value) || 0,
                  }))
                }
                className="h-14 rounded-2xl border-none bg-[#F2F2F7] pl-10 text-lg font-black"
              />
            </div>
          </FieldShell>

          <div className="flex items-start gap-3 rounded-2xl bg-blue-50 p-4">
            <Info className="h-5 w-5 shrink-0 text-blue-600" />
            <p className="text-[11px] font-bold text-blue-900">
              Sales price, tax category, and kitchen-print group require a
              schema migration and are not persisted in this intake. Configure
              them in the POS once columns are added.
            </p>
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => setPhase(2)}
              className="flex h-16 w-16 items-center justify-center rounded-[28px] bg-[#F2F2F7] active:scale-95"
              aria-label="Back"
            >
              <ChevronLeft className="h-6 w-6 text-[#1D1D1F]" />
            </button>
            <button
              onClick={() => void publish()}
              disabled={submitting}
              className="h-16 flex-1 rounded-[28px] bg-emerald-600 text-base font-black uppercase tracking-widest text-white shadow-xl active:scale-[0.98] disabled:opacity-60"
            >
              {submitting ? "Publishing…" : "Publish to Ledger"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// RECEIVE P.O.
// ============================================================================
function ReceivePO({
  items,
  businessId,
  onComplete,
}: {
  items: InventoryItem[];
  businessId: string;
  onComplete: () => void;
}) {
  const [updates, setUpdates] = useState<Record<string, number>>({});
  const [committing, setCommitting] = useState(false);
  const [filter, setFilter] = useState("");

  const visible = useMemo(
    () =>
      items.filter((i) =>
        i.name.toLowerCase().includes(filter.toLowerCase().trim()),
      ),
    [items, filter],
  );

  const setQty = (id: string, qty: number) =>
    setUpdates((p) => ({ ...p, [id]: qty }));

  const commit = async () => {
    PicoLog("ReceivePO_Commit", "BEGIN");
    const entries = Object.entries(updates).filter(([, q]) => q && q !== 0);
    if (entries.length === 0) {
      toast.error("Nothing to receive.");
      return;
    }
    setCommitting(true);
    try {
      for (const [itemId, qty] of entries) {
        const item = items.find((i) => i.id === itemId);
        if (!item) continue;
        const before = Number(item.current_stock ?? 0);
        const after = before + Number(qty);
        const unitCost = Number(item.current_cost ?? 0);
        const { error: adjErr } = await supabase
          .from("inventory_adjustments")
          .insert({
            business_id: businessId,
            inventory_item_id: itemId,
            adjustment_type: "restock",
            adjustment_quantity: Math.round(Number(qty)),
            quantity_before: Math.round(before),
            quantity_after: Math.round(after),
            unit_cost: unitCost,
            total_value: unitCost * Number(qty),
            reason: "Receive P.O.",
          });
        if (adjErr) throw adjErr;
        const { error: stockErr } = await supabase
          .from("inventory_items")
          .update({ current_stock: after })
          .eq("id", itemId);
        if (stockErr) throw stockErr;
        PicoLog("ReceivePO_Item", "INFO", { itemId, before, after });
      }
      haptic("heavy");
      toast.success("Stock load-in synchronized.");
      PicoLog("ReceivePO_Commit", "END");
      onComplete();
    } catch (e) {
      PicoLog("ReceivePO_Commit", "ERROR", (e as Error).message);
      toast.error(`Receive stall: ${(e as Error).message}`);
    } finally {
      setCommitting(false);
    }
  };

  if (items.length === 0) return <EmptyState label="No artifacts on ledger. Use Intake Factory first." />;

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-2xl font-black text-[#1D1D1F]">Receive P.O.</h3>
        <p className="text-xs font-bold text-[#86868B]">
          Scan barcode or select item, set quantity, save & sync
        </p>
      </div>

      <Input
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder="Filter items…"
        className="h-12 rounded-2xl border-none bg-[#F2F2F7] px-5 font-black"
      />

      <div className="space-y-3">
        {visible.map((i) => (
          <div
            key={i.id}
            className="flex items-center justify-between gap-3 rounded-2xl bg-[#F2F2F7] p-4"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-black text-[#1D1D1F]">
                {i.name}
              </p>
              <p className="text-[10px] font-bold uppercase tracking-widest text-[#86868B]">
                On hand: {Number(i.current_stock ?? 0)} {i.unit_of_measure ?? ""}
              </p>
            </div>
            <Stepper
              value={updates[i.id] ?? 0}
              onChange={(v) => setQty(i.id, v)}
              compact
            />
          </div>
        ))}
      </div>

      <button
        onClick={() => void commit()}
        disabled={committing}
        className="h-16 w-full rounded-[28px] bg-emerald-600 text-base font-black uppercase tracking-widest text-white shadow-xl active:scale-[0.98] disabled:opacity-60"
      >
        <span className="inline-flex items-center justify-center gap-2">
          <Save className="h-5 w-5" />
          {committing ? "Syncing…" : "Save & Sync Stock"}
        </span>
      </button>
    </div>
  );
}

// ============================================================================
// PHYSICAL COUNT
// ============================================================================
function PhysicalCount({
  items,
  businessId,
  onComplete,
}: {
  items: InventoryItem[];
  businessId: string;
  onComplete: () => void;
}) {
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [committing, setCommitting] = useState(false);

  const commit = async () => {
    PicoLog("PhysicalCount_Commit", "BEGIN");
    const entries = Object.entries(counts).filter(([, v]) => v !== "");
    if (entries.length === 0) {
      toast.error("Nothing counted.");
      return;
    }
    setCommitting(true);
    try {
      for (const [itemId, raw] of entries) {
        const item = items.find((i) => i.id === itemId);
        if (!item) continue;
        const counted = Number(raw);
        if (Number.isNaN(counted)) continue;
        const before = Number(item.current_stock ?? 0);
        const delta = counted - before;
        const unitCost = Number(item.current_cost ?? 0);
        const { error: adjErr } = await supabase
          .from("inventory_adjustments")
          .insert({
            business_id: businessId,
            inventory_item_id: itemId,
            adjustment_type: "physical_count",
            adjustment_quantity: Math.round(delta),
            quantity_before: Math.round(before),
            quantity_after: Math.round(counted),
            unit_cost: unitCost,
            total_value: unitCost * delta,
            reason: "Stock take",
          });
        if (adjErr) throw adjErr;
        const { error: stockErr } = await supabase
          .from("inventory_items")
          .update({ current_stock: counted })
          .eq("id", itemId);
        if (stockErr) throw stockErr;
      }
      haptic("heavy");
      toast.success("Count logged & ledger reconciled.");
      PicoLog("PhysicalCount_Commit", "END");
      onComplete();
    } catch (e) {
      PicoLog("PhysicalCount_Commit", "ERROR", (e as Error).message);
      toast.error(`Count stall: ${(e as Error).message}`);
    } finally {
      setCommitting(false);
    }
  };

  if (items.length === 0)
    return <EmptyState label="No artifacts to count." />;

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-2xl font-black text-[#1D1D1F]">Physical Count</h3>
        <p className="text-xs font-bold text-[#86868B]">
          Shelf-to-sheet · Enter what you actually see
        </p>
      </div>

      <div className="space-y-3">
        {items.map((i) => (
          <div key={i.id} className="rounded-2xl bg-[#F2F2F7] p-4">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-black text-[#1D1D1F]">{i.name}</p>
              <span className="text-[10px] font-bold uppercase tracking-widest text-[#86868B]">
                System: {Number(i.current_stock ?? 0)} {i.unit_of_measure ?? ""}
              </span>
            </div>
            <Input
              value={counts[i.id] ?? ""}
              onChange={(e) =>
                setCounts((p) => ({ ...p, [i.id]: e.target.value }))
              }
              type="number"
              inputMode="decimal"
              placeholder="Counted qty"
              className="h-14 rounded-xl border-none bg-white text-center text-2xl font-black"
            />
          </div>
        ))}
      </div>

      <button
        onClick={() => void commit()}
        disabled={committing}
        className="h-16 w-full rounded-[28px] bg-amber-500 text-base font-black uppercase tracking-widest text-white shadow-xl active:scale-[0.98] disabled:opacity-60"
      >
        <span className="inline-flex items-center justify-center gap-2">
          <ClipboardCheck className="h-5 w-5" />
          {committing ? "Reconciling…" : "Mark Count Complete"}
        </span>
      </button>
    </div>
  );
}

// ============================================================================
// AUDIT VARIANCE
// ============================================================================
interface AdjustmentRow {
  id: string;
  inventory_item_id: string;
  adjustment_type: string;
  adjustment_quantity: number | null;
  quantity_before: number | null;
  quantity_after: number | null;
  unit_cost: number | null;
  total_value: number | null;
  reason: string | null;
  created_at: string;
}

function AuditVariance({
  items,
  businessId,
}: {
  items: InventoryItem[];
  businessId: string;
}) {
  const [adjustments, setAdjustments] = useState<AdjustmentRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    PicoLog("Variance_Load", "BEGIN");
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("inventory_adjustments")
        .select(
          "id,inventory_item_id,adjustment_type,adjustment_quantity,quantity_before,quantity_after,unit_cost,total_value,reason,created_at",
        )
        .eq("business_id", businessId)
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      setAdjustments((data ?? []) as AdjustmentRow[]);
      PicoLog("Variance_Load", "END", { count: data?.length ?? 0 });
    } catch (e) {
      PicoLog("Variance_Load", "ERROR", (e as Error).message);
      toast.error(`Audit stall: ${(e as Error).message}`);
    } finally {
      setLoading(false);
    }
  }, [businessId]);

  useEffect(() => {
    void load();
  }, [load]);

  const variances = useMemo(() => {
    const byItem = new Map<string, number>();
    const valueByItem = new Map<string, number>();
    for (const a of adjustments) {
      const q = Number(a.adjustment_quantity ?? 0);
      const v = Number(a.total_value ?? 0);
      byItem.set(a.inventory_item_id, (byItem.get(a.inventory_item_id) ?? 0) + q);
      valueByItem.set(
        a.inventory_item_id,
        (valueByItem.get(a.inventory_item_id) ?? 0) + v,
      );
    }
    return items.map((i) => ({
      item: i,
      net: byItem.get(i.id) ?? 0,
      value: valueByItem.get(i.id) ?? 0,
    }));
  }, [adjustments, items]);

  const totalValue = variances.reduce((s, r) => s + r.value, 0);

  const printReport = () => {
    PicoLog("Variance_Print", "INFO");
    haptic();
    if (typeof window !== "undefined") window.print();
  };

  if (loading) return <EmptyState label="Loading variance ledger…" />;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between no-print">
        <div>
          <h3 className="text-2xl font-black text-[#1D1D1F]">
            Audit Variance
          </h3>
          <p className="text-xs font-bold text-[#86868B]">
            Net movement & dollar impact, last 500 adjustments
          </p>
        </div>
        <button
          onClick={printReport}
          className="flex h-12 items-center gap-2 rounded-full bg-[#1D1D1F] px-5 text-xs font-black uppercase tracking-widest text-white active:scale-95"
        >
          <Printer className="h-4 w-4" />
          Print
        </button>
      </div>

      <div id="variance-print">
        <div className="mb-4 rounded-2xl bg-[#F2F2F7] p-5">
          <p className="text-[10px] font-black uppercase tracking-widest text-[#86868B]">
            Net Variance Value
          </p>
          <p
            className={`text-3xl font-black ${
              totalValue < 0 ? "text-red-600" : "text-emerald-600"
            }`}
          >
            {totalValue < 0 ? "-" : ""}${Math.abs(totalValue).toFixed(2)}
          </p>
          <p className="text-[10px] font-bold text-[#86868B]">
            {adjustments.length} adjustment events recorded
          </p>
        </div>

        <div className="overflow-hidden rounded-2xl border border-[#F2F2F7]">
          <div className="grid grid-cols-12 gap-2 bg-[#FBFBFD] px-4 py-3 text-[10px] font-black uppercase tracking-widest text-[#86868B]">
            <span className="col-span-6">Artifact</span>
            <span className="col-span-3 text-right">On Hand</span>
            <span className="col-span-3 text-right">Net Δ</span>
          </div>
          {variances.map((v) => (
            <div
              key={v.item.id}
              className="grid grid-cols-12 items-center gap-2 border-t border-[#F2F2F7] px-4 py-3"
            >
              <div className="col-span-6 min-w-0">
                <p className="truncate text-sm font-black text-[#1D1D1F]">
                  {v.item.name}
                </p>
                <p className="text-[10px] font-bold uppercase tracking-widest text-[#86868B]">
                  {v.item.vendor_sku ?? v.item.barcode ?? "—"}
                </p>
              </div>
              <span className="col-span-3 text-right text-sm font-black text-[#1D1D1F]">
                {Number(v.item.current_stock ?? 0)}
              </span>
              <span
                className={`col-span-3 text-right text-sm font-black ${
                  v.net < 0
                    ? "text-red-600"
                    : v.net > 0
                      ? "text-emerald-600"
                      : "text-[#86868B]"
                }`}
              >
                {v.net > 0 ? "+" : ""}
                {v.net}
              </span>
            </div>
          ))}
          {variances.length === 0 && (
            <div className="px-4 py-8 text-center text-xs font-bold text-[#86868B]">
              No artifacts to audit.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// ADJUST STOCK
// ============================================================================
function AdjustStock({
  items,
  businessId,
  onComplete,
}: {
  items: InventoryItem[];
  businessId: string;
  onComplete: () => void;
}) {
  const [target, setTarget] = useState<InventoryItem | null>(null);
  const [reason, setReason] = useState<string>(ADJUST_REASONS[0]);
  const [qty, setQty] = useState<string>("");
  const [committing, setCommitting] = useState(false);
  const [filter, setFilter] = useState("");

  const visible = useMemo(
    () =>
      items.filter((i) =>
        i.name.toLowerCase().includes(filter.toLowerCase().trim()),
      ),
    [items, filter],
  );

  const commit = async () => {
    if (!target) return;
    const delta = Number(qty);
    if (Number.isNaN(delta) || delta === 0) {
      toast.error("Enter a non-zero offset.");
      return;
    }
    PicoLog("AdjustStock_Commit", "BEGIN", { itemId: target.id, delta });
    setCommitting(true);
    try {
      const before = Number(target.current_stock ?? 0);
      const after = before + delta;
      const unitCost = Number(target.current_cost ?? 0);
      const { error: adjErr } = await supabase
        .from("inventory_adjustments")
        .insert({
          business_id: businessId,
          inventory_item_id: target.id,
          adjustment_type: "manual_override",
          adjustment_quantity: Math.round(delta),
          quantity_before: Math.round(before),
          quantity_after: Math.round(after),
          unit_cost: unitCost,
          total_value: unitCost * delta,
          reason,
        });
      if (adjErr) throw adjErr;
      const { error: stockErr } = await supabase
        .from("inventory_items")
        .update({ current_stock: after })
        .eq("id", target.id);
      if (stockErr) throw stockErr;
      haptic("heavy");
      toast.success("Ledger correction published.");
      PicoLog("AdjustStock_Commit", "END");
      onComplete();
    } catch (e) {
      PicoLog("AdjustStock_Commit", "ERROR", (e as Error).message);
      toast.error(`Adjust stall: ${(e as Error).message}`);
    } finally {
      setCommitting(false);
    }
  };

  if (items.length === 0)
    return <EmptyState label="No artifacts to adjust." />;

  if (!target) {
    return (
      <div className="space-y-4">
        <div>
          <h3 className="text-2xl font-black text-[#1D1D1F]">Adjust Stock</h3>
          <p className="text-xs font-bold text-[#86868B]">
            Select an artifact to correct
          </p>
        </div>
        <Input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter items…"
          className="h-12 rounded-2xl border-none bg-[#F2F2F7] px-5 font-black"
        />
        <div className="space-y-2">
          {visible.map((i) => (
            <button
              key={i.id}
              onClick={() => {
                setTarget(i);
                haptic();
              }}
              className="flex w-full items-center justify-between rounded-2xl bg-[#F2F2F7] p-4 text-left active:scale-[0.98]"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-black uppercase text-[#1D1D1F]">
                  {i.name}
                </p>
                <p className="text-[10px] font-bold uppercase tracking-widest text-[#86868B]">
                  {Number(i.current_stock ?? 0)} {i.unit_of_measure ?? ""}
                </p>
              </div>
              <ChevronRight className="h-5 w-5 text-[#86868B]" />
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="rounded-2xl bg-[#F2F2F7] p-5">
        <p className="text-[10px] font-black uppercase tracking-widest text-[#86868B]">
          Selected
        </p>
        <p className="text-xl font-black text-[#1D1D1F]">{target.name}</p>
        <p className="text-xs font-bold text-[#86868B]">
          On hand: {Number(target.current_stock ?? 0)}{" "}
          {target.unit_of_measure ?? ""}
        </p>
      </div>

      <FieldShell label="Reason">
        <select
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="h-14 w-full appearance-none rounded-2xl border-none bg-[#F2F2F7] px-5 text-lg font-black outline-none"
        >
          {ADJUST_REASONS.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </FieldShell>

      <FieldShell label="Offset (+/-)" hint="Negative for waste, positive for find">
        <Input
          value={qty}
          onChange={(e) => setQty(e.target.value)}
          type="number"
          inputMode="decimal"
          placeholder="-5"
          className="h-20 rounded-[24px] border-none bg-[#F2F2F7] text-center text-3xl font-black"
        />
      </FieldShell>

      <div className="flex gap-3">
        <button
          onClick={() => {
            setTarget(null);
            setQty("");
          }}
          className="flex h-16 w-16 items-center justify-center rounded-[28px] bg-[#F2F2F7] active:scale-95"
          aria-label="Back"
        >
          <X className="h-6 w-6 text-[#1D1D1F]" />
        </button>
        <button
          onClick={() => void commit()}
          disabled={committing}
          className="h-16 flex-1 rounded-[28px] bg-red-600 text-base font-black uppercase tracking-widest text-white shadow-xl active:scale-[0.98] disabled:opacity-60"
        >
          <span className="inline-flex items-center justify-center gap-2">
            <Layers className="h-5 w-5" />
            {committing ? "Logging…" : "Log Adjustment"}
          </span>
        </button>
      </div>
    </div>
  );
}

// ============================================================================
// SHARED PRIMITIVES
// ============================================================================
function FieldShell({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <label className="text-[11px] font-black uppercase tracking-widest text-[#86868B]">
        {label}
      </label>
      {children}
      {hint && (
        <p className="text-[10px] font-bold text-[#86868B]">{hint}</p>
      )}
    </div>
  );
}

function Stepper({
  value,
  onChange,
  compact,
}: {
  value: number;
  onChange: (v: number) => void;
  compact?: boolean;
}) {
  const dec = () => {
    onChange(Math.max(0, value - 1));
    haptic();
  };
  const inc = () => {
    onChange(value + 1);
    haptic();
  };
  return (
    <div
      className={`flex items-center gap-2 rounded-2xl bg-white ${
        compact ? "" : "p-1"
      }`}
    >
      <button
        type="button"
        onClick={dec}
        className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#E5E5EA] active:scale-90"
        aria-label="Decrement"
      >
        <Minus className="h-4 w-4 text-[#1D1D1F]" />
      </button>
      <Input
        type="number"
        inputMode="numeric"
        value={String(value)}
        onChange={(e) => onChange(Number(e.target.value) || 0)}
        className="h-11 w-16 rounded-xl border-none bg-transparent text-center text-lg font-black"
      />
      <button
        type="button"
        onClick={inc}
        className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#007AFF] active:scale-90"
        aria-label="Increment"
      >
        <Plus className="h-4 w-4 text-white" />
      </button>
    </div>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 text-center">
      <Layers className="h-10 w-10 text-[#D2D2D7]" />
      <p className="text-xs font-black uppercase tracking-widest text-[#86868B]">
        {label}
      </p>
    </div>
  );
}
