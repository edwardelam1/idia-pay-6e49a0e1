import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import idiaLogo from "@/assets/idia-logo.png";
import payLogo from "@/assets/idia-pay-logo.jpg";
import {
  fetchProvisioningBlueprint,
  type NanoBiteSpec,
  type SubModule,
  type VerticalCarton,
} from "@/lib/idia/registry";
import {
  recordExecution,
  getExecutionsFor,
  subscribeExecutions,
  type ExecutionRecord,
} from "@/lib/idia/executions";

// --- PHYSICAL ATOM IMPORTS ---
import DailyPrepList from "@/components/nanobites/hospitality/DailyPrepList";
import HealthPermitLog from "@/components/nanobites/hospitality/HealthPermitLog";
// THE FIX: Import as Default Export to match the newly created SovereignWrapper file
import SovereignWrapper from "@/components/sovereign/SovereignWrapper";

/**
 * PHYSICAL_LEGO_BRIDGE
 * Maps Taxonomy IDs to high-fidelity UI components.
 */
const PHYSICAL_LEGO_BRIDGE: Record<string, any> = {
  "hosp.ft.ops.prep": DailyPrepList,
  "hosp.ft.infra.health": HealthPermitLog,
};

type Phase =
  | { kind: "provisioning" }
  | { kind: "selection"; carton: VerticalCarton }
  | { kind: "operational"; carton: VerticalCarton; subModule: SubModule };

const SURFACE_STYLE: React.CSSProperties = {
  background: "rgba(255,255,255,0.94)",
  backdropFilter: "blur(30px)",
  WebkitBackdropFilter: "blur(30px)",
};

