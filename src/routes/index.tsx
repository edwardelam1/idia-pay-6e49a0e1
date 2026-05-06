import { createFileRoute } from "@tanstack/react-router";
import { LiquidOS } from "@/lib/idia/LiquidOS";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "IDIA Pay · LiquidOS" },
      {
        name: "description",
        content:
          "IDIA Pay LiquidOS — a hydrating shell for sovereign, dual-rail commerce. Enter a Hub provisioning code to hydrate your industry workspace.",
      },
      { property: "og:title", content: "IDIA Pay · LiquidOS" },
      {
        property: "og:description",
        content:
          "Sovereign, dual-rail (USD + USDC) commerce OS that hydrates from The Hub.",
      },
    ],
  }),
  component: Index,
});

function Index() {
  return <LiquidOS />;
}
