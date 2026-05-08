// FIAT (USD) PAYMENT INTENT — Stripe Terminal acquirer
// Returns { sessionId } as the Stripe PaymentIntent client_secret-keyed id.
// Requires secret: STRIPE_SECRET_KEY
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
    if (currency !== "USD") throw new Error("Currency must be USD");
    if (!locationId || typeof locationId !== "string") throw new Error("locationId required");

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY not configured");

    const cents = Math.round(amount * 100);
    const body = new URLSearchParams({
      amount: String(cents),
      currency: "usd",
      "payment_method_types[]": "card_present",
      capture_method: "automatic",
      "metadata[location_id]": locationId,
    });

    const res = await fetch("https://api.stripe.com/v1/payment_intents", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${stripeKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    });

    if (!res.ok) {
      const text = await res.text();
      console.error(`[FIAT_STALL] ${res.status}: ${text}`);
      throw new Error(`Acquirer rejected request: ${res.status}`);
    }

    const data = await res.json();
    if (!data?.id) throw new Error("Acquirer returned no PaymentIntent id");

    return new Response(JSON.stringify({ sessionId: data.id }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown failure";
    console.error("[FIAT_PAYMENT_PROCESSING_FATAL]", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 400,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
