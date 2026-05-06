// IDIA Pay LiquidOS - Nano-Bite primitives.
// All hardcoded mock components have been removed. Manifests are now rendered
// 1:1 by the LiquidOS DynamicNanoBite renderer using the real spec fields,
// which guarantees no duplicate cards on any screen.

import type { ReactNode } from "react";

export type NanoBiteProps = {
  InstanceID: string;
  IndustryContext: string;
  ActionCallback: (action: string, payload?: unknown) => void;
};

// Empty registry: every Nano-Bite renders from the live manifest.
export const NANO_BITE_REGISTRY: Record<string, (p: NanoBiteProps) => ReactNode> = {};
