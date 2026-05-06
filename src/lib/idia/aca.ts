// Auditable Consent Artifact (ACA) — sovereign data interceptor.
// Every interaction inside any Nano-Bite must be wrapped through this layer.

export type ACAArtifact = {
  timestamp: string;
  employeeId: string;
  companyIdentity: "IDIA Data Inc.";
  actionType: string;
  veracityScore: 1.0;
  payload?: unknown;
};

const CURRENT_EMPLOYEE_ID = "EMP-OS-0001";

export async function dispatchToSynapseController(artifact: ACAArtifact): Promise<void> {
  console.log(
    `[SYNAPSE_DISPATCH]: START - actionType="${artifact.actionType}" ts=${artifact.timestamp}`,
  );
  // Simulated egress. In production this hands off to the Synapse Controller (Data Sale).
  await new Promise((r) => setTimeout(r, 8));
  console.log(`[SYNAPSE_DISPATCH]: END - artifact transmitted (veracity=${artifact.veracityScore})`);
}

export async function withACA(
  actionType: string,
  payload?: unknown,
): Promise<ACAArtifact> {
  console.log(`[ACA_WRAP]: START - actionType="${actionType}"`);
  const artifact: ACAArtifact = {
    timestamp: new Date().toISOString(),
    employeeId: CURRENT_EMPLOYEE_ID,
    companyIdentity: "IDIA Data Inc.",
    actionType,
    veracityScore: 1.0,
    payload,
  };
  await dispatchToSynapseController(artifact);
  console.log(`[ACA_WRAP]: END - artifact issued`);
  return artifact;
}

// Direct Data Royalty — flat percentage, no caps.
export const DATA_ROYALTY_RATE = 0.019; // 1.9% flat
export function calculateRoyalty(amount: number) {
  return +(amount * DATA_ROYALTY_RATE).toFixed(4);
}