export function LiquidOS() {
  const [phase, setPhase] = useState<Phase>({ kind: "provisioning" });
  const [activeScreen, setActiveScreen] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleProvision(e: FormEvent) {
    e.preventDefault();
    console.log("[LIQUID_OS]: START - Provisioning sequence for code:", code);
    setError(null);
    setLoading(true);
    
    try {
      const carton = await fetchProvisioningBlueprint(code);
      setLoading(false);
      
      if (!carton || carton.subModules.length === 0) {
        console.error("[LIQUID_OS]: HALT - No manifest found.");
        setError(`No manifest found for "${code}". Verify the Hub provisioning code.`);
        return;
      }

      if (carton.subModules.length === 1) {
        const sm = carton.subModules[0];
        const tags = uniqueScreens(sm);
        console.log(`[OS_HYDRATION]: Single sub-module optimization triggered for: ${sm.id}`);
        setActiveScreen(tags[0] ?? null);
        setPhase({ kind: "operational", carton, subModule: sm });
      } else {
        setPhase({ kind: "selection", carton });
      }
      console.log("[LIQUID_OS]: END - Hydration sequence successful.");
    } catch (err: any) {
      console.error("[LIQUID_OS]: ERROR - Provisioning failed:", err.message);
      setError("System failure during manifest retrieval.");
      setLoading(false);
    }
  }

  async function chooseSubModule(sm: SubModule, carton: VerticalCarton) {
    console.log(`[NAV_EVENT]: START - Hydrating submodule stage: ${sm.id}`);
    const tags = uniqueScreens(sm);
    setActiveScreen(tags[0] ?? null);
    setPhase({ kind: "operational", carton, subModule: sm });
    console.log(`[NAV_EVENT]: END - Stage built with ${tags.length} screens.`);
  }

  function reset() {
    console.log("[SYSTEM]: START - Initiating session purge.");
    setPhase({ kind: "provisioning" });
    setActiveScreen(null);
    setCode("");
    setError(null);
    console.log("[SYSTEM]: END - Active memory cleared.");
  }

  // ===== PROVISIONING =====
  if (phase.kind === "provisioning") {
    return (
      <div className="min-h-screen flex items-center justify-center px-6">
        <div className="w-full max-w-md flex flex-col items-center gap-8">
          <BrandMark />
          <form onSubmit={handleProvision} className="w-full flex flex-col gap-3">
            <label className="text-[12px] font-semibold tracking-[0.14em] text-muted-foreground uppercase text-center">
              Hub Provisioning Code
            </label>
            <input
              autoFocus
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="IDIA-XXXX-XXXX"
              disabled={loading}
              className="h-14 px-5 text-center text-[18px] font-semibold tracking-wide bg-white focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60"
              style={{
                borderRadius: 18,
                border: "1px solid #F2F2F7",
                boxShadow: "var(--idia-shadow-card)",
              }}
            />
            <p className="text-[12px] text-muted-foreground text-center">
              {loading ? "Hydrating from The Hub…" : (
                <>Press <kbd className="px-1.5 py-0.5 rounded bg-secondary font-mono">Enter</kbd> to hydrate the OS</>
              )}
            </p>
            {error && (
              <div
                className="mt-2 p-4 text-center"
                style={{
                  borderRadius: 28,
                  border: "1px solid #FF3B30",
                  background: "rgba(255,59,48,0.04)",
                }}
              >
                <p className="text-[11px] font-semibold tracking-[0.14em] uppercase" style={{ color: "#FF3B30" }}>
                  Sovereign Error
                </p>
                <p className="text-[13px] mt-1 text-foreground">{error}</p>
              </div>
            )}
          </form>
        </div>
      </div>
    );
  }

  // ===== SELECTION (Top-Level Module Library) =====
  if (phase.kind === "selection") {
    const looped = [...phase.carton.subModules, ...phase.carton.subModules];
    return (
      <div className="min-h-screen flex bg-[#FBFBFD]">
        <aside
          className="w-72 shrink-0 border-r border-border sticky top-0 h-screen flex flex-col"
          style={SURFACE_STYLE}
        >
          <div className="p-5">
            <div className="flex items-center gap-2">
              <img src={payLogo} alt="IDIA Pay" className="h-9 w-9 rounded-[10px]" />
              <div>
                <p className="text-[14px] font-semibold leading-tight">IDIA Pay</p>
                <p className="text-[11px] text-muted-foreground leading-tight">{phase.carton.industry}</p>
              </div>
            </div>
            <p className="mt-5 text-[10px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
              Sub-Modules
            </p>
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar relative group">
            <div className="flex flex-col gap-2 px-4 pb-4 idia-loop-scroll group-hover:[animation-play-state:paused]">
              {looped.map((sm, i) => (
                <button
                  key={`${sm.id}-${i}`}
                  onClick={() => chooseSubModule(sm, phase.carton)}
                  className="text-left bg-white p-3 transition-all active:scale-[0.98] hover:border-blue-200"
                  style={{
                    borderRadius: 18,
                    border: "1px solid #F2F2F7",
                    boxShadow: "var(--idia-shadow-card)",
                  }}
                >
                  <p className="text-[14px] font-semibold">{sm.label}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {sm.nanoBites.length} Nano-Bites
                  </p>
                </button>
              ))}
            </div>
          </div>
          
          <div className="p-4 border-t border-border">
            <button
              onClick={reset}
              className="text-[12px] text-muted-foreground hover:text-foreground"
            >
              ↻ End Session
            </button>
          </div>
        </aside>
        <main className="flex-1 flex items-center justify-center px-10">
          <div
            className="max-w-lg w-full bg-white p-10 text-center"
            style={{
              borderRadius: 28,
              border: "1px solid #F2F2F7",
              boxShadow: "var(--idia-shadow-card)",
            }}
          >
            <p className="text-[12px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
              {phase.carton.industry}
            </p>
            <h1 className="text-[28px] font-semibold tracking-tight mt-2">
              Select a Module
            </h1>
            <p className="text-[14px] text-muted-foreground mt-3 leading-relaxed">
              {phase.carton.subModules.length} operational units are available. 
              Choose one from the Liquid Sidebar to hydrate the terminal.
            </p>
          </div>
        </main>
      </div>
    );
  }

  // ===== OPERATIONAL (Live Terminal Stage) =====
  const screens = uniqueScreens(phase.subModule);
  const current = activeScreen ?? screens[0];
  const bites = phase.subModule.nanoBites
    .filter((nb) => nb.screen === current)
    .sort((a, b) => a.order - b.order);

  return (
    <div className="min-h-screen flex">
      <aside
        className="w-64 shrink-0 border-r border-border p-5 flex flex-col gap-2 sticky top-0 h-screen"
        style={SURFACE_STYLE}
      >
        <div className="flex items-center gap-2 px-2 py-3">
          <img src={payLogo} alt="IDIA Pay" className="h-9 w-9 rounded-[10px]" />
          <div>
            <p className="text-[14px] font-semibold leading-tight">IDIA Pay</p>
            <p className="text-[11px] text-muted-foreground leading-tight">{phase.subModule.label}</p>
          </div>
        </div>

        {/* THE MODULE LIBRARY TRIGGER: Supports Zyyo case industri switching */}
        <button
          onClick={() => {
            console.log("[NAV_EVENT]: Returning to Selection Grid.");
            setPhase({ kind: "selection", carton: phase.carton });
          }}
          className="flex items-center gap-2 w-full px-3 py-2.5 mb-2 text-[11px] font-bold text-[#007AFF] uppercase tracking-[0.12em] bg-blue-50/40 hover:bg-blue-50 border border-blue-100/30 rounded-[14px] transition-all active:scale-[0.98]"
        >
          <span className="text-[16px]">⊞</span> Module Library
        </button>

        <div className="h-px bg-border my-2" />
        <p className="text-[10px] font-semibold tracking-[0.14em] text-muted-foreground uppercase px-2">
          Screens
        </p>

        {/* THE SIDEBAR SCROLL FIX: Viewport constrained height */}
        <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col gap-1.5 pr-1 max-h-[calc(100vh-280px)]">
          {screens.map((s) => {
            const active = s === current;
            return (
              <button
                key={s}
                onClick={() => setActiveScreen(s)}
                className={`text-left h-10 px-3 text-[13px] font-medium transition-all shrink-0 ${
                  active ? "text-white shadow-sm" : "text-foreground hover:bg-secondary"
                }`}
                style={{
                  borderRadius: 14,
                  ...(active ? { background: "var(--idia-gradient)" } : {}),
                }}
              >
                {s}
              </button>
            );
          })}
        </div>

        <div className="mt-auto flex flex-col gap-2 px-2 pb-1">
          <div className="h-px bg-border" />
          <button
            onClick={reset}
            className="text-[12px] text-muted-foreground hover:text-foreground text-left"
          >
            ↻ End Session
          </button>
          <p className="text-[10px] text-muted-foreground">
            {phase.carton.provisioningCode}
          </p>
        </div>
      </aside>

      <main className="flex-1 px-10 py-10 bg-[#FBFBFD] overflow-y-auto h-screen custom-scrollbar">
        <header className="flex items-center justify-between mb-8">
          <div>
            <p className="text-[12px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
              {phase.subModule.industry}
            </p>
            <h1 className="text-[32px] font-semibold tracking-tight mt-1">{current}</h1>
          </div>
          <div
            className="px-4 h-11 flex items-center gap-2 text-[12px] text-muted-foreground"
            style={{ ...SURFACE_STYLE, borderRadius: 18, border: "1px solid #F2F2F7" }}
          >
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            Synapse Live
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pb-20">
          {bites.map((nb) => (
            <NanoBiteRenderer key={nb.id} spec={nb} carton={phase.carton} subModule={phase.subModule} />
          ))}
        </div>
      </main>
    </div>
  );
}

