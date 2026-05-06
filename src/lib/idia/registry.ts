// IDIA Pay - The Registry: maps provisioning codes to vertical cartons.
// In production this would be served by The Hub. Here we model it as a typed
// in-memory registry that the hydration engine consumes as if it were live JSON.

export type NanoBiteSpec = {
  id: string;
  screen: string; // Screen Tag e.g. "Sales" | "Inventory" | "Logistics" | "Management"
  order: number;
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
};

export const REGISTRY: VerticalCarton[] = [
  {
    provisioningCode: "IDIA-HOSP-001",
    industry: "Hospitality",
    subModules: [
      {
        id: "hosp-fine-dining",
        label: "Fine Dining",
        description: "Tableside POS, billing, stock & staff",
        industry: "Hospitality · Fine Dining",
        nanoBites: [
          { id: "nb-pos-terminal", screen: "Sales", order: 1 },
          { id: "nb-hosp-billing", screen: "Sales", order: 2 },
          { id: "nb-stock-check", screen: "Inventory", order: 1 },
          { id: "nb-employee-id", screen: "Management", order: 1 },
        ],
      },
      {
        id: "hosp-quick-service",
        label: "Quick Service",
        description: "Counter POS for high-volume venues",
        industry: "Hospitality · QSR",
        nanoBites: [
          { id: "nb-pos-terminal", screen: "Sales", order: 1 },
          { id: "nb-stock-check", screen: "Inventory", order: 1 },
        ],
      },
    ],
  },
  {
    provisioningCode: "IDIA-RETAIL-001",
    industry: "Retail",
    subModules: [
      {
        id: "retail-boutique",
        label: "Boutique Retail",
        description: "POS, inventory and logistics",
        industry: "Retail · Boutique",
        nanoBites: [
          { id: "nb-pos-terminal", screen: "Sales", order: 1 },
          { id: "nb-stock-check", screen: "Inventory", order: 1 },
          { id: "nb-logistics-dispatch", screen: "Logistics", order: 1 },
          { id: "nb-employee-id", screen: "Management", order: 1 },
        ],
      },
    ],
  },
];

export function resolveProvisioningCode(code: string): VerticalCarton | null {
  console.log(`[REGISTRY_LOOKUP]: START - code="${code}"`);
  const trimmed = code.trim().toUpperCase();
  const carton = REGISTRY.find((c) => c.provisioningCode.toUpperCase() === trimmed) ?? null;
  console.log(
    `[REGISTRY_LOOKUP]: END - ${carton ? `matched ${carton.provisioningCode}` : "no match"}`,
  );
  return carton;
}
