/** * NANO-BITE ID: hosp.ft.sales.mobile_pos
 * NANO-BITE NAME: Mobile-POS sale
 * ROLE: Daily
 * INDUSTRY: tertiary.hospitality.food_truck 
 */

import React, { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { 
  Plus, Minus, Trash2, ShoppingCart, CheckCircle, 
  ChevronLeft, CreditCard, Banknote, Smartphone, 
  Receipt, PenTool, Gift, Users, Settings, PackageSearch,
  X, Info
} from "lucide-react";
import { toast } from "sonner";

// ============================================================================
// STRICT DATA SCHEMAS
// ============================================================================
export interface MenuCategory { id: string; name: string; colorCode: string; }
export interface ModifierOption { id: string; name: string; priceDelta: number; }
export interface ModifierGroup { id: string; name: string; isRequired: boolean; options: ModifierOption[]; }
export interface MenuItem { id: string; categoryId: string; name: string; basePrice: number; modifierGroups?: ModifierGroup[]; }
export interface CartItem { cartId: string; menuItemId: string; name: string; basePrice: number; quantity: number; seatNumber: number; modifiers: Record<string, ModifierOption>; calculatedPrice: number; }

export interface MobilePosSaleProps {
  businessId?: string;
  onFireToKds?: (cart: CartItem[], splitData: { type: 'single' | 'evenly', ways: number }) => Promise<any>;
  onProcessPayment?: (payload: any) => Promise<any>;
}

export default function MobilePosSale({ 
  businessId: initialBusinessId = "default", 
  onFireToKds,
  onProcessPayment
}: MobilePosSaleProps) {

  // --- STRICT STATE MACHINE ---
  type PosStep = "menu" | "modifiers" | "cart" | "tip" | "tender" | "signature" | "receipt" | "success" | "settings";
  
  const [step, setStep] = useState<PosStep>("menu");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  
  // Terminal Settings (Local Override)
  const [terminalSettings, setTerminalSettings] = useState({
    businessId: initialBusinessId,
    taxRate: 0.06,
    stationName: "Unit-01",
    isHapticEnabled: true
  });

  const [dbCategories, setDbCategories] = useState<MenuCategory[]>([]);
  const [dbMenuItems, setDbMenuItems] = useState<MenuItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [splitType, setSplitType] = useState<'single' | 'evenly'>('single');
  const [splitWays, setSplitWays] = useState<number>(2);

  const [selectedItemForMod, setSelectedItemForMod] = useState<MenuItem | null>(null);
  const [pendingModifiers, setPendingModifiers] = useState<Record<string, ModifierOption>>({});
  const [selectedTip, setSelectedTip] = useState<number>(0);
  const [paymentMethod, setPaymentMethod] = useState<"Integrated_Tap" | "Gift_Card" | "Cash" | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [orderId, setOrderId] = useState<string | null>(null);

  const triggerHaptic = useCallback((type: 'light' | 'heavy' = 'light') => {
    if (!terminalSettings.isHapticEnabled) return;
    try {
      if (typeof window !== 'undefined' && window.navigator && window.navigator.vibrate) {
        window.navigator.vibrate(type === 'heavy' ? [50, 50, 50] : 50);
      }
    } catch (e) { /* Hardware agnostic */ }
  }, [terminalSettings.isHapticEnabled]);

  // ============================================================================
  // SUPABASE: DIRECT COMMISSARY HYDRATION
  // ============================================================================
  const fetchCatalog = async () => {
    console.log(`[DATA_HYDRATION]: START - Fetching Ledger for ID: ${terminalSettings.businessId}`);
    setIsLoading(true);
    try {
      const { data, error } = await (supabase.from('menu_items' as any)
        .select('*')
        .eq('business_id', terminalSettings.businessId)
        .eq('is_active', true) as any);

      if (error) throw error;

      if (data && data.length > 0) {
        const uniqueCats = Array.from(new Set(data.map((item: any) => item.category)));
        const mappedCats = uniqueCats.map((cat, idx) => ({
          id: cat as string, 
          name: cat as string, 
          colorCode: idx % 2 === 0 ? '#18181b' : '#333333'
        }));
        
        setDbCategories(mappedCats);
        setActiveCategory(mappedCats[0].id);

        const mappedItems: MenuItem[] = data.map((item: any) => ({
          id: item.id,
          categoryId: item.category,
          name: item.name,
          basePrice: Number(item.base_price),
          modifierGroups: item.recipe_ingredients || undefined
        }));
        
        setDbMenuItems(mappedItems);
        console.log(`[DATA_HYDRATION]: SUCCESS - Loaded ${mappedItems.length} SKUs.`);
      } else {
        console.log(`[DATA_HYDRATION]: EMPTY - Local restock ledger is unprovisioned.`);
        setDbCategories([]);
        setDbMenuItems([]);
      }
    } catch (err: any) {
      console.error("[CRITICAL_FAILURE]: fetchCatalog Stalled:", err.message);
    } finally {
      setIsLoading(false);
      console.log(`[DATA_HYDRATION]: END - Sync cycle terminated.`);
    }
  };

  useEffect(() => {
    fetchCatalog();
  }, [terminalSettings.businessId]);

  // ============================================================================
  // WORKFLOW HANDLERS
  // ============================================================================
  const executeAddToCart = (item: MenuItem, selectedMods: Record<string, ModifierOption>) => {
    console.log(`[TRANSACTION_START]: Injecting SKU ${item.id} to cart.`);
    const additionalCost = Object.values(selectedMods).reduce((sum, mod) => sum + mod.priceDelta, 0);
    const newCartItem: CartItem = {
      cartId: `cart-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      menuItemId: item.id,
      name: item.name,
      basePrice: item.basePrice,
      calculatedPrice: item.basePrice + additionalCost,
      quantity: 1,
      seatNumber: 1, 
      modifiers: selectedMods
    };
    setCart(prev => [...prev, newCartItem]);
    setStep("menu");
    setSelectedItemForMod(null);
    console.log(`[TRANSACTION_DATA]: Cart Count: ${cart.length + 1}`);
  };
// THE LAW: 44px min touch target interaction handlers
const updateQuantity = (cartId: string, delta: number) => {
  console.log(`[TRANSACTION_DATA]: Updating quantity for ${cartId} by ${delta}`);
  triggerHaptic();
  setCart(prev => prev.map(item => {
    if (item.cartId === cartId) {
      return { ...item, quantity: Math.max(0, item.quantity + delta) };
    }
    return item;
  }).filter(item => item.quantity > 0)); // Permanent purge if quantity hits zero
};

const updateSeat = (cartId: string, delta: number) => {
  console.log(`[TRANSACTION_DATA]: Reassigning seat for ${cartId} by ${delta}`);
  triggerHaptic();
  setCart(prev => prev.map(item => {
    if (item.cartId === cartId) {
      return { ...item, seatNumber: Math.max(1, item.seatNumber + delta) };
    }
    return item;
  }));
};
  const handleItemSelect = (item: MenuItem) => {
    triggerHaptic();
    const hasRequired = item.modifierGroups?.some(g => g.isRequired);
    const hasAny = item.modifierGroups && item.modifierGroups.length > 0;
    if (hasRequired || hasAny) {
      setSelectedItemForMod(item);
      setPendingModifiers({});
      setStep("modifiers");
    } else {
      executeAddToCart(item, {});
    }
  };

  const executeTender = async (method: "Integrated_Tap" | "Gift_Card" | "Cash") => {
    console.log(`[PAYMENT_START]: Initializing ${method} tender.`);
    setPaymentMethod(method);
    setIsProcessing(true);
    triggerHaptic();
    
    try {
      const generatedOrderId = `ORD-${Date.now().toString().slice(-6)}`;
      const subtotal = cart.reduce((sum, item) => sum + (item.calculatedPrice * item.quantity), 0);
      const tax = subtotal * terminalSettings.taxRate;
      const total = subtotal + tax + selectedTip;

      // THE LAW: Permanent write to menu_history POS Ledger
      const { error: dbError } = await (supabase.from('menu_history' as any).insert({
        business_id: terminalSettings.businessId,
        action: 'pos_sale',
        item_name: `Order ${generatedOrderId}`,
        note: `Payment: ${method}`,
        metadata: {
          items: cart.map(c => ({ id: c.menuItemId, qty: c.quantity, price: c.calculatedPrice, seat: c.seatNumber })),
          financials: { subtotal, tax, tip: selectedTip, total },
          method
        }
      }) as any);

      if (dbError) throw dbError;
      setOrderId(generatedOrderId);

      if (onFireToKds) await onFireToKds(cart, { type: splitType, ways: splitWays });
      if (onProcessPayment) await onProcessPayment({ method, amount: total, cart, businessId: terminalSettings.businessId, orderId: generatedOrderId });

      setStep(method === "Cash" ? "receipt" : "signature");
    } catch (error: any) {
      console.error(`[PAYMENT_STALL]: Tender failed:`, error.message);
      toast.error("Stall: Could not commit to ledger.");
    } finally {
      setIsProcessing(false);
      console.log(`[PAYMENT_END]: Tender sequence terminated.`);
    }
  };

  // ============================================================================
  // RENDER: THE STEP MACHINE
  // ============================================================================
  // Financial Logic: The Hard Truth of the Ledger
const subtotal = cart.reduce((sum, item) => sum + (item.calculatedPrice * item.quantity), 0);
const tax = subtotal * terminalSettings.taxRate;
const total = subtotal + tax + selectedTip;
  if (isLoading) return <div className="h-screen flex items-center justify-center animate-pulse font-black text-muted-foreground uppercase tracking-widest text-xs">Syncing Local Ledger...</div>;

  return (
    <div className="flex flex-col h-screen bg-background relative overflow-hidden">
      
      {/* GLOBAL HEADER */}
      <div className="pt-8 pb-4 px-4 bg-card border-b flex justify-between items-center z-20 shadow-sm">
        <div className="flex items-center gap-2">
          {step !== "menu" && step !== "cart" && step !== "success" ? (
            <Button variant="ghost" className="h-[44px] w-[44px] p-0 rounded-full" onClick={() => setStep(step === "modifiers" ? "menu" : "cart")}>
              <ChevronLeft size={24} />
            </Button>
          ) : (
            <Button variant="ghost" className="h-[44px] w-[44px] p-0 rounded-full" onClick={() => { triggerHaptic(); setStep("settings"); }}>
              <Settings size={24} className="text-muted-foreground" />
            </Button>
          )}
          <div className="flex flex-col">
            <h1 className="text-xl font-black tracking-tight leading-none">Register</h1>
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">{terminalSettings.stationName}</span>
          </div>
        </div>

        {(step === "menu" || step === "cart") && (
          <Button 
            className="min-h-[44px] relative rounded-full px-6 font-black active:scale-95 transition-all shadow-md"
            variant={step === "cart" ? "secondary" : "default"}
            onClick={() => setStep(step === "menu" ? "cart" : "menu")}
          >
            {step === "menu" ? "Ticket" : "Menu"}
            {cart.length > 0 && step === "menu" && (
              <span className="absolute -top-1 -right-1 bg-destructive text-white text-[10px] h-5 w-5 flex items-center justify-center rounded-full ring-2 ring-background">
                {cart.reduce((acc, item) => acc + item.quantity, 0)}
              </span>
            )}
          </Button>
        )}
      </div>

      <ScrollArea className="flex-1 w-full relative">
        
        {/* VIEW: SETTINGS (The Law: Labels above, Single Column) */}
        {step === "settings" && (
          <div className="p-6 animate-in slide-in-from-left duration-300">
            <h2 className="text-3xl font-black mb-8">Terminal Settings</h2>
            <div className="space-y-8 max-w-md">
              <div className="space-y-2">
                <Label className="text-xs font-black text-muted-foreground uppercase tracking-widest ml-1">Business Identifier</Label>
                <Input 
                  className="h-[56px] rounded-2xl text-lg font-bold" 
                  value={terminalSettings.businessId}
                  onChange={(e) => setTerminalSettings({...terminalSettings, businessId: e.target.value})}
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-black text-muted-foreground uppercase tracking-widest ml-1">Station Name</Label>
                <Input 
                  className="h-[56px] rounded-2xl text-lg font-bold" 
                  value={terminalSettings.stationName}
                  onChange={(e) => setTerminalSettings({...terminalSettings, stationName: e.target.value})}
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-black text-muted-foreground uppercase tracking-widest ml-1">Tax Rate (%)</Label>
                <Input 
                  type="number" 
                  className="h-[56px] rounded-2xl text-lg font-bold" 
                  value={terminalSettings.taxRate * 100}
                  onChange={(e) => setTerminalSettings({...terminalSettings, taxRate: Number(e.target.value) / 100})}
                />
              </div>
              <div className="flex items-center justify-between p-4 bg-muted/30 rounded-2xl border">
                <div className="flex flex-col">
                  <span className="font-bold">Haptic Feedback</span>
                  <span className="text-xs text-muted-foreground">Vibrate on success/error</span>
                </div>
                <Switch 
                  checked={terminalSettings.isHapticEnabled}
                  onCheckedChange={(val) => setTerminalSettings({...terminalSettings, isHapticEnabled: val})}
                />
              </div>
              <Button 
                className="w-full h-[64px] rounded-2xl text-xl font-black shadow-xl"
                onClick={() => { triggerHaptic(); setStep("menu"); }}
              >
                Apply & Save
              </Button>
            </div>
          </div>
        )}

        {/* VIEW: EMPTY STATE (Restock Link) */}
        {dbMenuItems.length === 0 && step === "menu" && (
          <div className="flex flex-col items-center justify-center py-32 px-8 text-center">
            <PackageSearch size={80} className="text-muted-foreground/20 mb-6" />
            <h2 className="text-3xl font-black text-foreground">Catalog Empty</h2>
            <p className="text-muted-foreground mt-4 font-medium leading-relaxed max-w-xs">
              Provision your items and recipes via the <span className="font-bold text-foreground">Commissary Restock</span> page to unlock the sales floor.
            </p>
          </div>
        )}

        {/* VIEW: MENU GRID */}
        {step === "menu" && dbMenuItems.length > 0 && (
          <div className="flex flex-col pb-32">
            <div className="flex overflow-x-auto py-4 px-4 gap-3 no-scrollbar bg-muted/10 border-b">
              {dbCategories.map(cat => (
                <button
                  key={cat.id}
                  onClick={() => { triggerHaptic(); setActiveCategory(cat.id); }}
                  className={`px-8 py-3 rounded-full text-sm font-black uppercase tracking-tight transition-all active:scale-95 shadow-sm border-2 ${activeCategory === cat.id ? 'bg-primary text-primary-foreground border-primary' : 'bg-card text-foreground border-border'}`}
                >
                  {cat.name}
                </button>
              ))}
            </div>
            <div className="p-4 grid grid-cols-1 gap-3">
              {dbMenuItems.filter(item => item.categoryId === activeCategory).map(item => (
                <Card key={item.id} className="active:scale-[0.98] transition-all border-none shadow-sm rounded-[24px] cursor-pointer" onClick={() => handleItemSelect(item)}>
                  <CardContent className="p-6 flex justify-between items-center min-h-[96px]">
                    <div className="flex flex-col">
                      <h3 className="font-black text-xl leading-tight">{item.name}</h3>
                      <p className="text-muted-foreground font-bold text-base mt-1">${item.basePrice.toFixed(2)}</p>
                    </div>
                    <div className="h-12 w-12 bg-muted rounded-full flex items-center justify-center">
                      <Plus className="h-6 w-6 text-foreground" />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* VIEW: MODIFIERS (Toast Sophistication) */}
        {step === "modifiers" && selectedItemForMod && (
          <div className="p-6 pb-40 animate-in slide-in-from-bottom">
            <h2 className="text-4xl font-black tracking-tighter">{selectedItemForMod.name}</h2>
            <div className="space-y-10 mt-8">
              {selectedItemForMod.modifierGroups?.map(group => (
                <div key={group.id} className="space-y-4">
                  <div className="flex justify-between items-center">
                    <h3 className="text-xl font-black uppercase tracking-widest text-muted-foreground">{group.name}</h3>
                    {group.isRequired && <span className="bg-destructive text-white text-[10px] font-black px-3 py-1 rounded-full">REQUIRED</span>}
                  </div>
                  <div className="flex flex-col gap-2">
                    {group.options.map(opt => {
                      const isSelected = pendingModifiers[group.id]?.id === opt.id;
                      return (
                        <button
                          key={opt.id}
                          onClick={() => { triggerHaptic(); setPendingModifiers({...pendingModifiers, [group.id]: opt}); }}
                          className={`flex justify-between items-center p-6 rounded-[22px] border-2 transition-all active:scale-[0.98] ${isSelected ? 'border-primary bg-primary/5' : 'border-transparent bg-muted/20'}`}
                        >
                          <span className="text-xl font-bold">{opt.name}</span>
                          {opt.priceDelta > 0 && <span className="text-muted-foreground font-bold text-lg">+${opt.priceDelta.toFixed(2)}</span>}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* VIEW: ACTIVE CART (Seat Handling) */}
        {step === "cart" && (
          <div className="p-4 pb-[320px]">
            {cart.length === 0 ? (
              <div className="text-center py-40 text-muted-foreground/20"><ShoppingCart size={100} className="mx-auto" /></div>
            ) : (
              <div className="space-y-4">
                {cart.map(item => (
                  <Card key={item.cartId} className="border-none shadow-md rounded-[28px] overflow-hidden">
                    <CardContent className="p-6 flex flex-col gap-6">
                      <div className="flex justify-between items-start">
                        <div className="flex flex-col">
                          <span className="font-black text-2xl leading-tight">{item.name}</span>
                          {Object.values(item.modifiers).map(mod => (
                            <span key={mod.id} className="text-muted-foreground font-bold text-sm mt-1">↳ {mod.name}</span>
                          ))}
                        </div>
                        <span className="font-black text-2xl">${(item.calculatedPrice * item.quantity).toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between items-center pt-4 border-t border-muted">
                        <div className="flex items-center gap-3 bg-muted/50 p-1.5 rounded-full border shadow-inner">
                          <span className="pl-4 text-[10px] font-black text-muted-foreground uppercase">Seat</span>
                          <Button variant="ghost" className="h-11 w-11 rounded-full bg-background shadow-sm" onClick={() => updateSeat(item.cartId, -1)}><Minus size={16}/></Button>
                          <span className="font-black text-lg w-4 text-center">{item.seatNumber}</span>
                          <Button variant="ghost" className="h-11 w-11 rounded-full bg-background shadow-sm" onClick={() => updateSeat(item.cartId, 1)}><Plus size={16}/></Button>
                        </div>
                        <div className="flex items-center gap-2 bg-muted/50 p-1.5 rounded-full border shadow-inner">
                          <Button variant="ghost" className="h-11 w-11 rounded-full bg-background text-destructive" onClick={() => updateQuantity(item.cartId, -1)}><Trash2 size={16}/></Button>
                          <span className="font-black text-2xl w-8 text-center">{item.quantity}</span>
                          <Button variant="ghost" className="h-11 w-11 rounded-full bg-background" onClick={() => updateQuantity(item.cartId, 1)}><Plus size={16}/></Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}

        {/* VIEW: TENDER & PAYMENT FLOWS */}
        {step === "tip" && (
          <div className="p-6 pb-40 animate-in slide-in-from-right text-center">
            <h2 className="text-4xl font-black mb-12">Gratuity</h2>
            <div className="grid grid-cols-2 gap-4">
              {[0.15, 0.20, 0.25].map(pct => (
                <Button key={pct} variant="outline" className="h-32 flex flex-col text-3xl font-black bg-card border-2" onClick={() => { triggerHaptic(); setSelectedTip(subtotal * pct); setStep("tender"); }}>
                  <span>{pct * 100}%</span>
                  <span className="text-sm font-bold text-muted-foreground mt-2">+${(subtotal * pct).toFixed(2)}</span>
                </Button>
              ))}
              <Button variant="outline" className="h-32 text-xl font-bold border-2" onClick={() => { triggerHaptic(); setSelectedTip(0); setStep("tender"); }}>No Tip</Button>
            </div>
          </div>
        )}

        {step === "tender" && (
          <div className="p-6 pb-40 animate-in slide-in-from-right space-y-6">
            <h2 className="text-4xl font-black text-center mb-8">Tender</h2>
            <Button size="lg" className="w-full h-28 text-2xl font-black bg-[#007AFF] rounded-3xl" onClick={() => executeTender("Integrated_Tap")} disabled={isProcessing}>
              <CreditCard className="mr-6 h-10 w-10" /> Credit / USDC
            </Button>
            <Button size="lg" variant="outline" className="w-full h-24 text-2xl font-black border-2 rounded-3xl" onClick={() => executeTender("Cash")} disabled={isProcessing}>
              <Banknote className="mr-6 h-10 w-10" /> Cash
            </Button>
          </div>
        )}

        {step === "success" && (
          <div className="flex flex-col items-center justify-center p-10 h-full text-center space-y-10 animate-in zoom-in-95">
            <div className="h-32 w-32 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center shadow-inner"><CheckCircle size={80} /></div>
            <div className="space-y-2">
              <h2 className="text-5xl font-black tracking-tighter">Secured</h2>
              <p className="text-2xl font-bold text-muted-foreground">Order #{orderId}</p>
            </div>
            <Button size="lg" className="w-full h-24 text-3xl font-black rounded-[32px] shadow-2xl" onClick={() => { setCart([]); setSelectedTip(0); setStep("menu"); }}>Start New Ticket</Button>
          </div>
        )}

      </ScrollArea>

      {/* STICKY ACTION FOOTER (Thumb Zone) */}
      {(step === "cart" || step === "modifiers") && (
        <div className="fixed bottom-0 left-0 w-full bg-background border-t p-6 pb-12 shadow-2xl z-50 rounded-t-[40px] animate-in slide-in-from-bottom">
          {step === "modifiers" ? (
             <Button className="h-20 w-full text-2xl font-black rounded-3xl shadow-xl" onClick={() => {
                const missing = selectedItemForMod?.modifierGroups?.find(g => g.isRequired && !pendingModifiers[g.id]);
                if (missing) { triggerHaptic('heavy'); alert(`Selection Required: ${missing.name}`); return; }
                executeAddToCart(selectedItemForMod!, pendingModifiers);
             }}>Add to Ticket</Button>
          ) : (
            <div className="space-y-6">
              <div className="flex items-center gap-2 bg-muted p-1 rounded-2xl border">
                <button onClick={() => setSplitType('single')} className={`flex-1 py-4 rounded-xl text-[12px] font-black uppercase tracking-widest transition-all ${splitType === 'single' ? 'bg-background shadow-lg' : 'text-muted-foreground'}`}>Single Check</button>
                <button onClick={() => setSplitType('evenly')} className={`flex-1 py-4 rounded-xl text-[12px] font-black uppercase tracking-widest transition-all ${splitType === 'evenly' ? 'bg-background shadow-lg' : 'text-muted-foreground'}`}>Split Evenly</button>
              </div>
              <div className="flex justify-between items-end px-2">
                <div className="flex flex-col"><span className="text-sm font-black text-muted-foreground uppercase tracking-widest">Total Collected</span><span className="text-5xl font-black tracking-tighter">${total.toFixed(2)}</span></div>
                {splitType === 'evenly' && <div className="flex items-center gap-3 bg-muted p-1.5 rounded-full border shadow-inner">
                    <Button variant="ghost" className="rounded-full h-10 w-10 bg-background" onClick={() => setSplitWays(Math.max(2, splitWays - 1))}><Minus size={16}/></Button>
                    <span className="font-black text-2xl w-6 text-center">{splitWays}</span>
                    <Button variant="ghost" className="rounded-full h-10 w-10 bg-background" onClick={() => setSplitWays(splitWays + 1)}><Plus size={16}/></Button>
                </div>}
              </div>
              <Button size="lg" className="h-20 w-full text-3xl font-black bg-[#1D1D1F] text-white rounded-[32px] shadow-2xl active:scale-[0.98]" onClick={() => setStep("tip")}>Fire & Pay</Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}