// FLEXA USDC PAYMENT INTENT
// Returns { sessionId } for a USDC settlement intent. No mocks.
// Requires secret: FLEXA_API_KEY
import "https://deno.land/x/xhr@0.1.0/mod.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  try {
    const { amount, currency, locationId } = await req.json();
    if (typeof amount !== "number" || amount <= 0) throw new Error("Invalid amount");
    if (currency !== "USDC") throw new Error("Currency must be USDC");
    if (!locationId || typeof locationId !== "string") throw new Error("locationId required");

    const apiKey = Deno.env.get("FLEXA_API_KEY");
    if (!apiKey) throw new Error("FLEXA_API_KEY not configured");

    const res = await fetch("https://api.flexa.network/v1/checkout_sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        amount: amount.toFixed(2),
        currency,
        location_id: locationId,
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error(`[FLEXA_STALL] ${res.status}: ${text}`);
      throw new Error(`Flexa rejected request: ${res.status}`);
    }

    const data = await res.json();
    const sessionId = data?.id ?? data?.session_id;
    if (!sessionId) throw new Error("Flexa returned no session id");

    return new Response(JSON.stringify({ sessionId }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown failure";
    console.error("[FLEXA_PAYMENT_PROCESSING_FATAL]", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 400,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
