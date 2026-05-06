// IDIA Pay - Live Registry: fetches vertical cartons from Supabase
// (table: device_provisioning_blueprints, column: payload).
import { supabase } from "@/integrations/supabase/client";

export type NanoBiteSpec = {
  id: string;
  screen: string;
  order: number;
  task?: string;
  microElement?: string;
  valueChainStage?: string;
  cadence?: string;
  requiresTier?: string;
};

export type SubModule = {
  id: string;
  label: string;
  description: string;
  industry: string;
  nanoBites: NanoBiteSpec[];
};

export type VerticalCarton = {
  provisioningCode: string;
  industry: string;
  subModules: SubModule[];
  raw?: unknown;
};

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function pickScreen(nb: Record<string, unknown>): string {
  const screenTag = (nb.screenTag as string) || (nb.screen as string);
  if (screenTag) return screenTag;
  const me = nb.microElement as string | undefined;
  if (me) return me;
  const vcs = nb.valueChainStage as string | undefined;
  if (vcs) {
    return vcs
      .split(/[_\s]+/)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");
  }
  return "General";
}

function normalizeBundle(bundle: Record<string, unknown>, idx: number): SubModule {
  const name = (bundle.name as string) || `Module ${idx + 1}`;
  const vertical = (bundle.vertical as string) || "General";
  const rawBites = (bundle.nanoBites as Array<Record<string, unknown>>) || [];
  const nanoBites: NanoBiteSpec[] = rawBites.map((nb, i) => ({
    id: (nb.id as string) || `nb-${i}`,
    screen: pickScreen(nb),
    order: i,
    task: nb.task as string | undefined,
    microElement: nb.microElement as string | undefined,
    valueChainStage: nb.valueChainStage as string | undefined,
    cadence: nb.cadence as string | undefined,
    requiresTier: nb.requiresTier as string | undefined,
  }));
  return {
    id: slugify(`${vertical}-${name}`),
    label: name,
    description: `${vertical} · ${nanoBites.length} Nano-Bites`,
    industry: `${vertical} · ${name}`,
    nanoBites,
  };
}

function normalizePayload(code: string, payload: Record<string, unknown>): VerticalCarton {
  const modules = (payload.modules as Record<string, unknown>) || payload;
  const bundles = (modules.bundles as Array<Record<string, unknown>>) || [];
  const subModules = bundles.map(normalizeBundle).filter((b) => b.nanoBites.length > 0);
  const industry =
    subModules[0]?.industry?.split(" · ")[0] ||
    (payload.vertical as string) ||
    "Sovereign Vertical";
  return { provisioningCode: code, industry, subModules, raw: payload };
}

export async function fetchProvisioningBlueprint(
  code: string,
): Promise<VerticalCarton | null> {
  const trimmed = code.trim().toUpperCase();
  console.log(`[DATABASE_HANDSHAKE]: START - Requesting manifest for code ${trimmed}`);
  const { data, error } = await supabase
    .from("device_provisioning_blueprints")
    .select("code, payload")
    .ilike("code", trimmed)
    .maybeSingle();

  if (error) {
    console.log(`[DATABASE_HANDSHAKE]: END - error ${error.message}`);
    return null;
  }
  if (!data) {
    console.log(`[DATABASE_HANDSHAKE]: END - no manifest for ${trimmed}`);
    return null;
  }
  console.log(`[DATABASE_HANDSHAKE]: END - Success. JSON payload retrieved.`);
  const carton = normalizePayload(
    data.code as string,
    (data.payload as Record<string, unknown>) || {},
  );
  console.log(
    `[OS_HYDRATION]: START - Analyzing screenTags for sidebar generation (${carton.subModules.length} sub-modules).`,
  );
  console.log(`[OS_HYDRATION]: END - Carton normalized.`);
  return carton;
}
