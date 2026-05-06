import { useMemo, useState, type FormEvent } from "react";
import idiaLogo from "@/assets/idia-logo.png";
import payLogo from "@/assets/idia-pay-logo.jpg";
import {
  resolveProvisioningCode,
  type SubModule,
  type VerticalCarton,
} from "@/lib/idia/registry";
import { NANO_BITE_REGISTRY } from "@/lib/idia/nano-bites";
import { withACA } from "@/lib/idia/aca";

type Phase =
  | { kind: "provisioning" }
  | { kind: "selection"; carton: VerticalCarton }
  | { kind: "operational"; carton: VerticalCarton; subModule: SubModule }
  | { kind: "sovereign-error"; reason: string };

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

  async function handleProvision(e: FormEvent) {
    e.preventDefault();
    console.log(`[PROVISIONING]: START - code="${code}"`);
    setError(null);
    await withACA("provisioning.attempt", { code });
    const carton = resolveProvisioningCode(code);
    if (!carton) {
      console.log(`[PROVISIONING]: END - no carton for "${code}"`);
      setError(`No vertical carton matches "${code}".`);
      return;
    }
    if (carton.subModules.length === 1) {
      const sm = carton.subModules[0];
      const tags = uniqueScreens(sm);
      setActiveScreen(tags[0] ?? null);
      setPhase({ kind: "operational", carton, subModule: sm });
      console.log(`[PROVISIONING]: END - direct hydration ${sm.id}`);
      return;
    }
    setPhase({ kind: "selection", carton });
    console.log(`[PROVISIONING]: END - awaiting selection`);
  }

  async function chooseSubModule(sm: SubModule, carton: VerticalCarton) {
    console.log(`[SUBMODULE_SELECT]: START - ${sm.id}`);
    await withACA("submodule.select", { id: sm.id });
    const tags = uniqueScreens(sm);
    setActiveScreen(tags[0] ?? null);
    setPhase({ kind: "operational", carton, subModule: sm });
    console.log(`[SUBMODULE_SELECT]: END - hydrated`);
  }

  function reset() {
    console.log("[OS_RESET]: START");
    setPhase({ kind: "provisioning" });
    setActiveScreen(null);
    setCode("");
    setError(null);
    console.log("[OS_RESET]: END");
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
              placeholder="IDIA-HOSP-001"
              className="h-14 px-5 text-center text-[18px] font-semibold tracking-wide bg-white focus:outline-none focus:ring-2 focus:ring-ring"
              style={{
                borderRadius: 18,
                border: "1px solid #F2F2F7",
                boxShadow: "var(--idia-shadow-card)",
              }}
            />
            <p className="text-[12px] text-muted-foreground text-center">
              Press <kbd className="px-1.5 py-0.5 rounded bg-secondary font-mono">Enter</kbd> to hydrate the OS
            </p>
            {error && (
              <p className="text-[13px] text-destructive text-center">{error}</p>
            )}
            <p className="text-[11px] text-muted-foreground text-center mt-4">
              Try <code>IDIA-HOSP-001</code> or <code>IDIA-RETAIL-001</code>
            </p>
          </form>
        </div>
      </div>
    );
  }

  // ===== SELECTION =====
  if (phase.kind === "selection") {
    return (
      <div className="min-h-screen flex flex-col items-center px-6 py-16">
        <div className="w-full max-w-3xl flex flex-col gap-8">
          <div className="flex flex-col items-center gap-4">
            <BrandMark compact />
            <div className="text-center">
              <p className="text-[12px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
                {phase.carton.industry}
              </p>
              <h1 className="text-[28px] font-semibold tracking-tight mt-1">
                Select a sub-module
              </h1>
            </div>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            {phase.carton.subModules.map((sm) => (
              <button
                key={sm.id}
                onClick={() => chooseSubModule(sm, phase.carton)}
                className="text-left bg-white p-6 transition-all hover:-translate-y-0.5"
                style={{
                  borderRadius: 28,
                  border: "1px solid #F2F2F7",
                  boxShadow: "var(--idia-shadow-card)",
                }}
              >
                <p className="text-[12px] font-semibold tracking-[0.14em] uppercase"
                   style={{
                     background: "var(--idia-gradient)",
                     WebkitBackgroundClip: "text",
                     WebkitTextFillColor: "transparent",
                   }}>
                  {sm.industry}
                </p>
                <h3 className="text-[20px] font-semibold mt-2">{sm.label}</h3>
                <p className="text-[14px] text-muted-foreground mt-1">{sm.description}</p>
                <p className="text-[12px] text-muted-foreground mt-4">
                  {sm.nanoBites.length} Nano-Bites · {uniqueScreens(sm).length} Screens
                </p>
              </button>
            ))}
          </div>
          <button
            onClick={reset}
            className="text-[13px] text-muted-foreground hover:text-foreground transition-colors mt-2 self-center"
          >
            ← Re-enter provisioning code
          </button>
        </div>
      </div>
    );
  }

  // ===== OPERATIONAL =====
  if (phase.kind === "operational") {
    const screens = uniqueScreens(phase.subModule);
    const current = activeScreen ?? screens[0];
    const bites = phase.subModule.nanoBites
      .filter((nb) => nb.screen === current)
      .sort((a, b) => a.order - b.order);

    return (
      <div className="min-h-screen flex">
        {/* Liquid Sidebar */}
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
          <div className="h-px bg-border my-2" />
          <p className="text-[10px] font-semibold tracking-[0.14em] text-muted-foreground uppercase px-2">
            Screens
          </p>
          {screens.map((s) => {
            const active = s === current;
            return (
              <button
                key={s}
                onClick={() => {
                  console.log(`[SIDEBAR_NAV]: START - to ${s}`);
                  setActiveScreen(s);
                  withACA("sidebar.navigate", { screen: s });
                  console.log(`[SIDEBAR_NAV]: END`);
                }}
                className={`text-left h-10 px-3 text-[13px] font-medium transition-all ${
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
          <div className="mt-auto flex flex-col gap-2 px-2 pb-1">
            <div className="h-px bg-border" />
            <button
              onClick={reset}
              className="text-[12px] text-muted-foreground hover:text-foreground text-left"
            >
              ↻ End session
            </button>
            <p className="text-[10px] text-muted-foreground">
              {phase.carton.provisioningCode}
            </p>
          </div>
        </aside>

        {/* Main Stage */}
        <main className="flex-1 px-10 py-10">
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
              Synapse Controller live
            </div>
          </header>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {bites.map((nb) => {
              const Comp = NANO_BITE_REGISTRY[nb.id];
              if (!Comp) {
                console.log(`[HYDRATION_MISS]: ${nb.id} not in registry`);
                return (
                  <SovereignMissingBite key={nb.id} id={nb.id} />
                );
              }
              return (
                <div key={nb.id}>
                  {Comp({
                    InstanceID: `${phase.subModule.id}::${nb.id}`,
                    IndustryContext: phase.subModule.industry,
                    ActionCallback: (action, payload) => {
                      console.log(
                        `[ACTION_CALLBACK]: ${nb.id} action="${action}"`,
                        payload,
                      );
                    },
                  })}
                </div>
              );
            })}
          </div>
        </main>
      </div>
    );
  }

  return <SovereignError reason={phase.kind === "sovereign-error" ? phase.reason : "Unknown"} onReset={reset} />;
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

function SovereignMissingBite({ id }: { id: string }) {
  return (
    <div
      className="bg-white p-6"
      style={{ borderRadius: 24, border: "1px solid #F2F2F7", boxShadow: "var(--idia-shadow-card)" }}
    >
      <p className="text-[11px] font-semibold tracking-[0.14em] uppercase text-destructive">
        Sovereign Error · Unmapped Nano-Bite
      </p>
      <p className="text-[14px] mt-2">
        No component registered for <code className="font-mono">{id}</code>. The Hub must publish a
        mapping before this Nano-Bite can hydrate.
      </p>
    </div>
  );
}

function SovereignError({ reason, onReset }: { reason: string; onReset: () => void }) {
  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <div
        className="max-w-md w-full bg-white p-8 text-center"
        style={{ borderRadius: 28, border: "1px solid #F2F2F7", boxShadow: "var(--idia-shadow-card)" }}
      >
        <p className="text-[11px] font-semibold tracking-[0.14em] uppercase text-destructive">
          Sovereign Error
        </p>
        <h2 className="text-[22px] font-semibold mt-3">Hydration halted</h2>
        <p className="text-[14px] text-muted-foreground mt-2">{reason}</p>
        <button
          onClick={onReset}
          className="mt-6 h-11 px-5 text-white text-[14px] font-semibold"
          style={{ borderRadius: 18, background: "var(--idia-gradient)" }}
        >
          Re-enter provisioning code
        </button>
      </div>
    </div>
  );
}
