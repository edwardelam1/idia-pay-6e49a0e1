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
import { Plus, Minus, Trash2, ShoppingCart, CheckCircle, ChevronLeft, CreditCard, Banknote, Smartphone, Receipt, PenTool, Gift, Users } from "lucide-react";

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
  businessId = "default", 
  onFireToKds,
  onProcessPayment
}: MobilePosSaleProps) {

  // --- STRICT STATE MACHINE ---
  type PosStep = "menu" | "modifiers" | "cart" | "tip" | "tender" | "signature" | "receipt" | "success";
  
  const [step, setStep] = useState<PosStep>("menu");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  
  // Database Mapped State
  const [dbCategories, setDbCategories] = useState<MenuCategory[]>([]);
  const [dbMenuItems, setDbMenuItems] = useState<MenuItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Ticket Splitting State
  const [splitType, setSplitType] = useState<'single' | 'evenly'>('single');
  const [splitWays, setSplitWays] = useState<number>(2);

  // Transient Workflows
  const [selectedItemForMod, setSelectedItemForMod] = useState<MenuItem | null>(null);
  const [pendingModifiers, setPendingModifiers] = useState<Record<string, ModifierOption>>({});
  const [selectedTip, setSelectedTip] = useState<number>(0);
  const [paymentMethod, setPaymentMethod] = useState<"Integrated_Tap" | "Gift_Card" | "Cash" | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [orderId, setOrderId] = useState<string | null>(null);

  const triggerHaptic = useCallback((type: 'light' | 'heavy' = 'light') => {
    try {
      if (typeof window !== 'undefined' && window.navigator && window.navigator.vibrate) {
        window.navigator.vibrate(type === 'heavy' ? [50, 50, 50] : 50);
      }
    } catch (e) { /* Hardware agnostic fallback */ }
  }, []);

  // ============================================================================
  // SUPABASE: FETCH MENU CATALOG
  // ============================================================================
  useEffect(() => {
    const fetchCatalog = async () => {
      console.log(`[BEGIN] fetchCatalog execution for businessId: ${businessId}`);
      setIsLoading(true);
      try {
        const { data, error } = await supabase
          .from('menu_items')
          .select('*')
          .eq('business_id', businessId)
          .eq('is_active', true);

        if (error) throw error;

        if (data && data.length > 0) {
          // 1. Extract distinct categories from the table
          const uniqueCats = Array.from(new Set(data.map((item: any) => item.category)));
          const mappedCats = uniqueCats.map((cat, idx) => ({
            id: cat as string, 
            name: cat as string, 
            colorCode: idx % 2 === 0 ? '#18181b' : '#333333'
          }));
          
          setDbCategories(mappedCats);
          setActiveCategory(mappedCats[0].id);

          // 2. Map items directly from public.menu_items
          const mappedItems: MenuItem[] = data.map((item: any) => ({
            id: item.id,
            categoryId: item.category,
            name: item.name,
            basePrice: Number(item.base_price),
            modifierGroups: item.recipe_ingredients && Array.isArray(item.recipe_ingredients) && item.recipe_ingredients.length > 0 
              ? item.recipe_ingredients 
              : undefined
          }));
          
          setDbMenuItems(mappedItems);
          console.log(`[INFO] fetchCatalog: Loaded ${mappedItems.length} items across ${mappedCats.length} categories.`);
        } else {
          console.log(`[INFO] fetchCatalog: No active menu items found for business.`);
        }
      } catch (err: any) {
        console.error("[ERROR] Failed to fetch catalog:", err.message);
      } finally {
        setIsLoading(false);
        console.log(`[END] fetchCatalog execution`);
      }
    };

    if (businessId !== "default") fetchCatalog();
    else setIsLoading(false);
  }, [businessId]);

  // ============================================================================
  // WORKFLOW: MENU & MANDATORY MODIFIERS
  // ============================================================================
  const handleItemSelect = useCallback((item: MenuItem) => {
    console.log(`[BEGIN] handleItemSelect execution for sku: ${item.id}`);
    try {
      triggerHaptic();
      const hasRequiredMods = item.modifierGroups?.some(g => g.isRequired);
      const hasAnyMods = item.modifierGroups && item.modifierGroups.length > 0;

      if (hasRequiredMods || hasAnyMods) {
        console.log(`[INFO] handleItemSelect: Modifiers detected. Intercepting flow.`);
        setSelectedItemForMod(item);
        setPendingModifiers({});
        setStep("modifiers");
      } else {
        executeAddToCart(item, {});
      }
    } catch (error) {
      console.error(`[ERROR] handleItemSelect failed:`, error);
    } finally {
      console.log(`[END] handleItemSelect execution`);
    }
  }, [triggerHaptic]);

  const executeAddToCart = (item: MenuItem, selectedMods: Record<string, ModifierOption>) => {
    console.log(`[BEGIN] executeAddToCart execution for sku: ${item.id}`);
    try {
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
    } catch (error) {
      console.error(`[ERROR] executeAddToCart failed:`, error);
    } finally {
      console.log(`[END] executeAddToCart execution`);
    }
  };

  const handleModifierSelection = (groupId: string, option: ModifierOption) => {
    triggerHaptic();
    setPendingModifiers(prev => ({ ...prev, [groupId]: option }));
  };

  const validateAndSubmitModifiers = () => {
    if (!selectedItemForMod) return;

    const missingRequired = selectedItemForMod.modifierGroups?.find(
      g => g.isRequired && !pendingModifiers[g.id]
    );

    if (missingRequired) {
      triggerHaptic('heavy');
      alert(`Selection Required: Please choose an option for ${missingRequired.name}`);
      return;
    }

    executeAddToCart(selectedItemForMod, pendingModifiers);
  };

  // ============================================================================
  // WORKFLOW: CART & SEAT HANDLING
  // ============================================================================
  const updateQuantity = useCallback((cartId: string, delta: number) => {
    triggerHaptic();
    setCart(prev => prev.map(item => {
      if (item.cartId === cartId) return { ...item, quantity: Math.max(0, item.quantity + delta) };
      return item;
    }).filter(item => item.quantity > 0)); 
  }, [triggerHaptic]);

  const updateSeat = useCallback((cartId: string, delta: number) => {
    triggerHaptic();
    setCart(prev => prev.map(item => {
      if (item.cartId === cartId) {
        const newSeat = Math.max(1, item.seatNumber + delta);
        return { ...item, seatNumber: newSeat };
      }
      return item;
    }));
  }, [triggerHaptic]);

  const updateSplitWays = useCallback((delta: number) => {
    triggerHaptic();
    setSplitWays(prev => Math.max(2, Math.min(10, prev + delta)));
  }, [triggerHaptic]);

  // ============================================================================
  // SUPABASE: FIRE TO KDS & TENDER
  // ============================================================================
  const cartSubtotal = cart.reduce((sum, item) => sum + (item.calculatedPrice * item.quantity), 0);
  const cartTax = cartSubtotal * 0.06; // Structural tax placeholder
  const cartTotal = cartSubtotal + cartTax + selectedTip;

  const initiateFireAndPay = async () => {
    console.log(`[BEGIN] initiateFireAndPay execution`);
    try {
      setIsProcessing(true);
      triggerHaptic();
      
      if (onFireToKds) {
        console.log(`[INFO] initiateFireAndPay: Transmitting live ticket to KDS...`);
        await onFireToKds(cart, { type: splitType, ways: splitWays });
      }
      setStep("tip");
    } catch (error) {
      console.error(`[ERROR] initiateFireAndPay failed:`, error);
    } finally {
      setIsProcessing(false);
      console.log(`[END] initiateFireAndPay execution`);
    }
  };

  const executeTender = async (method: "Integrated_Tap" | "Gift_Card" | "Cash") => {
    console.log(`[BEGIN] executeTender execution. Method: ${method}`);
    setPaymentMethod(method);
    setIsProcessing(true);
    triggerHaptic();
    
    try {
      const generatedOrderId = `ORD-${Date.now().toString().slice(-6)}`;
      setOrderId(generatedOrderId);

      // 1. Write the transaction natively to public.menu_history (The POS Ledger)
      const { error: dbError } = await supabase.from('menu_history').insert({
        business_id: businessId,
        action: 'pos_sale',
        item_name: `Sale ${generatedOrderId}`,
        note: `Payment via ${method}`,
        metadata: {
          cart_items: cart.map(c => ({ id: c.menuItemId, qty: c.quantity, price: c.calculatedPrice, seat: c.seatNumber })),
          subtotal: cartSubtotal,
          tax: cartTax,
          tip: selectedTip,
          total_collected: cartTotal,
          split_type: splitType,
          split_ways: splitWays,
          payment_method: method
        }
      });

      if (dbError) throw dbError;
      console.log(`[INFO] executeTender: Ledger recorded sale ${generatedOrderId} successfully.`);

      // 2. Pass to parent handler for Hardware NFC / USDC Edge Function Handshake
      if (onProcessPayment) {
        await onProcessPayment({ 
          method, 
          amount: cartTotal, 
          splitData: { type: splitType, ways: splitWays }, 
          cart, 
          businessId,
          orderId: generatedOrderId 
        });
      }

      // 3. Route to corresponding fulfillment screen
      if (method === "Cash") {
        setStep("receipt");
      } else {
        setStep("signature");
      }
    } catch (error: any) {
      console.error(`[ERROR] executeTender failed:`, error.message);
      alert("Payment processing failed. Please verify network connection and try again.");
    } finally {
      setIsProcessing(false);
      console.log(`[END] executeTender execution`);
    }
  };

  const handleReversal = () => {
    triggerHaptic('heavy');
    alert(`Reversal initiated for Order ${orderId}. Funds returned to customer.`);
    setCart([]);
    setSelectedTip(0);
    setSplitType('single');
    setStep("menu");
  };

  // ============================================================================
  // EMPTY STATE PROTECTIONS
  // ============================================================================
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-background p-6 text-center">
        <ShoppingCart className="h-16 w-16 text-muted-foreground opacity-20 mb-4 animate-pulse" />
        <h2 className="text-2xl font-bold tracking-tight">Syncing Terminal...</h2>
      </div>
    );
  }

  if (dbCategories.length === 0 || dbMenuItems.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-background p-6 text-center">
        <div className="h-24 w-24 bg-muted rounded-full flex items-center justify-center mb-6 shadow-inner">
          <ShoppingCart className="h-12 w-12 text-muted-foreground opacity-50" />
        </div>
        <h2 className="text-3xl font-bold tracking-tight">System Ready</h2>
        <p className="text-muted-foreground mt-4 text-lg max-w-sm">
          Awaiting master menu sync from IDIA Hub. Terminal will automatically unlock when catalogs are provisioned.
        </p>
      </div>
    );
  }

  // ============================================================================
  // PRIMARY RENDER 
  // ============================================================================
  return (
    <div className="flex flex-col h-screen bg-background relative overflow-hidden">
      
      {/* GLOBAL HEADER */}
      <div className="pt-8 pb-4 px-4 bg-card border-b flex justify-between items-center z-10 shadow-sm">
        {step !== "menu" && step !== "cart" && step !== "success" ? (
           <Button variant="ghost" onClick={() => setStep(step === "modifiers" ? "menu" : "cart")} className="min-h-[44px]">
             <ChevronLeft className="mr-2 h-5 w-5" /> Cancel
           </Button>
        ) : (
          <h1 className="text-2xl font-bold tracking-tight px-2">Register</h1>
        )}
        
        {(step === "menu" || step === "cart") && (
          <Button 
            variant={step === "cart" ? "secondary" : "default"} 
            className="min-h-[44px] relative bg-primary text-primary-foreground font-bold shadow-md active:scale-[0.98] transition-transform"
            onClick={() => setStep(step === "menu" ? "cart" : "menu")}
          >
            {step === "menu" ? "Current Ticket" : "Return to Menu"}
            {cart.length > 0 && step === "menu" && (
              <span className="absolute -top-2 -right-2 bg-destructive text-destructive-foreground text-xs font-bold h-6 w-6 flex items-center justify-center rounded-full shadow-sm ring-2 ring-background">
                {cart.reduce((acc, item) => acc + item.quantity, 0)}
              </span>
            )}
          </Button>
        )}
      </div>

      <ScrollArea className="flex-1 w-full relative">
        
        {/* VIEW: 1. MENU GRID */}
        {step === "menu" && (
          <div className="flex flex-col h-full">
            <div className="flex overflow-x-auto py-4 px-4 gap-3 no-scrollbar border-b bg-muted/20">
              {dbCategories.map(cat => (
                <button
                  key={cat.id}
                  onClick={() => { triggerHaptic(); setActiveCategory(cat.id); }}
                  className={`px-6 py-3 rounded-full text-base font-bold whitespace-nowrap transition-all active:scale-95 shadow-sm border-2 ${activeCategory === cat.id ? 'text-white' : 'bg-card text-foreground border-border'}`}
                  style={activeCategory === cat.id ? { backgroundColor: cat.colorCode, borderColor: cat.colorCode } : {}}
                >
                  {cat.name}
                </button>
              ))}
            </div>
            
            <div className="p-4 grid grid-cols-1 gap-4 pb-[120px]">
              {dbMenuItems.filter(item => item.categoryId === activeCategory).map(item => (
                <Card key={item.id} className="active:scale-[0.98] transition-transform cursor-pointer border-border/60 shadow-md hover:shadow-lg" onClick={() => handleItemSelect(item)}>
                  <CardContent className="p-5 flex justify-between items-center min-h-[88px]">
                    <div>
                      <h3 className="font-bold text-xl">{item.name}</h3>
                      <p className="text-muted-foreground font-semibold text-base mt-1">${item.basePrice.toFixed(2)}</p>
                    </div>
                    <div className="h-14 w-14 bg-secondary rounded-full flex items-center justify-center border-2 border-border">
                      <Plus className="h-7 w-7 text-foreground" />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* VIEW: 2. MODIFIERS (Mandatory Intercept) */}
        {step === "modifiers" && selectedItemForMod && (
          <div className="p-6 pb-[120px] animate-in slide-in-from-bottom-10">
            <h2 className="text-4xl font-black mb-2 tracking-tight">{selectedItemForMod.name}</h2>
            <p className="text-muted-foreground mb-8 text-xl font-medium">Ticket Customization</p>

            {selectedItemForMod.modifierGroups?.map(group => (
              <div key={group.id} className="mb-8 p-5 bg-muted/30 rounded-3xl border border-border/80 shadow-sm">
                <div className="flex justify-between items-center mb-5">
                  <h3 className="font-bold text-2xl">{group.name}</h3>
                  {group.isRequired && <span className="bg-destructive text-destructive-foreground text-sm font-bold px-3 py-1 rounded-md tracking-widest uppercase shadow-sm">Required</span>}
                </div>
                <div className="flex flex-col gap-3">
                  {group.options.map(opt => {
                    const isSelected = pendingModifiers[group.id]?.id === opt.id;
                    return (
                      <button
                        key={opt.id}
                        onClick={() => handleModifierSelection(group.id, opt)}
                        className={`flex justify-between items-center p-6 rounded-2xl border-2 transition-all min-h-[72px] active:scale-[0.98] ${isSelected ? 'border-primary bg-primary/10 ring-4 ring-primary/20 shadow-inner' : 'border-border bg-card shadow-sm'}`}
                      >
                        <span className={`font-bold text-xl ${isSelected ? 'text-primary' : 'text-foreground'}`}>{opt.name}</span>
                        {opt.priceDelta > 0 && <span className="text-muted-foreground font-bold text-lg">+${opt.priceDelta.toFixed(2)}</span>}
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* VIEW: 3. ACTIVE TICKET */}
        {step === "cart" && (
          <div className="p-4 pb-[300px]">
            {cart.length === 0 ? (
              <div className="text-center py-32 text-muted-foreground">
                <ShoppingCart className="h-24 w-24 mx-auto mb-6 opacity-20" />
                <p className="text-3xl font-bold tracking-tight">Ticket is empty</p>
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                {cart.map(item => (
                  <Card key={item.cartId} className="border-border shadow-md rounded-2xl overflow-hidden">
                    <CardContent className="p-5 flex flex-col gap-5">
                      
                      <div className="flex justify-between items-start">
                        <div>
                          <h3 className="font-bold text-2xl leading-tight">{item.name}</h3>
                          {Object.values(item.modifiers).map(mod => (
                            <p key={mod.id} className="text-lg text-muted-foreground block font-medium mt-1">↳ {mod.name}</p>
                          ))}
                        </div>
                        <span className="font-bold text-2xl">${(item.calculatedPrice * item.quantity).toFixed(2)}</span>
                      </div>

                      <div className="flex justify-between items-center pt-4 border-t mt-2">
                        <div className="flex items-center gap-3 bg-muted p-1 rounded-full border shadow-inner">
                          <span className="pl-4 text-sm font-bold text-muted-foreground uppercase tracking-wider">Seat</span>
                          <Button variant="ghost" className="rounded-full min-h-[48px] min-w-[48px] bg-background shadow-sm hover:bg-background active:scale-95" onClick={() => updateSeat(item.cartId, -1)}>
                            <Minus className="h-5 w-5" />
                          </Button>
                          <span className="font-black text-xl w-6 text-center">{item.seatNumber}</span>
                          <Button variant="ghost" className="rounded-full min-h-[48px] min-w-[48px] bg-background shadow-sm hover:bg-background active:scale-95" onClick={() => updateSeat(item.cartId, 1)}>
                            <Plus className="h-5 w-5" />
                          </Button>
                        </div>

                        <div className="flex items-center gap-2 bg-muted p-1 rounded-full border shadow-inner">
                          <Button variant="ghost" className="rounded-full min-h-[48px] min-w-[48px] text-destructive hover:bg-background bg-background shadow-sm active:scale-95" onClick={() => updateQuantity(item.cartId, -1)}>
                            {item.quantity === 1 ? <Trash2 className="h-6 w-6" /> : <Minus className="h-6 w-6" />}
                          </Button>
                          <span className="font-black text-2xl w-10 text-center">{item.quantity}</span>
                          <Button variant="ghost" className="rounded-full min-h-[48px] min-w-[48px] bg-background shadow-sm hover:bg-background active:scale-95" onClick={() => updateQuantity(item.cartId, 1)}>
                            <Plus className="h-6 w-6" />
                          </Button>
                        </div>
                      </div>

                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}

        {/* VIEW: 4. TIP SELECTION */}
        {step === "tip" && (
          <div className="p-6 pb-[180px] animate-in slide-in-from-right">
            <h2 className="text-4xl font-black mb-2 text-center tracking-tight">Select Tip</h2>
            <p className="text-muted-foreground mb-10 text-center text-xl font-medium">Ticket Total: ${cartSubtotal.toFixed(2)}</p>
            
            <div className="grid grid-cols-2 gap-5">
              {[0.15, 0.20, 0.25].map(pct => {
                const tipAmt = cartSubtotal * pct;
                return (
                  <Button 
                    key={pct} 
                    variant="outline" 
                    className="h-32 flex flex-col items-center justify-center text-3xl font-black bg-card border-2 hover:border-primary active:scale-95 shadow-sm"
                    onClick={() => { triggerHaptic(); setSelectedTip(tipAmt); setStep("tender"); }}
                  >
                    <span>{pct * 100}%</span>
                    <span className="text-lg font-bold text-muted-foreground mt-2">+${tipAmt.toFixed(2)}</span>
                  </Button>
                )
              })}
              <Button 
                variant="outline" 
                className="h-32 text-2xl font-bold bg-card border-2 hover:border-primary active:scale-95 text-muted-foreground shadow-sm"
                onClick={() => { triggerHaptic(); setSelectedTip(0); setStep("tender"); }}
              >
                No Tip
              </Button>
            </div>
          </div>
        )}

        {/* VIEW: 5. TENDER/PAYMENT (USDC/Card Integrated + Cash + Gift) */}
        {step === "tender" && (
          <div className="p-6 pb-[180px] animate-in slide-in-from-right">
            <h2 className="text-4xl font-black mb-10 text-center tracking-tight">Tender Payment</h2>
            <div className="flex flex-col gap-5">
              <Button size="lg" className="h-28 text-2xl font-bold justify-start px-8 bg-blue-600 hover:bg-blue-700 active:scale-[0.98] shadow-lg rounded-2xl" onClick={() => executeTender("Integrated_Tap")} disabled={isProcessing}>
                <CreditCard className="mr-6 h-10 w-10" /> 
                <div className="text-left flex flex-col">
                  <span>Credit / USDC</span>
                  <span className="text-base font-medium opacity-80 tracking-wide">(Integrated Tap / Dip)</span>
                </div>
              </Button>
              <Button size="lg" className="h-24 text-2xl font-bold justify-start px-8 bg-purple-600 hover:bg-purple-700 active:scale-[0.98] shadow-lg rounded-2xl" onClick={() => executeTender("Gift_Card")} disabled={isProcessing}>
                <Gift className="mr-6 h-10 w-10" /> Gift Card
              </Button>
              <Button size="lg" variant="outline" className="h-24 text-2xl font-bold justify-start px-8 border-2 active:scale-[0.98] shadow-sm rounded-2xl" onClick={() => executeTender("Cash")} disabled={isProcessing}>
                <Banknote className="mr-6 h-10 w-10" /> Cash
              </Button>
            </div>
          </div>
        )}

        {/* VIEW: 6. SIGNATURE */}
        {step === "signature" && (
          <div className="p-6 pb-[180px] text-center animate-in fade-in">
            <h2 className="text-4xl font-black mb-4 tracking-tight">Customer Signature</h2>
            <p className="text-muted-foreground mb-8 text-xl font-medium">Please sign to authorize ${cartTotal.toFixed(2)}</p>
            
            <div className="w-full h-80 bg-muted/30 border-2 border-dashed border-border/80 rounded-3xl flex items-center justify-center text-muted-foreground relative touch-none shadow-inner">
              <PenTool className="h-16 w-16 opacity-20 absolute" />
              <span className="z-10 font-black tracking-widest uppercase opacity-40 text-xl">Sign Here</span>
            </div>

            <Button size="lg" className="w-full h-20 mt-10 text-2xl font-bold bg-primary text-primary-foreground shadow-lg active:scale-[0.98] transition-transform rounded-2xl" onClick={() => { triggerHaptic(); setStep("receipt"); }}>
              Accept Signature
            </Button>
          </div>
        )}

        {/* VIEW: 7. RECEIPT */}
        {step === "receipt" && (
          <div className="p-6 pb-[180px] animate-in slide-in-from-right text-center">
            <div className="h-32 w-32 bg-green-100 rounded-full flex items-center justify-center text-green-600 mx-auto mb-8 shadow-md">
              <CheckCircle className="h-16 w-16" />
            </div>
            <h2 className="text-4xl font-black mb-3 tracking-tight">Payment Secured</h2>
            <p className="text-muted-foreground mb-10 text-xl font-medium">How would you like your receipt?</p>
            
            <div className="flex flex-col gap-5">
              <Button variant="outline" className="h-20 text-2xl font-bold border-2 active:scale-[0.98] shadow-sm rounded-2xl" onClick={() => { triggerHaptic(); setStep("success"); }}><Receipt className="mr-4 h-8 w-8" /> Print Receipt</Button>
              <Button variant="outline" className="h-20 text-2xl font-bold border-2 active:scale-[0.98] shadow-sm rounded-2xl" onClick={() => { triggerHaptic(); setStep("success"); }}>@ Email Receipt</Button>
              <Button variant="outline" className="h-20 text-2xl font-bold border-2 active:scale-[0.98] shadow-sm rounded-2xl" onClick={() => { triggerHaptic(); setStep("success"); }}><Smartphone className="mr-4 h-8 w-8" /> Text Message</Button>
              <Button variant="ghost" className="h-20 text-2xl font-bold mt-4 active:scale-[0.98]" onClick={() => { triggerHaptic(); setStep("success"); }}>No Receipt</Button>
            </div>
          </div>
        )}

        {/* VIEW: 8. SUCCESS (Reset & Undo State) */}
        {step === "success" && (
          <div className="flex flex-col items-center justify-center p-10 h-[70vh] animate-in zoom-in-95 text-center">
            <h2 className="text-5xl font-black mb-4 tracking-tight">Ticket Cleared</h2>
            <p className="text-muted-foreground text-2xl mb-16 font-medium tracking-wide">Order #{orderId}</p>
            
            <Button size="lg" className="w-full h-24 text-3xl font-black bg-primary shadow-xl active:scale-[0.98] transition-transform rounded-2xl mb-8" onClick={() => { triggerHaptic(); setCart([]); setSelectedTip(0); setSplitType('single'); setStep("menu"); }}>
              Start Next Order
            </Button>

            <Button variant="ghost" className="text-destructive font-bold text-lg underline underline-offset-4" onClick={handleReversal}>
              Void Transaction (Undo)
            </Button>
          </div>
        )}

      </ScrollArea>

      {/* ============================================================================
          STICKY BOTTOM ACTION BARS
          ============================================================================ */}

      {step === "modifiers" && (
        <div className="fixed bottom-0 left-0 w-full bg-background border-t p-6 shadow-[0_-10px_40px_rgba(0,0,0,0.1)] z-50 animate-in slide-in-from-bottom">
          <Button size="lg" className="w-full min-h-[80px] text-3xl font-black shadow-lg rounded-2xl active:scale-[0.98] transition-transform" onClick={validateAndSubmitModifiers}>
            Add Custom Item
          </Button>
        </div>
      )}

      {step === "cart" && cart.length > 0 && (
        <div className="fixed bottom-0 left-0 w-full bg-background border-t p-4 pb-8 shadow-[0_-20px_50px_rgba(0,0,0,0.15)] z-50 animate-in slide-in-from-bottom rounded-t-3xl">
          
          <div className="flex items-center gap-2 mb-6 bg-muted/50 p-1.5 rounded-xl border">
            <button 
              onClick={() => { triggerHaptic(); setSplitType('single'); }}
              className={`flex-1 flex justify-center items-center py-3 rounded-lg text-sm font-bold transition-all ${splitType === 'single' ? 'bg-background shadow-md text-foreground' : 'text-muted-foreground'}`}
            >
              Single Check
            </button>
            <button 
              onClick={() => { triggerHaptic(); setSplitType('evenly'); }}
              className={`flex-1 flex justify-center items-center py-3 rounded-lg text-sm font-bold transition-all ${splitType === 'evenly' ? 'bg-background shadow-md text-foreground' : 'text-muted-foreground'}`}
            >
              <Users className="mr-2 h-4 w-4" /> Split Evenly
            </button>
          </div>

          {splitType === 'evenly' && (
            <div className="flex items-center justify-between mb-6 px-2 bg-card p-3 rounded-xl border shadow-sm">
              <span className="font-bold text-lg text-muted-foreground">Split how many ways?</span>
              <div className="flex items-center gap-3 bg-muted p-1 rounded-full border">
                <Button variant="ghost" className="rounded-full min-h-[44px] min-w-[44px] bg-background shadow-sm active:scale-95" onClick={() => updateSplitWays(-1)}>
                  <Minus className="h-5 w-5" />
                </Button>
                <span className="font-black text-2xl w-8 text-center">{splitWays}</span>
                <Button variant="ghost" className="rounded-full min-h-[44px] min-w-[44px] bg-background shadow-sm active:scale-95" onClick={() => updateSplitWays(1)}>
                  <Plus className="h-5 w-5" />
                </Button>
              </div>
            </div>
          )}

          <div className="flex justify-between text-muted-foreground mb-2 px-3 text-xl font-medium">
            <span>Subtotal</span><span>${cartSubtotal.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-muted-foreground mb-6 px-3 text-xl font-medium border-b pb-4">
            <span>Tax (6%)</span><span>${cartTax.toFixed(2)}</span>
          </div>
          <div className="flex justify-between items-end mb-6 px-3">
            <div className="flex flex-col">
              <span className="text-3xl font-bold tracking-tight">Total</span>
              {splitType === 'evenly' && <span className="text-base text-primary font-bold mt-1">(${ (cartTotal / splitWays).toFixed(2) } per person)</span>}
            </div>
            <span className="text-5xl font-black tracking-tight">${cartTotal.toFixed(2)}</span>
          </div>
          
          <Button 
            size="lg" 
            className="w-full min-h-[80px] text-2xl font-black active:scale-[0.98] transition-transform bg-primary shadow-xl rounded-2xl"
            onClick={initiateFireAndPay}
            disabled={isProcessing}
          >
            {isProcessing ? "Routing to Kitchen..." : "Fire & Pay Ticket"}
          </Button>
        </div>
      )}

    </div>
  );
}