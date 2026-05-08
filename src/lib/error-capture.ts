// Captures the original Error out-of-band so server.ts can recover the stack
// when h3 has already swallowed the throw into a generic 500 Response.

let lastCapturedError: { error: unknown; at: number } | undefined;
const TTL_MS = 5_000;

function record(error: unknown) {
  lastCapturedError = { error, at: Date.now() };
}

if (typeof globalThis.addEventListener === "function") {
  globalThis.addEventListener("error", (event) => record((event as ErrorEvent).error ?? event));
  globalThis.addEventListener("unhandledrejection", (event) =>
    record((event as PromiseRejectionEvent).reason),
  );
}

export function consumeLastCapturedError(): unknown {
  if (!lastCapturedError) return undefined;
  if (Date.now() - lastCapturedError.at > TTL_MS) {
    lastCapturedError = undefined;
    return undefined;
  }
  const { error } = lastCapturedError;
  lastCapturedError = undefined;
  return error;
}

export type PlanckPhase = "START" | "PROCESS" | "END" | "STALL" | "TRIGGER" | "FATAL";

export const logPlanck = (
  phase: PlanckPhase,
  action: string,
  details: string,
  error?: unknown,
) => {
  const timestamp = new Date().toISOString();
  const msg = `[${phase}] [${action}] [${timestamp}] - ${details}`;
  if (error) console.error(`${msg} | TRACE:`, error);
  else if (phase === "FATAL" || phase === "STALL") console.error(msg);
  else if (phase === "TRIGGER") console.warn(msg);
  else console.log(msg);
};

let shieldInstalled = false;
export const injectResizeObserverShield = () => {
  if (typeof window === "undefined" || shieldInstalled) return;
  shieldInstalled = true;

  const originalError = window.console.error;
  window.addEventListener("error", (event) => {
    const m = event.message || "";
    if (m.includes("ResizeObserver")) {
      event.stopImmediatePropagation();
      event.preventDefault();
    }
  });
  window.console.error = (...args: unknown[]) => {
    if (typeof args[0] === "string" && args[0].includes("cross-origin")) return;
    originalError.apply(console, args as []);
  };
  logPlanck("END", "SHIELD_INIT", "Suppression matrix active.");
};
