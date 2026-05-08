/**
 * NANO-BITE ID: hosp.ft.ops.tva.variance
 * NANO-BITE NAME: TvA Variance Manager (Theoretical vs Actual)
 * ROLE: Daily Operations / Inventory Audit / Loss Reconciliation
 * INDUSTRY: tertiary.hospitality.food_truck
 *
 * A-Z lifecycle in a box:
 *   Discovery → List Pending Variances → Detail (Flip 3D)
 *   → Root Cause + Corrective Action → Manager PIN → Server-Side Hash + Resolve
 *
 * Self-sovereign: reads tenant from useActiveBusinessId(); never trusts props.
 * No mock data. Live Supabase only. Powers through errors via LiquidOSErrorBoundary.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useActiveBusinessId } from "@/lib/idia/ActiveBusinessContext";
import { LiquidOSErrorBoundary } from "@/lib/error-boundary";
import { logPlanck } from "@/lib/error-capture";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  Loader2,
  RotateCcw,
  ShieldCheck,
} from "lucide-react";

// ---------- Types matching the live ledger ----------
type Variance = {
  id: string;
  business_id: string;
  batch_id: string;
  item_name: string;
  unit: string;
  theoretical_yield: number;
  actual_yield: number;
  variance_amount: number;
  tolerance_threshold: number;
  unit_cost: number;
  value_lost: number;
  status: "pending" | "resolved";
  created_at: string;
  resolved_at: string | null;
};

const ROOT_CAUSES = ["Poor Trim", "Spillage", "Unrecorded Waste", "Theft"] as const;
const CORRECTIVE_ACTIONS = ["Par Adjustment", "Staff Re-training", "Vendor Claim"] as const;

type RootCause = (typeof ROOT_CAUSES)[number];
type Corrective = (typeof CORRECTIVE_ACTIONS)[number];

// ============================================================================
// PUBLIC ENTRY — wraps in error boundary so a null tenant degrades gracefully.
// ============================================================================
export default function TvAVarianceManager() {
  return (
    <LiquidOSErrorBoundary>
      <TvAVarianceManagerInner />
    </LiquidOSErrorBoundary>
  );
}

// ============================================================================
// INNER COMPONENT
// ============================================================================
function TvAVarianceManagerInner() {
  const businessId = useActiveBusinessId();

  const [variances, setVariances] = useState<Variance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Form state for the active correction
  const [rootCause, setRootCause] = useState<RootCause | null>(null);
  const [corrective, setCorrective] = useState<Corrective | null>(null);
  const [pin, setPin] = useState("");

  // ---------- Tenant gate: null context = stall, not "default" ----------
  if (!businessId) {
    logPlanck("STALL", "TVA_TENANT_NULL", "TvAVarianceManager mounted without business context.");
    throw new Error(
      "Tenant Context Null: TvA Variance Manager cannot bind to a business. Re-provision the terminal.",
    );
  }

  // ---------- Discovery engine ----------
  const fetchVariances = useCallback(async () => {
    logPlanck("START", "TVA_DISCOVERY", `Fetching variances for business ${businessId}`);
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase
      .from("inventory_variances")
      .select(
        "id,business_id,batch_id,item_name,unit,theoretical_yield,actual_yield,variance_amount,tolerance_threshold,unit_cost,value_lost,status,created_at,resolved_at",
      )
      .eq("business_id", businessId)
      .order("created_at", { ascending: false })
      .limit(200);
    if (err) {
      logPlanck("END", "TVA_DISCOVERY", `FAIL: ${err.message}`);
      setError(err.message);
      setVariances([]);
    } else {
      logPlanck("END", "TVA_DISCOVERY", `OK: ${data?.length ?? 0} rows`);
      setVariances((data as Variance[]) ?? []);
    }
    setLoading(false);
  }, [businessId]);

  useEffect(() => {
    fetchVariances();
  }, [fetchVariances]);

  const pending = useMemo(
    () => variances.filter((v) => v.status === "pending"),
    [variances],
  );
  const resolved = useMemo(
    () => variances.filter((v) => v.status === "resolved"),
    [variances],
  );

  const totals = useMemo(() => {
    const totalLoss = pending.reduce((s, v) => s + Number(v.value_lost || 0), 0);
    const breaches = pending.filter(
      (v) => Math.abs(Number(v.variance_amount)) > Number(v.tolerance_threshold || 0),
    ).length;
    return { totalLoss, breaches };
  }, [pending]);

  const active = activeId ? variances.find((v) => v.id === activeId) ?? null : null;

  // ---------- Submit correction via SECURITY DEFINER RPC ----------
  const submitCorrection = useCallback(async () => {
    if (!active || !rootCause || !corrective) return;
    if (!/^\d{4,}$/.test(pin)) {
      setError("Manager PIN must be at least 4 digits.");
      return;
    }
    setSubmitting(true);
    setError(null);
    logPlanck("TRIGGER", "TVA_RECONCILE", `Posting correction for variance ${active.id}`);
    const { error: err } = await supabase.rpc("submit_variance_correction", {
      _variance_id: active.id,
      _root_cause: rootCause,
      _corrective_action: corrective,
      _manager_pin: pin,
    });
    setSubmitting(false);
    if (err) {
      logPlanck("END", "TVA_RECONCILE", `FAIL: ${err.message}`);
      setError(err.message);
      return;
    }
    logPlanck("END", "TVA_RECONCILE", "OK: variance resolved.");
    setRootCause(null);
    setCorrective(null);
    setPin("");
    setActiveId(null);
    await fetchVariances();
  }, [active, rootCause, corrective, pin, fetchVariances]);

  // ============================ RENDER ============================
  return (
    <div className="w-full min-h-full bg-[#F2F2F7] text-black p-4 pb-32">
      {/* HEADER */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-black tracking-tight">TvA Variance Manager</h1>
          <p className="text-xs text-neutral-500 font-medium">
            Theoretical vs Actual · Live Ledger
          </p>
        </div>
        <Button
          type="button"
          onClick={fetchVariances}
          className="h-11 min-w-11 rounded-2xl bg-white text-black font-bold shadow-sm hover:bg-white/90"
          aria-label="Refresh variances"
        >
          <RotateCcw className="h-5 w-5" />
        </Button>
      </div>

      {/* KPI STRIP */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        <Kpi label="Pending" value={pending.length.toString()} tone="warn" />
        <Kpi label="Tolerance Breaches" value={totals.breaches.toString()} tone="alert" />
        <Kpi
          label="Value Lost ($)"
          value={totals.totalLoss.toFixed(2)}
          tone={totals.totalLoss > 0 ? "alert" : "ok"}
        />
      </div>

      {/* ERROR BAND */}
      {error && (
        <div className="mb-3 rounded-2xl bg-red-50 border border-red-200 px-4 py-3 text-sm font-semibold text-red-700 flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* LIST */}
      {loading ? (
        <div className="h-40 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-neutral-500" />
        </div>
      ) : (
        <ScrollArea className="h-[55vh] rounded-3xl bg-white shadow-sm">
          <div className="divide-y divide-neutral-100">
            <SectionHeader>Pending Reconciliation ({pending.length})</SectionHeader>
            {pending.length === 0 && (
              <EmptyRow text="No open variances. Inventory is in alignment." />
            )}
            {pending.map((v) => (
              <VarianceRow key={v.id} v={v} onOpen={() => setActiveId(v.id)} />
            ))}

            <SectionHeader>Resolved ({resolved.length})</SectionHeader>
            {resolved.length === 0 && <EmptyRow text="No resolved corrections yet." />}
            {resolved.slice(0, 50).map((v) => (
              <VarianceRow key={v.id} v={v} resolved onOpen={() => setActiveId(v.id)} />
            ))}
          </div>
        </ScrollArea>
      )}

      {/* DETAIL MODAL — Flip 3D explosion */}
      {active && (
        <DetailOverlay
          v={active}
          rootCause={rootCause}
          setRootCause={setRootCause}
          corrective={corrective}
          setCorrective={setCorrective}
          pin={pin}
          setPin={setPin}
          submitting={submitting}
          onCancel={() => {
            setActiveId(null);
            setRootCause(null);
            setCorrective(null);
            setPin("");
            setError(null);
          }}
          onSubmit={submitCorrection}
          locked={active.status === "resolved"}
        />
      )}
    </div>
  );
}

// ============================================================================
// SUBCOMPONENTS
// ============================================================================
function Kpi({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "ok" | "warn" | "alert";
}) {
  const toneClass =
    tone === "alert"
      ? "bg-red-500 text-white"
      : tone === "warn"
        ? "bg-amber-400 text-black"
        : "bg-emerald-500 text-white";
  return (
    <div className="rounded-2xl bg-white shadow-sm p-3 flex flex-col items-start">
      <span className="text-[10px] uppercase tracking-wider font-bold text-neutral-500">
        {label}
      </span>
      <span className={`mt-1 px-2 py-0.5 rounded-lg text-lg font-black ${toneClass}`}>
        {value}
      </span>
    </div>
  );
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-4 py-2 bg-[#F2F2F7] text-[11px] uppercase tracking-wider font-black text-neutral-500 sticky top-0 z-10">
      {children}
    </div>
  );
}

function EmptyRow({ text }: { text: string }) {
  return <div className="px-4 py-6 text-sm text-neutral-400 text-center">{text}</div>;
}

function VarianceRow({
  v,
  onOpen,
  resolved,
}: {
  v: Variance;
  onOpen: () => void;
  resolved?: boolean;
}) {
  const breach = Math.abs(Number(v.variance_amount)) > Number(v.tolerance_threshold || 0);
  const sign = v.variance_amount >= 0 ? "+" : "";
  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full text-left px-4 py-4 flex items-center gap-3 active:bg-neutral-100 min-h-[64px]"
    >
      <div
        className={`h-11 w-11 rounded-2xl flex items-center justify-center shrink-0 ${
          resolved
            ? "bg-emerald-100 text-emerald-700"
            : breach
              ? "bg-red-100 text-red-600"
              : "bg-amber-100 text-amber-700"
        }`}
      >
        {resolved ? (
          <CheckCircle2 className="h-5 w-5" />
        ) : (
          <AlertTriangle className="h-5 w-5" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-black truncate">{v.item_name}</div>
        <div className="text-[11px] text-neutral-500 font-medium truncate">
          Batch {v.batch_id} · Theoretical {v.theoretical_yield} {v.unit} · Actual{" "}
          {v.actual_yield} {v.unit}
        </div>
      </div>
      <div className="text-right shrink-0">
        <div className={`text-base font-black ${breach ? "text-red-600" : "text-neutral-700"}`}>
          {sign}
          {Number(v.variance_amount).toFixed(2)}
        </div>
        <div className="text-[11px] text-neutral-500 font-bold">
          ${Number(v.value_lost).toFixed(2)} lost
        </div>
      </div>
    </button>
  );
}

function DetailOverlay({
  v,
  rootCause,
  setRootCause,
  corrective,
  setCorrective,
  pin,
  setPin,
  submitting,
  onCancel,
  onSubmit,
  locked,
}: {
  v: Variance;
  rootCause: RootCause | null;
  setRootCause: (r: RootCause) => void;
  corrective: Corrective | null;
  setCorrective: (c: Corrective) => void;
  pin: string;
  setPin: (s: string) => void;
  submitting: boolean;
  onCancel: () => void;
  onSubmit: () => void;
  locked: boolean;
}) {
  // Flip-3D entrance: 190deg → 0deg over 320ms
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.transform = "perspective(1200px) rotateY(190deg) scale(0.6)";
    el.style.opacity = "0";
    requestAnimationFrame(() => {
      el.style.transition = "transform 320ms cubic-bezier(0.2,0.8,0.2,1), opacity 220ms";
      el.style.transform = "perspective(1200px) rotateY(0deg) scale(1)";
      el.style.opacity = "1";
    });
  }, []);

  const breach = Math.abs(Number(v.variance_amount)) > Number(v.tolerance_threshold || 0);

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-end sm:items-center justify-center p-3">
      <div
        ref={ref}
        className="w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]"
        style={{ transformStyle: "preserve-3d" }}
      >
        {/* HEADER */}
        <div className="px-5 py-4 flex items-center gap-3 border-b border-neutral-100">
          <Button
            type="button"
            onClick={onCancel}
            className="h-11 w-11 rounded-2xl bg-[#F2F2F7] text-black hover:bg-neutral-200"
            aria-label="Close"
          >
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-bold text-neutral-500 uppercase tracking-wide">
              {locked ? "Resolved Variance" : "Reconcile Variance"}
            </div>
            <div className="font-black text-lg truncate">{v.item_name}</div>
          </div>
        </div>

        {/* BODY */}
        <ScrollArea className="flex-1">
          <div className="p-5 space-y-4">
            {/* T vs A panel */}
            <div className="grid grid-cols-2 gap-2">
              <Stat label="Theoretical" value={`${v.theoretical_yield} ${v.unit}`} />
              <Stat label="Actual" value={`${v.actual_yield} ${v.unit}`} />
              <Stat
                label="Variance"
                value={`${v.variance_amount >= 0 ? "+" : ""}${Number(v.variance_amount).toFixed(2)} ${v.unit}`}
                accent={breach ? "alert" : "ok"}
              />
              <Stat
                label="Value Lost"
                value={`$${Number(v.value_lost).toFixed(2)}`}
                accent={Number(v.value_lost) > 0 ? "alert" : "ok"}
              />
            </div>
            <div className="text-[11px] text-neutral-500 font-medium">
              Batch {v.batch_id} · Tolerance ±{v.tolerance_threshold} {v.unit} · Unit cost $
              {Number(v.unit_cost).toFixed(2)}
            </div>

            {!locked && (
              <>
                {/* ROOT CAUSE */}
                <div>
                  <Label>Root Cause</Label>
                  <div className="grid grid-cols-2 gap-2 mt-2">
                    {ROOT_CAUSES.map((rc) => (
                      <ChoiceChip
                        key={rc}
                        active={rootCause === rc}
                        onClick={() => setRootCause(rc)}
                      >
                        {rc}
                      </ChoiceChip>
                    ))}
                  </div>
                </div>

                {/* CORRECTIVE ACTION */}
                <div>
                  <Label>Corrective Action</Label>
                  <div className="grid grid-cols-1 gap-2 mt-2">
                    {CORRECTIVE_ACTIONS.map((ca) => (
                      <ChoiceChip
                        key={ca}
                        active={corrective === ca}
                        onClick={() => setCorrective(ca)}
                      >
                        {ca}
                      </ChoiceChip>
                    ))}
                  </div>
                </div>

                {/* MANAGER PIN */}
                <div>
                  <Label>Manager PIN (4-digit)</Label>
                  <Input
                    type="password"
                    inputMode="numeric"
                    autoComplete="off"
                    pattern="[0-9]*"
                    maxLength={8}
                    value={pin}
                    onChange={(e) => setPin(e.target.value.replace(/[^0-9]/g, ""))}
                    placeholder="••••"
                    className="h-14 mt-2 rounded-2xl bg-[#F2F2F7] border-none font-black text-center text-2xl tracking-[0.4em]"
                  />
                  <div className="text-[10px] text-neutral-500 mt-1 flex items-center gap-1">
                    <ShieldCheck className="h-3 w-3" />
                    Hashed server-side via bcrypt. Raw PIN never persisted.
                  </div>
                </div>
              </>
            )}
          </div>
        </ScrollArea>

        {/* FOOTER — bottom-weighted thumb-zone CTA */}
        {!locked && (
          <div className="p-4 border-t border-neutral-100">
            <Button
              type="button"
              disabled={submitting || !rootCause || !corrective || pin.length < 4}
              onClick={onSubmit}
              className="w-full h-16 rounded-3xl bg-black text-white font-black text-base disabled:opacity-40"
            >
              {submitting ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                "POST CORRECTION & RESOLVE"
              )}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[11px] uppercase tracking-wider font-black text-neutral-500">
      {children}
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: "alert" | "ok";
}) {
  const tone =
    accent === "alert"
      ? "text-red-600"
      : accent === "ok"
        ? "text-emerald-600"
        : "text-black";
  return (
    <div className="rounded-2xl bg-[#F2F2F7] p-3">
      <div className="text-[10px] uppercase tracking-wider font-bold text-neutral-500">
        {label}
      </div>
      <div className={`mt-1 text-lg font-black ${tone}`}>{value}</div>
    </div>
  );
}

function ChoiceChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`min-h-[48px] px-4 rounded-2xl font-bold text-sm transition-all ${
        active
          ? "bg-black text-white shadow-md scale-[0.98]"
          : "bg-[#F2F2F7] text-black hover:bg-neutral-200"
      }`}
    >
      {children}
    </button>
  );
}
