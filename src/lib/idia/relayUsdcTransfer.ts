/**
 * ============================================================================
 * NANO-BITE: relayUsdcTransfer (Edge Function Acknowledgment)
 * ============================================================================
 *
 * EDGE: relay-usdc-transfer
 * URL : https://zxyngqciipcvveigrzqt.supabase.co/functions/v1/relay-usdc-transfer
 *
 * PURPOSE
 *   Supabase Edge Function that relays EIP-3009 transferWithAuthorization
 *   calls for GASLESS USDC payments on Base.
 *
 * EDGE FLOW (server-side, NOT executed here)
 *   1. Receives signed authorization from the IDIA Life app.
 *   2. Validates request (addresses, amounts, expiration).
 *   3. Calls USDC.transferWithAuthorization() on Base via the treasury wallet.
 *   4. Records the payment in `usdc_payments`.
 *   5. Mirrors into Eddie's `transactions` table for system compatibility.
 *   6. Returns the on-chain tx hash.
 *
 * SECRETS (Supabase, server-side only — NEVER referenced from client)
 *   RELAYER_PRIVATE_KEY  - Gas-paying relay wallet (0xfd57Ab...)
 *   BASE_RPC_URL         - Alchemy RPC for Base mainnet
 *
 * CLIENT CONTRACT (this file)
 *   Pure typed wrapper around `supabase.functions.invoke`. No business logic.
 *   Logs every lifecycle phase to the Planck Telemetry Lattice.
 * ============================================================================
 */

import { supabase } from "@/integrations/supabase/client";
import { logPlanck } from "@/lib/error-capture";

// ----------------------------------------------------------------------------
// EIP-3009 transferWithAuthorization signature payload (signed by the wearer)
// ----------------------------------------------------------------------------
export interface UsdcTransferAuthorization {
  /** EIP-55 address that signed the authorization (payer / wearer). */
  from: string;
  /** EIP-55 address receiving the USDC (merchant treasury). */
  to: string;
  /** USDC base units (6 decimals) as a decimal string — e.g., "1500000" = 1.50 USDC. */
  value: string;
  /** Unix seconds — authorization is invalid before this. */
  validAfter: number;
  /** Unix seconds — authorization is invalid after this. */
  validBefore: number;
  /** 32-byte hex nonce (0x...) — single-use. */
  nonce: string;
  /** EIP-712 signature components from the wearer's wallet. */
  v: number;
  r: string;
  s: string;
}

export interface RelayUsdcTransferRequest {
  authorization: UsdcTransferAuthorization;
  /** Optional merchant context for ledger mirroring. */
  merchantId?: string;
  merchantName?: string;
  /** Optional human reference (order id, invoice number, POS session id, etc.). */
  reference?: string;
  /** Defaults server-side to Base mainnet (8453). */
  chainId?: number;
}

export interface RelayUsdcTransferResponse {
  /** On-chain transaction hash (0x...). */
  txHash: string;
  /** Lifecycle status as written to `usdc_payments.status`. */
  status: "pending" | "submitted" | "confirmed" | "failed";
  /** Primary key of the `usdc_payments` row. */
  paymentId: string;
  /** Primary key of the mirrored `transactions` row (Eddie compat). */
  transactionId?: string;
  blockNumber?: number;
  network?: string;
}

/**
 * Invoke the relay-usdc-transfer edge function.
 *
 * Throws on transport or relay rejection. The caller is responsible for UX
 * (toast / retry / fallback rail). Telemetry is emitted automatically.
 */
export async function relayUsdcTransfer(
  payload: RelayUsdcTransferRequest,
): Promise<RelayUsdcTransferResponse> {
  logPlanck("PROCESS", "USDC_RELAY_REQUEST", `Invoking relay for ${payload.authorization.value} units → ${payload.authorization.to}`);

  const { data, error } = await supabase.functions.invoke<RelayUsdcTransferResponse>(
    "relay-usdc-transfer",
    { body: payload },
  );

  if (error || !data) {
    logPlanck("STALL", "USDC_RELAY_REJECT", error?.message || "Relay returned no data.");
    throw new Error(error?.message || "USDC relay failed: no response from edge.");
  }

  logPlanck("END", "USDC_RELAY_SETTLED", `tx=${data.txHash} status=${data.status}`);
  return data;
}