function NanoBiteRenderer({
  spec,
  carton,
  subModule,
}: {
  spec: NanoBiteSpec;
  carton: VerticalCarton;
  subModule: SubModule;
}): ReactNode {
  const Component = PHYSICAL_LEGO_BRIDGE[spec.id];

  if (Component) {
    console.log(`[PHYSICAL_BRIDGE]: START - Hydrating physical atom for ${spec.id}`);
    return (
      <SovereignWrapper id={spec.id}>
        {/* THE FIX: Cast raw to any to access business_id without TS error */}
        <Component businessId={(carton.raw as any)?.business_id || "default"} />
      </SovereignWrapper>
    );
  }

  return (
    <DynamicNanoBite
      spec={spec}
      subModuleLabel={subModule.label}
      subModuleId={subModule.id}
      cartonCode={carton.provisioningCode}
    />
  );
}

function isPaymentSpec(spec: NanoBiteSpec): boolean {
  const blob = `${spec.id} ${spec.microElement ?? ""} ${spec.task ?? ""}`.toLowerCase();
  return /(pos|payment|checkout|charge|tender|nfc|tap)/.test(blob);
}

function prettyTitle(spec: NanoBiteSpec): string {
  const tail = spec.id.split(/[.\-_/]/).pop() ?? spec.id;
  return tail
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function DynamicNanoBite({
  spec,
  subModuleLabel,
  subModuleId,
  cartonCode,
}: {
  spec: NanoBiteSpec;
  subModuleLabel: string;
  subModuleId: string;
  cartonCode: string;
}) {
  const isPayment = isPaymentSpec(spec);
  const [history, setHistory] = useState<ExecutionRecord[]>(() =>
    getExecutionsFor(spec.id, cartonCode),
  );
  const [input, setInput] = useState("");
  const [rail, setRail] = useState<"USD" | "USDC">("USD");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    return subscribeExecutions(() =>
      setHistory(getExecutionsFor(spec.id, cartonCode)),
    );
  }, [spec.id, cartonCode]);

  async function execute() {
    setBusy(true);
    console.log(`[ATOM_EXECUTION]: START - Dispatching task: ${spec.id}`);
    try {
      const payload: Record<string, unknown> = {
        microElement: spec.microElement,
        screen: spec.screen,
      };
      if (isPayment) {
        const amount = parseFloat(input || "0") || 0;
        payload.amount = amount;
        payload.rail = rail;
      } else if (input.trim()) {
        payload.input = input.trim();
      }
      recordExecution({
        cartonCode,
        subModuleId,
        nanoBiteId: spec.id,
        screen: spec.screen,
        action: isPayment ? "pos.charge" : "execute",
        payload,
      });
      setInput("");
      console.log(`[ATOM_EXECUTION]: END - Task ${spec.id} recorded.`);
    } catch (err: any) {
      console.error(`[ATOM_EXECUTION]: ERROR - Task ${spec.id} failed:`, err.message);
    } finally {
      setBusy(false);
    }
  }

  const last = history[history.length - 1];

  return (
    <div
      className="bg-white p-6 flex flex-col gap-4"
      style={{
        borderRadius: 28,
        border: "1px solid #F2F2F7",
        boxShadow: "var(--idia-shadow-card)",
      }}
    >
      <div>
        <p className="text-[10px] font-semibold tracking-[0.14em] uppercase text-muted-foreground">
          {spec.microElement ?? spec.screen} · {subModuleLabel}
        </p>
        <h3 className="text-[17px] font-semibold tracking-tight mt-1">
          {prettyTitle(spec)}
        </h3>
      </div>
      {spec.task && (
        <p className="text-[14px] text-foreground/80 leading-relaxed">{spec.task}</p>
      )}
      <div className="flex flex-wrap gap-2 text-[11px] text-muted-foreground">
        {spec.cadence && <span className="px-2 py-1 bg-secondary rounded-full">{spec.cadence}</span>}
        {spec.requiresTier && (
          <span className="px-2 py-1 bg-secondary rounded-full">{spec.requiresTier}</span>
        )}
        {spec.valueChainStage && (
          <span className="px-2 py-1 bg-secondary rounded-full">{spec.valueChainStage}</span>
        )}
      </div>

      {isPayment ? (
        <>
          <div className="flex gap-2">
            {(["USD", "USDC"] as const).map((r) => (
              <button
                key={r}
                onClick={() => setRail(r)}
                className={`flex-1 h-10 text-[13px] font-semibold transition-all ${
                  rail === r ? "text-white" : "bg-secondary text-foreground"
                }`}
                style={{
                  borderRadius: 14,
                  ...(rail === r ? { background: "var(--idia-gradient)" } : {}),
                }}
              >
                {r === "USD" ? "USD · Fiat" : "USDC · Digital"}
              </button>
            ))}
          </div>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value.replace(/[^0-9.]/g, ""))}
            placeholder="0.00"
            inputMode="decimal"
            className="h-12 px-4 text-[20px] font-semibold bg-secondary focus:outline-none focus:ring-2 focus:ring-ring"
            style={{ borderRadius: 18 }}
          />
        </>
      ) : (
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Reference, ID, or note (optional)"
          className="h-11 px-4 text-[14px] bg-secondary focus:outline-none focus:ring-2 focus:ring-ring"
          style={{ borderRadius: 14 }}
        />
      )}

      <button
        onClick={execute}
        disabled={busy}
        className="h-11 text-white text-[14px] font-semibold mt-1 disabled:opacity-60"
        style={{ borderRadius: 18, background: "var(--idia-gradient)" }}
      >
        {busy ? "Dispatching…" : isPayment ? "Charge & Settle" : "Execute"}
      </button>

      <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-1 border-t border-border">
        <span>{history.length} run{history.length === 1 ? "" : "s"}</span>
        {last && (
          <span>
            Last: {new Date(last.createdAt).toLocaleTimeString()}
            {last.payload && "amount" in last.payload
              ? ` · ${(last.payload as { rail?: string }).rail ?? ""} ${
                  (last.payload as { amount?: number }).amount ?? ""
                }`
              : ""}
          </span>
        )}
      </div>
    </div>
  );
}

function uniqueScreens(sm: SubModule): string[] {
  const seen = new Set<string>();
  const order: string[] = [];
  for (const nb of sm.nanoBites) {
    if (!seen.has(nb.screen)) {
      seen.add(nb.screen);
      order.push(nb.screen);
    }
  }
  return order;
}

function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex flex-col items-center gap-3">
      <img
        src={payLogo}
        alt="IDIA Pay"
        className={compact ? "h-14 w-14 rounded-[14px]" : "h-20 w-20 rounded-[18px]"}
        style={{ boxShadow: "var(--idia-shadow-card)" }}
      />
      <div className="flex items-center gap-2">
        <img src={idiaLogo} alt="IDIA" className="h-5 w-auto" />
        <span className="text-[15px] font-semibold tracking-tight">Pay · LiquidOS</span>
      </div>
      {!compact && (
        <p className="text-[12px] text-muted-foreground tracking-wide">
          Hydrating Shell · awaiting Hub instructions
        </p>
      )}
    </div>
  );
}