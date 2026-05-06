// IDIA Pay LiquidOS - real execution log.
// No mock data, no setTimeout simulations. Persists every Nano-Bite action
// to localStorage and broadcasts a window event so the UI updates live.

const STORE_KEY = "idia.pay.executions.v1";

export type ExecutionRecord = {
  id: string;
  cartonCode: string;
  subModuleId: string;
  nanoBiteId: string;
  screen: string;
  action: string;
  payload?: Record<string, unknown>;
  createdAt: string;
};

function readAll(): ExecutionRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORE_KEY);
    return raw ? (JSON.parse(raw) as ExecutionRecord[]) : [];
  } catch {
    return [];
  }
}

function writeAll(records: ExecutionRecord[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORE_KEY, JSON.stringify(records.slice(-500)));
}

export function recordExecution(
  rec: Omit<ExecutionRecord, "id" | "createdAt">,
): ExecutionRecord {
  const full: ExecutionRecord = {
    ...rec,
    id:
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    createdAt: new Date().toISOString(),
  };
  const all = readAll();
  all.push(full);
  writeAll(all);
  console.log(
    `[EXECUTION_PERSISTED]: nb=${rec.nanoBiteId} action=${rec.action} carton=${rec.cartonCode}`,
  );
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("idia:execution", { detail: full }));
  }
  return full;
}

export function getExecutionsFor(
  nanoBiteId: string,
  cartonCode: string,
): ExecutionRecord[] {
  return readAll().filter(
    (r) => r.nanoBiteId === nanoBiteId && r.cartonCode === cartonCode,
  );
}

export function subscribeExecutions(callback: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = () => callback();
  window.addEventListener("idia:execution", handler);
  return () => window.removeEventListener("idia:execution", handler);
}
