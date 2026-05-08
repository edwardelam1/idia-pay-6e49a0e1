/**
 * NANO-BITE ID: hosp.ft.sales.mobile_pos
 * NANO-BITE NAME: Mobile-POS sale
 * ROLE: Daily Operations & Omni-Tender Checkout
 * INDUSTRY: tertiary.hospitality.food_truck
 *
 * LAW:
 *  - No mock data, no stubs.
 *  - Tenant ID is read from useActiveBusinessId() — never trust props.
 *  - Every state transition routed through logPlanck.
 *  - Static mobile-shaped frame on desktop hosts; full-bleed on physical mobile.
 *  - Bifurcated tender rails: USDC (Flexa) and USD (fiat acquirer).
 */

import { useState, useCallback, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Plus,
  Minus,
  Trash2,
  ShoppingCart,
  CheckCircle,
  ChevronLeft,
  CreditCard,
  Banknote,
  Hexagon,
  Settings,
  PackageSearch,
} from "lucide-react";
import { toast } from "sonner";
import { logPlanck } from "@/lib/error-capture";
import { LiquidOSErrorBoundary } from "@/lib/error-boundary";
import { useActiveBusinessId } from "@/lib/idia/ActiveBusinessContext";
import { useHardwareFrame } from "@/lib/idia/useHardwareFrame";

// ============================================================================
// STRICT DATA SCHEMAS
// ============================================================================
export interface MenuCategory {
  id: string;
  name: string;
  colorCode: string;
}
export interface ModifierOption {
  id: string;
  name: string;
  priceDelta: number;
}
export interface ModifierGroup {
  id: string;
  name: string;
  isRequired: boolean;
  options: ModifierOption[];
}
export interface MenuItem {
  id: string;
  categoryId: string;
  name: string;
  basePrice: number;
  modifierGroups?: ModifierGroup[];
}
export interface CartItem {
  cartId: string;
  menuItemId: string;
  name: string;
  basePrice: number;
  quantity: number;
  seatNumber: number;
  modifiers: Record<string, ModifierOption>;
  calculatedPrice: number;
}

export interface MobilePosSaleProps {
  onFireToKds?: (
    cart: CartItem[],
    splitData: { type: "single" | "evenly"; ways: number },
  ) => Promise<unknown>;
  onProcessPayment?: (payload: Record<string, unknown>) => Promise<unknown>;
}

type TenderMethod = "USDC_Network" | "USD_Credit" | "Cash";
type PosStep =
  | "menu"
  | "modifiers"
  | "cart"
  | "tip"
  | "tender"
  | "signature"
  | "receipt"
  | "success"
  | "settings";

// ============================================================================
// CORE COMPONENT (BOUNDARY-WRAPPED EXPORT BELOW)
// ============================================================================
function MobilePosSaleInner({ onFireToKds, onProcessPayment }: MobilePosSaleProps) {
  const businessId = useActiveBusinessId();
  const frame = useHardwareFrame();

  // --- TENANT GATE ---
  if (!businessId) {
    logPlanck("STALL", "TENANT_CONTEXT_NULL", "MobilePosSale mounted with null carton tenant.");
    return (
      <DeviceFrame frame={frame}>
        <div className="flex h-full items-center justify-center p-8 text-center">
          <div>
            <h2 className="text-lg font-black uppercase tracking-widest text-destructive">
              Tenant Context Null
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              No business anchor in the provisioned carton. Re-provision the terminal.
            </p>
          </div>
        </div>
      </DeviceFrame>
    );
  }

  return (
    <DeviceFrame frame={frame}>
      <PosSurface
        businessId={businessId}
        onFireToKds={onFireToKds}
        onProcessPayment={onProcessPayment}
      />
    </DeviceFrame>
  );
}

