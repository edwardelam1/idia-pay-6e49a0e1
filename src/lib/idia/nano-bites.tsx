import { useState, type ReactNode } from "react";
import { withACA, calculateRoyalty, DATA_ROYALTY_RATE } from "./aca";

// ===== Standard Nano-Bite container =====
export type NanoBiteProps = {
  InstanceID: string;
  IndustryContext: string;
  ActionCallback: (action: string, payload?: unknown) => void;
};

function NanoCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <div
      className="bg-white p-6 flex flex-col gap-4"
      style={{
        borderRadius: 24,
        border: "1px solid #F2F2F7",
        boxShadow: "var(--idia-shadow-card)",
      }}
    >
      <div>
        <h3 className="text-[17px] font-semibold tracking-tight text-foreground">{title}</h3>
        {subtitle && <p className="text-[13px] text-muted-foreground mt-0.5">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

function PillButton({
  children,
  onClick,
  variant = "primary",
  type = "button",
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "primary" | "ghost";
  type?: "button" | "submit";
}) {
  const base =
    "px-4 h-11 text-[14px] font-semibold transition-all active:scale-[0.98] focus:outline-none";
  const styles =
    variant === "primary"
      ? "text-white shadow-sm hover:opacity-95"
      : "bg-secondary text-foreground hover:bg-accent";
  return (
    <button
      type={type}
      onClick={onClick}
      className={`${base} ${styles}`}
      style={{
        borderRadius: 18,
        ...(variant === "primary" ? { background: "var(--idia-gradient)" } : {}),
      }}
    >
      {children}
    </button>
  );
}

// ===== Pulsating NFC ring =====
function NFCPulse({ active }: { active: boolean }) {
  return (
    <div className="relative h-40 w-40 flex items-center justify-center">
      {active && (
        <>
          <span className="absolute inset-0 rounded-full opacity-40 animate-ping"
            style={{ background: "var(--idia-gradient)" }} />
          <span className="absolute inset-4 rounded-full opacity-60 animate-pulse"
            style={{ background: "var(--idia-gradient)" }} />
        </>
      )}
      <div
        className="relative h-24 w-24 rounded-full flex items-center justify-center text-white text-[11px] font-semibold tracking-wide"
        style={{ background: "var(--idia-gradient)" }}
      >
        {active ? "READY TO TAP" : "NFC IDLE"}
      </div>
    </div>
  );
}

// ===== Nano-Bites =====

function NB_PosTerminal(props: NanoBiteProps) {
  const [amount, setAmount] = useState("");
  const [rail, setRail] = useState<"USD" | "USDC">("USD");
  const [status, setStatus] = useState<"idle" | "polling" | "ok">("idle");

  async function charge() {
    console.log(`[NB_POS_TERMINAL:${props.InstanceID}]: START - charging ${amount} ${rail}`);
    setStatus("polling");
    const value = parseFloat(amount || "0");
    const royalty = calculateRoyalty(value);
    await withACA("pos.charge", { instance: props.InstanceID, amount: value, rail, royalty });
    props.ActionCallback("pos.charge", { amount: value, rail, royalty });
    setTimeout(() => {
      setStatus("ok");
      console.log(`[NB_POS_TERMINAL:${props.InstanceID}]: END - settled rail=${rail}`);
    }, 1400);
  }

  return (
    <NanoCard title="POS Terminal" subtitle={`Dual-rail · ${props.IndustryContext}`}>
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
        value={amount}
        onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
        placeholder="0.00"
        inputMode="decimal"
        className="h-12 px-4 text-[20px] font-semibold bg-secondary focus:outline-none focus:ring-2 focus:ring-ring"
        style={{ borderRadius: 18 }}
      />
      <div className="flex items-center justify-between text-[12px] text-muted-foreground">
        <span>Direct Data Royalty</span>
        <span className="font-medium text-foreground">
          {(DATA_ROYALTY_RATE * 100).toFixed(2)}% · {calculateRoyalty(parseFloat(amount || "0"))}
        </span>
      </div>
      <div className="flex justify-center py-2">
        <NFCPulse active={status === "polling"} />
      </div>
      <PillButton onClick={charge}>
        {status === "ok" ? "Settled ✓ — New Sale" : status === "polling" ? "Polling antenna…" : "Charge"}
      </PillButton>
    </NanoCard>
  );
}

function NB_HospBilling(props: NanoBiteProps) {
  const [tableNo, setTableNo] = useState("12");
  const [items, setItems] = useState<{ label: string; price: number }[]>([
    { label: "Tasting Menu", price: 145 },
    { label: "Pairing Flight", price: 75 },
  ]);
  const total = items.reduce((s, i) => s + i.price, 0);

  async function close() {
    console.log(`[NB_HOSP_BILLING:${props.InstanceID}]: START - closing table ${tableNo}`);
    await withACA("hosp.billing.close", { table: tableNo, total });
    props.ActionCallback("hosp.billing.close", { tableNo, total });
    setItems([]);
    console.log(`[NB_HOSP_BILLING:${props.InstanceID}]: END - table cleared`);
  }

  return (
    <NanoCard title="Hospitality Billing" subtitle={`Tableside check · ${props.IndustryContext}`}>
      <div className="flex items-center gap-2">
        <span className="text-[13px] text-muted-foreground">Table</span>
        <input
          value={tableNo}
          onChange={(e) => setTableNo(e.target.value)}
          className="h-10 w-20 px-3 bg-secondary text-[14px] font-semibold focus:outline-none"
          style={{ borderRadius: 14 }}
        />
      </div>
      <div className="divide-y divide-border">
        {items.length === 0 && (
          <p className="text-[13px] text-muted-foreground py-4">No open items.</p>
        )}
        {items.map((i, idx) => (
          <div key={idx} className="flex justify-between py-2 text-[14px]">
            <span>{i.label}</span>
            <span className="font-semibold">${i.price.toFixed(2)}</span>
          </div>
        ))}
      </div>
      <div className="flex justify-between text-[15px] font-semibold pt-2 border-t border-border">
        <span>Total</span>
        <span>${total.toFixed(2)}</span>
      </div>
      <PillButton onClick={close}>Close Check</PillButton>
    </NanoCard>
  );
}

function NB_StockCheck(props: NanoBiteProps) {
  const [stock, setStock] = useState([
    { sku: "WAGYU-A5", qty: 4 },
    { sku: "OYSTER-KUM", qty: 36 },
    { sku: "CHAMP-NV", qty: 11 },
  ]);
  async function reorder(sku: string) {
    console.log(`[NB_STOCK_CHECK:${props.InstanceID}]: START - reorder ${sku}`);
    await withACA("inventory.reorder", { sku });
    props.ActionCallback("inventory.reorder", { sku });
    setStock((s) => s.map((row) => (row.sku === sku ? { ...row, qty: row.qty + 12 } : row)));
    console.log(`[NB_STOCK_CHECK:${props.InstanceID}]: END - reorder placed`);
  }
  return (
    <NanoCard title="Stock Check" subtitle="Live inventory snapshot">
      <div className="divide-y divide-border">
        {stock.map((s) => (
          <div key={s.sku} className="flex items-center justify-between py-3">
            <div>
              <p className="text-[14px] font-semibold">{s.sku}</p>
              <p className="text-[12px] text-muted-foreground">{s.qty} on hand</p>
            </div>
            <PillButton variant="ghost" onClick={() => reorder(s.sku)}>
              Reorder
            </PillButton>
          </div>
        ))}
      </div>
    </NanoCard>
  );
}

function NB_LogisticsDispatch(props: NanoBiteProps) {
  const [routes] = useState([
    { id: "RTE-101", driver: "Aisha", stops: 8, eta: "14:20" },
    { id: "RTE-102", driver: "Marcus", stops: 5, eta: "15:05" },
  ]);
  async function dispatch(id: string) {
    console.log(`[NB_LOGISTICS:${props.InstanceID}]: START - dispatch ${id}`);
    await withACA("logistics.dispatch", { route: id });
    props.ActionCallback("logistics.dispatch", { id });
    console.log(`[NB_LOGISTICS:${props.InstanceID}]: END - manifest sealed`);
  }
  return (
    <NanoCard title="Logistics Dispatch" subtitle="Route manifests">
      {routes.map((r) => (
        <div key={r.id} className="flex items-center justify-between py-2">
          <div>
            <p className="text-[14px] font-semibold">{r.id} · {r.driver}</p>
            <p className="text-[12px] text-muted-foreground">{r.stops} stops · ETA {r.eta}</p>
          </div>
          <PillButton onClick={() => dispatch(r.id)}>Seal & Send</PillButton>
        </div>
      ))}
    </NanoCard>
  );
}

function NB_EmployeeId(props: NanoBiteProps) {
  const [code, setCode] = useState("");
  const [verified, setVerified] = useState<string | null>(null);
  async function verify() {
    console.log(`[NB_EMPLOYEE_ID:${props.InstanceID}]: START - verify ${code}`);
    await withACA("employee.verify", { code });
    props.ActionCallback("employee.verify", { code });
    setVerified(code || "—");
    console.log(`[NB_EMPLOYEE_ID:${props.InstanceID}]: END - verified`);
  }
  return (
    <NanoCard title="Employee ID" subtitle="Roster & shift verification">
      <input
        value={code}
        onChange={(e) => setCode(e.target.value)}
        placeholder="Scan or enter employee code"
        className="h-12 px-4 bg-secondary text-[14px] focus:outline-none focus:ring-2 focus:ring-ring"
        style={{ borderRadius: 18 }}
      />
      <PillButton onClick={verify}>Verify</PillButton>
      {verified && (
        <p className="text-[12px] text-muted-foreground">
          Verified: <span className="text-foreground font-semibold">{verified}</span>
        </p>
      )}
    </NanoCard>
  );
}

// ===== Registry of Nano-Bite components =====
export const NANO_BITE_REGISTRY: Record<string, (p: NanoBiteProps) => ReactNode> = {
  "nb-pos-terminal": NB_PosTerminal,
  "nb-hosp-billing": NB_HospBilling,
  "nb-stock-check": NB_StockCheck,
  "nb-logistics-dispatch": NB_LogisticsDispatch,
  "nb-employee-id": NB_EmployeeId,
};