// ============================================================================
// DEVICE FRAME — Static mobile envelope. Background never stretches/scrolls.
// ============================================================================
function DeviceFrame({
  frame,
  children,
}: {
  frame: ReturnType<typeof useHardwareFrame>;
  children: React.ReactNode;
}) {
  if (frame.isPhysicalMobile) {
    // Real phone: full-bleed.
    return (
      <div
        className="fixed inset-0 overflow-hidden bg-background"
        style={{ width: "100vw", height: "100dvh" }}
      >
        {children}
      </div>
    );
  }
  // Desktop / tablet host: static centered phone-shaped frame.
  return (
    <div
      className="fixed inset-0 flex items-center justify-center overflow-hidden bg-muted"
      style={{ touchAction: "none" }}
    >
      <div
        className="relative overflow-hidden rounded-[44px] border-[10px] border-foreground/90 bg-background shadow-2xl"
        style={{ width: frame.width, height: frame.height }}
      >
        {children}
      </div>
    </div>
  );
}

// ============================================================================
// POS SURFACE
// ============================================================================
function PosSurface({
  businessId,
  onFireToKds,
  onProcessPayment,
}: {
  businessId: string;
  onFireToKds?: MobilePosSaleProps["onFireToKds"];
  onProcessPayment?: MobilePosSaleProps["onProcessPayment"];
}) {
  const [step, setStep] = useState<PosStep>("menu");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);

  // UX state
  const [isFlip3D, setIsFlip3D] = useState(false);
  const [editModeId, setEditModeId] = useState<string | null>(null);

  // Touch refs
  const touchStartX = useRef(0);
  const holdTimer = useRef<number | null>(null);

  // Local terminal settings
  const [terminalSettings, setTerminalSettings] = useState({
    taxRate: 0.06,
    stationName: "Unit-01",
    isHapticEnabled: true,
  });

  const [dbCategories, setDbCategories] = useState<MenuCategory[]>([]);
  const [dbMenuItems, setDbMenuItems] = useState<MenuItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [splitType, setSplitType] = useState<"single" | "evenly">("single");
  const [splitWays, setSplitWays] = useState(2);

  const [selectedItemForMod, setSelectedItemForMod] = useState<MenuItem | null>(null);
  const [pendingModifiers, setPendingModifiers] = useState<Record<string, ModifierOption>>({});
  const [selectedTip, setSelectedTip] = useState(0);
  const [, setPaymentMethod] = useState<TenderMethod | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [orderId, setOrderId] = useState<string | null>(null);

  const triggerHaptic = useCallback(
    (type: "light" | "heavy" = "light") => {
      if (!terminalSettings.isHapticEnabled) return;
      try {
        if (typeof window !== "undefined" && window.navigator?.vibrate) {
          window.navigator.vibrate(type === "heavy" ? [50, 50, 50] : 50);
        }
      } catch (e) {
        logPlanck("STALL", "HAPTIC_ENGINE", "Hardware-agnostic fallback triggered", e);
      }
    },
    [terminalSettings.isHapticEnabled],
  );

  // ============================================================================
  // CATALOG HYDRATION — REAL DATA ONLY
  // ============================================================================
  useEffect(() => {
    let cancelled = false;
    const fetchCatalog = async () => {
      logPlanck("START", "DATA_HYDRATION", `Fetching POS Ledger for ID: ${businessId}`);
      setIsLoading(true);
      try {
        const { data, error } = await supabase
          .from("menu_items" as never)
          .select("*")
          .eq("business_id" as never, businessId as never)
          .eq("is_active" as never, true as never);

        if (cancelled) return;
        if (error) throw error;

        const rows = (data ?? []) as Array<Record<string, unknown>>;
        if (rows.length > 0) {
          const uniqueCats = Array.from(new Set(rows.map((r) => String(r.category))));
          const mappedCats: MenuCategory[] = uniqueCats.map((cat, idx) => ({
            id: cat,
            name: cat,
            colorCode: idx % 2 === 0 ? "#18181b" : "#333333",
          }));
          setDbCategories(mappedCats);
          setActiveCategory(mappedCats[0]?.id ?? null);

          const mappedItems: MenuItem[] = rows.map((item) => ({
            id: String(item.id),
            categoryId: String(item.category),
            name: String(item.name),
            basePrice: Number(item.base_price),
            modifierGroups:
              (item.recipe_ingredients as ModifierGroup[] | undefined) ?? undefined,
          }));
          setDbMenuItems(mappedItems);
          logPlanck("END", "DATA_HYDRATION", `Loaded ${mappedItems.length} SKUs successfully.`);
        } else {
          setDbCategories([]);
          setDbMenuItems([]);
          logPlanck("END", "DATA_HYDRATION", "Empty ledger.");
        }
      } catch (err) {
        logPlanck("STALL", "CRITICAL_FAILURE", "fetchCatalog stalled.", err);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };
    fetchCatalog();
    return () => {
      cancelled = true;
    };
  }, [businessId]);

  // ============================================================================
  // GESTURE & HARDWARE ENGINE
  // ============================================================================
  const handleGlobalTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };
  const handleGlobalTouchEnd = (e: React.TouchEvent) => {
    const diff = touchStartX.current - e.changedTouches[0].clientX;
    if (Math.abs(diff) > 100) {
      logPlanck("TRIGGER", "FLIP_3D_METAPHOR", `Horizontal vector ${diff}px. Toggling matrix.`);
      setIsFlip3D((p) => !p);
      triggerHaptic("heavy");
    }
  };
  const handleItemPointerDown = (id: string) => {
    holdTimer.current = window.setTimeout(() => {
      logPlanck("TRIGGER", "WIGGLE_MODE", `Edit mode for ${id}.`);
      setEditModeId(id);
      triggerHaptic("heavy");
    }, 3000);
  };
  const clearHoldTimer = () => {
    if (holdTimer.current) {
      clearTimeout(holdTimer.current);
      holdTimer.current = null;
    }
  };

  // ============================================================================
  // WORKFLOW HANDLERS (Pico-Bites)
  // ============================================================================
  const executeAddToCart = (item: MenuItem, selectedMods: Record<string, ModifierOption>) => {
    const additionalCost = Object.values(selectedMods).reduce((s, m) => s + m.priceDelta, 0);
    const newCartItem: CartItem = {
      cartId: `cart-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
      menuItemId: item.id,
      name: item.name,
      basePrice: item.basePrice,
      calculatedPrice: item.basePrice + additionalCost,
      quantity: 1,
      seatNumber: 1,
      modifiers: selectedMods,
    };
    setCart((p) => [...p, newCartItem]);
    setStep("menu");
    setSelectedItemForMod(null);
  };

  const updateQuantity = (cartId: string, delta: number) => {
    triggerHaptic();
    setCart((p) =>
      p
        .map((it) => (it.cartId === cartId ? { ...it, quantity: Math.max(0, it.quantity + delta) } : it))
        .filter((it) => it.quantity > 0),
    );
  };
  const updateSeat = (cartId: string, delta: number) => {
    triggerHaptic();
    setCart((p) =>
      p.map((it) =>
        it.cartId === cartId ? { ...it, seatNumber: Math.max(1, it.seatNumber + delta) } : it,
      ),
    );
  };

  const handleItemSelect = (item: MenuItem) => {
    triggerHaptic();
    const hasAny = (item.modifierGroups?.length ?? 0) > 0;
    if (hasAny) {
      setSelectedItemForMod(item);
      setPendingModifiers({});
      setStep("modifiers");
    } else {
      executeAddToCart(item, {});
    }
  };

  // ============================================================================
  // OMNI-TENDER EXECUTION CORE
  // ============================================================================
  const executeTender = async (method: TenderMethod) => {
    logPlanck("START", "PAYMENT_INIT", `Initializing ${method} sequence.`);
    setPaymentMethod(method);
    setIsProcessing(true);
    triggerHaptic();

    try {
      const generatedOrderId = `ORD-${Date.now().toString().slice(-6)}`;
      const subtotal = cart.reduce((s, it) => s + it.calculatedPrice * it.quantity, 0);
      const tax = subtotal * terminalSettings.taxRate;
      const total = subtotal + tax + selectedTip;

      let activeSessionId: string | null = null;

      if (method === "USDC_Network") {
        logPlanck("PROCESS", "NETWORK_HANDSHAKE", "Requesting USDC intent from Flexa edge.");
        const { data, error } = await supabase.functions.invoke("flexa-payment-processing", {
          body: { amount: total, currency: "USDC", locationId: businessId },
        });
        if (error || !data?.sessionId) {
          throw new Error(error?.message || "USDC settlement intent rejected by network.");
        }
        activeSessionId = data.sessionId as string;
        logPlanck("PROCESS", "NETWORK_HANDSHAKE", `USDC session ${activeSessionId}`);
      } else if (method === "USD_Credit") {
        logPlanck("PROCESS", "NETWORK_HANDSHAKE", "Requesting USD intent from fiat edge.");
        const { data, error } = await supabase.functions.invoke("fiat-payment-processing", {
          body: { amount: total, currency: "USD", locationId: businessId },
        });
        if (error || !data?.sessionId) {
          throw new Error(error?.message || "USD settlement intent rejected by acquirer.");
        }
        activeSessionId = data.sessionId as string;
        logPlanck("PROCESS", "NETWORK_HANDSHAKE", `USD session ${activeSessionId}`);
      }

      logPlanck("PROCESS", "LEDGER_COMMIT", "Vaulting transaction state to menu_history.");
      const { error: dbError } = await supabase.from("menu_history" as never).insert({
        business_id: businessId,
        action: "pos_sale",
        item_name: `Order ${generatedOrderId}`,
        note: `Payment: ${method}${activeSessionId ? ` | Session: ${activeSessionId}` : ""}`,
        metadata: {
          items: cart.map((c) => ({
            id: c.menuItemId,
            qty: c.quantity,
            price: c.calculatedPrice,
            seat: c.seatNumber,
          })),
          financials: { subtotal, tax, tip: selectedTip, total },
          method,
          sessionId: activeSessionId,
        },
      } as never);
      if (dbError) throw dbError;

      setOrderId(generatedOrderId);
      if (onFireToKds) await onFireToKds(cart, { type: splitType, ways: splitWays });
      if (onProcessPayment) {
        await onProcessPayment({
          method,
          amount: total,
          cart,
          businessId,
          orderId: generatedOrderId,
          sessionId: activeSessionId,
        });
      }
      logPlanck("END", "PAYMENT_SUCCESS", `Tender complete for ${generatedOrderId}.`);
      setStep(method === "Cash" ? "receipt" : "signature");
    } catch (error) {
      logPlanck("STALL", "PAYMENT_FAILED", "Tender failed.", error);
      const msg = error instanceof Error ? error.message : "Ledger commit failure.";
      toast.error(`Transaction Stalled: ${msg}`);
    } finally {
      setIsProcessing(false);
    }
  };

  // ============================================================================
  // RENDER
  // ============================================================================
  const subtotal = cart.reduce((s, it) => s + it.calculatedPrice * it.quantity, 0);
  const tax = subtotal * terminalSettings.taxRate;
  const total = subtotal + tax + selectedTip;

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center text-xs font-black uppercase tracking-widest text-muted-foreground">
        Resonating POS Ledger…
      </div>
    );
  }

  return (
    <div
      className="flex h-full w-full flex-col bg-background"
      onTouchStart={handleGlobalTouchStart}
      onTouchEnd={handleGlobalTouchEnd}
    >
      <style>{`
        @keyframes wiggle {
          0% { transform: rotate(0deg); }
          25% { transform: rotate(-2deg) scale(1.02); }
          50% { transform: rotate(0deg); }
          75% { transform: rotate(2deg) scale(1.02); }
          100% { transform: rotate(0deg); }
        }
        .animate-wiggle { animation: wiggle 0.3s infinite; cursor: grab; z-index: 50; }
      `}</style>

      {/* HEADER */}
      <div className="flex shrink-0 items-center justify-between border-b bg-card px-4 pb-3 pt-6 shadow-sm">
        <div className="flex items-center gap-2">
          {step !== "menu" && step !== "cart" && step !== "success" ? (
            <Button
              variant="ghost"
              className="h-11 w-11 rounded-full p-0"
              onClick={() => {
                triggerHaptic();
                setStep(step === "modifiers" ? "menu" : "cart");
              }}
            >
              <ChevronLeft size={22} />
            </Button>
          ) : (
            <Button
              variant="ghost"
              className="h-11 w-11 rounded-full p-0"
              onClick={() => {
                triggerHaptic();
                setStep("settings");
              }}
            >
              <Settings size={22} className="text-muted-foreground" />
            </Button>
          )}
          <div className="flex flex-col">
            <h1 className="text-lg font-black leading-none tracking-tight">Register</h1>
            <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              {terminalSettings.stationName}
            </span>
          </div>
        </div>

        {(step === "menu" || step === "cart") && (
          <Button
            className="relative min-h-11 rounded-full px-5 font-black shadow-md transition-all active:scale-95"
            variant={step === "cart" ? "secondary" : "default"}
            onClick={() => {
              triggerHaptic();
              setStep(step === "menu" ? "cart" : "menu");
            }}
          >
            {step === "menu" ? "Ticket" : "Menu"}
            {cart.length > 0 && step === "menu" && (
              <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-[10px] text-destructive-foreground ring-2 ring-background">
                {cart.reduce((a, it) => a + it.quantity, 0)}
              </span>
            )}
          </Button>
        )}
      </div>

      {/* SCROLLABLE BODY */}
      <div className="flex-1 overflow-y-auto">
        {/* SETTINGS */}
        {step === "settings" && (
          <div className="space-y-6 p-5">
            <h2 className="text-2xl font-black">Terminal Settings</h2>
            <div className="space-y-2">
              <Label className="ml-1 text-[11px] font-black uppercase tracking-widest text-muted-foreground">
                Station Name
              </Label>
              <Input
                className="h-12 rounded-xl text-base font-bold"
                value={terminalSettings.stationName}
                onChange={(e) =>
                  setTerminalSettings({ ...terminalSettings, stationName: e.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <Label className="ml-1 text-[11px] font-black uppercase tracking-widest text-muted-foreground">
                Tax Rate (%)
              </Label>
              <Input
                type="number"
                className="h-12 rounded-xl text-base font-bold"
                value={terminalSettings.taxRate * 100}
                onChange={(e) =>
                  setTerminalSettings({
                    ...terminalSettings,
                    taxRate: Number(e.target.value) / 100,
                  })
                }
              />
            </div>
            <div className="flex items-center justify-between rounded-2xl border bg-muted/30 p-4">
              <div className="flex flex-col">
                <span className="font-bold">Haptic Feedback</span>
                <span className="text-xs text-muted-foreground">Vibrate on success/error</span>
              </div>
              <Switch
                checked={terminalSettings.isHapticEnabled}
                onCheckedChange={(v) =>
                  setTerminalSettings({ ...terminalSettings, isHapticEnabled: v })
                }
              />
            </div>
            <Button
              className="h-14 w-full rounded-2xl text-base font-black shadow-xl"
              onClick={() => {
                triggerHaptic();
                setStep("menu");
              }}
            >
              Apply &amp; Save
            </Button>
            <p className="pt-4 text-center text-[10px] uppercase tracking-widest text-muted-foreground">
              Tenant: {businessId.slice(0, 8)}…
            </p>
          </div>
        )}

        {/* EMPTY MENU */}
        {dbMenuItems.length === 0 && step === "menu" && (
          <div className="flex h-full flex-col items-center justify-center px-6 py-20 text-center">
            <PackageSearch size={64} className="mb-4 text-muted-foreground/30" />
            <h2 className="text-xl font-black">Catalog Empty</h2>
            <p className="mt-3 max-w-xs text-sm leading-relaxed text-muted-foreground">
              Provision items via the Commissary Restock Nano-Bite to unlock the sales floor.
            </p>
          </div>
        )}

        {/* MENU GRID */}
        {step === "menu" && dbMenuItems.length > 0 && (
          <div className="flex flex-col pb-6">
            <div className="no-scrollbar flex gap-2 overflow-x-auto border-b bg-muted/10 p-3">
              {dbCategories.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => {
                    triggerHaptic();
                    setActiveCategory(cat.id);
                  }}
                  className={`min-h-11 whitespace-nowrap rounded-full border-2 px-5 py-2 text-xs font-black uppercase tracking-tight shadow-sm transition-all active:scale-95 ${
                    activeCategory === cat.id
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-card text-foreground"
                  }`}
                >
                  {cat.name}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-1 gap-3 p-3">
              {dbMenuItems
                .filter((it) => it.categoryId === activeCategory)
                .map((item) => (
                  <Card
                    key={item.id}
                    className="cursor-pointer rounded-3xl border-none shadow-sm transition-all active:scale-[0.98]"
                    onClick={() => handleItemSelect(item)}
                  >
                    <CardContent className="flex min-h-20 items-center justify-between p-5">
                      <div className="flex flex-col">
                        <h3 className="text-base font-black leading-tight">{item.name}</h3>
                        <p className="mt-1 text-sm font-bold text-muted-foreground">
                          ${item.basePrice.toFixed(2)}
                        </p>
                      </div>
                      <div className="flex h-11 w-11 items-center justify-center rounded-full bg-muted">
                        <Plus className="h-5 w-5 text-foreground" />
                      </div>
                    </CardContent>
                  </Card>
                ))}
            </div>
          </div>
        )}

        {/* MODIFIERS */}
        {step === "modifiers" && selectedItemForMod && (
          <div className="space-y-6 p-5 pb-40">
            <h2 className="text-2xl font-black tracking-tight">{selectedItemForMod.name}</h2>
            {selectedItemForMod.modifierGroups?.map((group) => (
              <div key={group.id} className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-black uppercase tracking-widest text-muted-foreground">
                    {group.name}
                  </h3>
                  {group.isRequired && (
                    <span className="rounded-full bg-destructive px-2 py-0.5 text-[10px] font-black text-destructive-foreground">
                      REQUIRED
                    </span>
                  )}
                </div>
                <div className="flex flex-col gap-2">
                  {group.options.map((opt) => {
                    const sel = pendingModifiers[group.id]?.id === opt.id;
                    return (
                      <button
                        key={opt.id}
                        onClick={() => {
                          triggerHaptic();
                          setPendingModifiers({ ...pendingModifiers, [group.id]: opt });
                        }}
                        className={`flex min-h-11 items-center justify-between rounded-2xl border-2 p-4 transition-all active:scale-[0.98] ${
                          sel ? "border-primary bg-primary/5" : "border-transparent bg-muted/30"
                        }`}
                      >
                        <span className="text-base font-bold">{opt.name}</span>
                        {opt.priceDelta > 0 && (
                          <span className="text-sm font-bold text-muted-foreground">
                            +${opt.priceDelta.toFixed(2)}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* CART */}
        {step === "cart" && (
          <div className="p-3 pb-72">
            {cart.length === 0 ? (
              <div className="py-32 text-center text-muted-foreground/30">
                <ShoppingCart size={80} className="mx-auto" />
              </div>
            ) : (
              <div className={isFlip3D ? "relative" : "space-y-3"}>
                {cart.map((item, idx) => (
                  <div
                    key={item.cartId}
                    className={editModeId === item.cartId ? "animate-wiggle" : ""}
                    style={
                      isFlip3D
                        ? {
                            transform: `perspective(1200px) rotateX(190deg) translateY(${idx * 96}px)`,
                            transformOrigin: "top center",
                            transition: "transform 320ms cubic-bezier(.2,.8,.2,1)",
                            position: idx > 0 ? "absolute" : "relative",
                            top: idx > 0 ? 0 : "auto",
                            width: "100%",
                            zIndex: cart.length - idx,
                          }
                        : { transform: "rotateX(0deg) translateY(0)" }
                    }
                    onPointerDown={() => handleItemPointerDown(item.cartId)}
                    onPointerUp={clearHoldTimer}
                    onPointerCancel={clearHoldTimer}
                    onPointerLeave={clearHoldTimer}
                  >
                    <Card className="overflow-hidden rounded-3xl border-none shadow-md">
                      <CardContent className="flex flex-col gap-4 p-5">
                        <div className="flex items-start justify-between">
                          <div className="flex flex-col">
                            <span className="text-lg font-black leading-tight">{item.name}</span>
                            {Object.values(item.modifiers).map((mod) => (
                              <span
                                key={mod.id}
                                className="mt-1 text-xs font-bold text-muted-foreground"
                              >
                                ↳ {mod.name}
                              </span>
                            ))}
                          </div>
                          <span className="text-lg font-black">
                            ${(item.calculatedPrice * item.quantity).toFixed(2)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between border-t border-muted pt-3">
                          <div className="flex items-center gap-2 rounded-full border bg-muted/40 p-1 shadow-inner">
                            <span className="pl-3 text-[10px] font-black uppercase text-muted-foreground">
                              Seat
                            </span>
                            <Button
                              variant="ghost"
                              className="h-11 w-11 rounded-full bg-background"
                              onClick={() => updateSeat(item.cartId, -1)}
                            >
                              <Minus size={14} />
                            </Button>
                            <span className="w-4 text-center text-base font-black">
                              {item.seatNumber}
                            </span>
                            <Button
                              variant="ghost"
                              className="h-11 w-11 rounded-full bg-background"
                              onClick={() => updateSeat(item.cartId, 1)}
                            >
                              <Plus size={14} />
                            </Button>
                          </div>
                          <div className="flex items-center gap-1 rounded-full border bg-muted/40 p-1 shadow-inner">
                            <Button
                              variant="ghost"
                              className="h-11 w-11 rounded-full bg-background text-destructive"
                              onClick={() => updateQuantity(item.cartId, -1)}
                            >
                              <Trash2 size={14} />
                            </Button>
                            <span className="w-7 text-center text-lg font-black">
                              {item.quantity}
                            </span>
                            <Button
                              variant="ghost"
                              className="h-11 w-11 rounded-full bg-background"
                              onClick={() => updateQuantity(item.cartId, 1)}
                            >
                              <Plus size={14} />
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TIP */}
        {step === "tip" && (
          <div className="p-5 pb-32 text-center">
            <h2 className="mb-8 text-2xl font-black">Gratuity</h2>
            <div className="grid grid-cols-2 gap-3">
              {[0.15, 0.2, 0.25].map((pct) => (
                <Button
                  key={pct}
                  variant="outline"
                  className="h-24 flex-col border-2 text-xl font-black"
                  onClick={() => {
                    triggerHaptic();
                    setSelectedTip(subtotal * pct);
                    setStep("tender");
                  }}
                >
                  <span>{pct * 100}%</span>
                  <span className="mt-1 text-xs font-bold text-muted-foreground">
                    +${(subtotal * pct).toFixed(2)}
                  </span>
                </Button>
              ))}
              <Button
                variant="outline"
                className="h-24 border-2 text-base font-bold"
                onClick={() => {
                  triggerHaptic();
                  setSelectedTip(0);
                  setStep("tender");
                }}
              >
                No Tip
              </Button>
            </div>
          </div>
        )}

        {/* TENDER */}
        {step === "tender" && (
          <div className="space-y-4 p-5 pb-32">
            <h2 className="mb-4 text-center text-2xl font-black">Tender Method</h2>
            <Button
              size="lg"
              className="h-20 w-full rounded-3xl text-lg font-black"
              onClick={() => executeTender("USD_Credit")}
              disabled={isProcessing}
            >
              <CreditCard className="mr-3 h-7 w-7" />
              <div className="flex flex-col items-start">
                <span>Credit / Debit</span>
                <span className="text-[10px] font-bold opacity-80">EMV Terminal</span>
              </div>
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="h-20 w-full rounded-3xl border-2 text-lg font-black"
              onClick={() => executeTender("USDC_Network")}
              disabled={isProcessing}
            >
              <Hexagon className="mr-3 h-7 w-7" />
              <div className="flex flex-col items-start">
                <span>USDC Digital</span>
                <span className="text-[10px] font-bold opacity-70">Settlement Network</span>
              </div>
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="h-20 w-full rounded-3xl border-2 text-lg font-black"
              onClick={() => executeTender("Cash")}
              disabled={isProcessing}
            >
              <Banknote className="mr-3 h-7 w-7" /> Cash
            </Button>
          </div>
        )}

        {/* SUCCESS / RECEIPT / SIGNATURE — minimum viable confirmation */}
        {(step === "success" || step === "receipt" || step === "signature") && (
          <div className="flex h-full flex-col items-center justify-center space-y-6 p-8 text-center">
            <div className="flex h-24 w-24 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 shadow-inner">
              <CheckCircle size={56} />
            </div>
            <div>
              <h2 className="text-3xl font-black tracking-tight">Secured</h2>
              <p className="text-base font-bold text-muted-foreground">Order #{orderId}</p>
            </div>
            <Button
              size="lg"
              className="h-14 w-full rounded-2xl text-lg font-black shadow-2xl"
              onClick={() => {
                setCart([]);
                setSelectedTip(0);
                setOrderId(null);
                setStep("menu");
              }}
            >
              Start New Ticket
            </Button>
          </div>
        )}
      </div>

      {/* STICKY FOOTER (Thumb Zone) */}
      {(step === "cart" || step === "modifiers") && (
        <div className="shrink-0 border-t bg-background p-4 shadow-2xl">
          {step === "modifiers" ? (
            <Button
              className="h-14 w-full rounded-2xl text-lg font-black shadow-xl"
              onClick={() => {
                const missing = selectedItemForMod?.modifierGroups?.find(
                  (g) => g.isRequired && !pendingModifiers[g.id],
                );
                if (missing) {
                  triggerHaptic("heavy");
                  toast.error(`Selection Required: ${missing.name}`);
                  return;
                }
                if (selectedItemForMod) executeAddToCart(selectedItemForMod, pendingModifiers);
              }}
            >
              Add to Ticket
            </Button>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-1 rounded-2xl border bg-muted p-1">
                <button
                  onClick={() => {
                    setSplitType("single");
                    triggerHaptic("light");
                  }}
                  className={`min-h-11 flex-1 rounded-xl py-2 text-[11px] font-black uppercase tracking-widest transition-all ${
                    splitType === "single" ? "bg-background shadow" : "text-muted-foreground"
                  }`}
                >
                  Single Check
                </button>
                <button
                  onClick={() => {
                    setSplitType("evenly");
                    triggerHaptic("light");
                  }}
                  className={`min-h-11 flex-1 rounded-xl py-2 text-[11px] font-black uppercase tracking-widest transition-all ${
                    splitType === "evenly" ? "bg-background shadow" : "text-muted-foreground"
                  }`}
                >
                  Split Evenly
                </button>
              </div>
              <div className="flex items-end justify-between px-1">
                <div className="flex flex-col">
                  <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                    Total
                  </span>
                  <span className="text-3xl font-black tracking-tight">${total.toFixed(2)}</span>
                </div>
                {splitType === "evenly" && (
                  <div className="flex items-center gap-2 rounded-full border bg-muted p-1 shadow-inner">
                    <Button
                      variant="ghost"
                      className="h-11 w-11 rounded-full bg-background"
                      onClick={() => {
                        triggerHaptic();
                        setSplitWays(Math.max(2, splitWays - 1));
                      }}
                    >
                      <Minus size={14} />
                    </Button>
                    <span className="w-6 text-center text-lg font-black">{splitWays}</span>
                    <Button
                      variant="ghost"
                      className="h-11 w-11 rounded-full bg-background"
                      onClick={() => {
                        triggerHaptic();
                        setSplitWays(splitWays + 1);
                      }}
                    >
                      <Plus size={14} />
                    </Button>
                  </div>
                )}
              </div>
              <Button
                size="lg"
                className="h-14 w-full rounded-2xl text-lg font-black shadow-2xl active:scale-[0.98]"
                disabled={cart.length === 0}
                onClick={() => setStep("tip")}
              >
                Fire &amp; Pay
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// EXPORT — wrapped in error boundary so a Pico-Bite collapse can't take down
// the surrounding screen grid.
// ============================================================================
export default function MobilePosSale(props: MobilePosSaleProps) {
  return (
    <LiquidOSErrorBoundary>
      <MobilePosSaleInner {...props} />
    </LiquidOSErrorBoundary>
  );
}
