/** * NANO-BITE ID: hosp.ft.sales.mobile_pos
 * NANO-BITE NAME: Mobile-POS sale
 * ROLE: Daily
 * INDUSTRY: tertiary.hospitality.food_truck 
 */

import React, { useState, useCallback, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Plus, Minus, Trash2, ShoppingCart, CheckCircle, ChevronLeft, CreditCard, Banknote, Smartphone, Receipt, PenTool, Gift } from "lucide-react";

// ============================================================================
// STRICT DATA SCHEMAS (Supplied by IDIA Hub via Props)
// ============================================================================
export interface MenuCategory { id: string; name: string; colorCode: string; }
export interface ModifierOption { id: string; name: string; priceDelta: number; }
export interface ModifierGroup { id: string; name: string; isRequired: boolean; options: ModifierOption[]; }
export interface MenuItem { id: string; categoryId: string; name: string; basePrice: number; modifierGroups?: ModifierGroup[]; }
export interface CartItem { cartId: string; menuItemId: string; name: string; basePrice: number; quantity: number; seatNumber: number; modifiers: Record<string, ModifierOption>; calculatedPrice: number; }

export interface MobilePosSaleProps {
  businessId?: string;
  categories: MenuCategory[];
  menuItems: MenuItem[];
  onFireToKds?: (cart: CartItem[]) => Promise<any>;
  onProcessPayment?: (payload: any) => Promise<any>;
}

export default function MobilePosSale({ 
  businessId = "default", 
  categories = [], 
  menuItems = [],
  onFireToKds,
  onProcessPayment
}: MobilePosSaleProps) {

  // --- STRICT STATE MACHINE ---
  type PosStep = "menu" | "modifiers" | "cart" | "tip" | "tender" | "signature" | "receipt" | "success";
  
  const [step, setStep] = useState<PosStep>("menu");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  
  // Transient Workflows
  const [selectedItemForMod, setSelectedItemForMod] = useState<MenuItem | null>(null);
  const [pendingModifiers, setPendingModifiers] = useState<Record<string, ModifierOption>>({});
  const [selectedTip, setSelectedTip] = useState<number>(0);
  const [paymentMethod, setPaymentMethod] = useState<"Integrated_Tap" | "Gift_Card" | "Cash" | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [orderId, setOrderId] = useState<string | null>(null);

  useEffect(() => {
    if (categories.length > 0 && !activeCategory) {
      setActiveCategory(categories[0].id);
    }
  }, [categories, activeCategory]);

  const triggerHaptic = useCallback((type: 'light' | 'heavy' = 'light') => {
    try {
      if (typeof window !== 'undefined' && window.navigator && window.navigator.vibrate) {
        window.navigator.vibrate(type === 'heavy' ? [50, 50, 50] : 50);
      }
    } catch (e) { /* Hardware agnostic fallback */ }
  }, []);

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
        seatNumber: 1, // Default Seat 1 assignment
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
    console.log(`[BEGIN] handleModifierSelection execution: Group ${groupId}, Option ${option.id}`);
    triggerHaptic();
    setPendingModifiers(prev => ({ ...prev, [groupId]: option }));
    console.log(`[END] handleModifierSelection execution`);
  };

  const validateAndSubmitModifiers = () => {
    console.log(`[BEGIN] validateAndSubmitModifiers execution`);
    if (!selectedItemForMod) return;

    const missingRequired = selectedItemForMod.modifierGroups?.find(
      g => g.isRequired && !pendingModifiers[g.id]
    );

    if (missingRequired) {
      console.warn(`[WARN] validateAndSubmitModifiers: Blocked. Missing required modifier: ${missingRequired.name}`);
      triggerHaptic('heavy');
      alert(`Selection Required: Please choose an option for ${missingRequired.name}`);
      return;
    }

    executeAddToCart(selectedItemForMod, pendingModifiers);
    console.log(`[END] validateAndSubmitModifiers execution`);
  };

  // ============================================================================
  // WORKFLOW: CART & SEAT HANDLING
  // ============================================================================
  const updateQuantity = useCallback((cartId: string, delta: number) => {
    console.log(`[BEGIN] updateQuantity cartId: ${cartId}, delta: ${delta}`);
    triggerHaptic();
    setCart(prev => prev.map(item => {
      if (item.cartId === cartId) return { ...item, quantity: Math.max(0, item.quantity + delta) };
      return item;
    }).filter(item => item.quantity > 0)); 
    console.log(`[END] updateQuantity`);
  }, [triggerHaptic]);

  const updateSeat = useCallback((cartId: string, delta: number) => {
    console.log(`[BEGIN] updateSeat cartId: ${cartId}, delta: ${delta}`);
    triggerHaptic();
    setCart(prev => prev.map(item => {
      if (item.cartId === cartId) {
        const newSeat = Math.max(1, item.seatNumber + delta);
        return { ...item, seatNumber: newSeat };
      }
      return item;
    }));
    console.log(`[END] updateSeat`);
  }, [triggerHaptic]);

  // ============================================================================
  // WORKFLOW: FIRE TO KDS, TENDER & SIGNATURE
  // ============================================================================
  const cartSubtotal = cart.reduce((sum, item) => sum + (item.calculatedPrice * item.quantity), 0);
  const cartTax = cartSubtotal * 0.06; // Standard 6% ledger assumption
  const cartTotal = cartSubtotal + cartTax + selectedTip;

  const initiateFireAndPay = async () => {
    console.log(`[BEGIN] initiateFireAndPay execution`);
    try {
      setIsProcessing(true);
      triggerHaptic();
      if (onFireToKds) {
        console.log(`[INFO] initiateFireAndPay: Transmitting live ticket to KDS...`);
        await onFireToKds(cart);
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
      if (onProcessPayment) {
        const result = await onProcessPayment({ method, amount: cartTotal, cart, businessId });
        setOrderId(result?.orderId || `ORD-${Date.now().toString().slice(-6)}`);
      } else {
        setOrderId(`ORD-${Date.now().toString().slice(-6)}`);
      }

      if (method === "Cash") {
        setStep("receipt");
      } else {
        setStep("signature");
      }
    } catch (error) {
      console.error(`[ERROR] executeTender failed:`, error);
    } finally {
      setIsProcessing(false);
      console.log(`[END] executeTender execution`);
    }
  };

  // ============================================================================
  // EMPTY STATE PROTECTIONS
  // ============================================================================
  if (!categories || categories.length === 0 || !menuItems || menuItems.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-background p-6 text-center">
        <ShoppingCart className="h-16 w-16 text-muted-foreground opacity-20 mb-4" />
        <h2 className="text-2xl font-bold tracking-tight">No Catalog Data</h2>
        <p className="text-muted-foreground mt-2 text-lg">Awaiting sync from IDIA Hub.<br/>Please provision menu categories to proceed.</p>
      </div>
    );
  }

  // ============================================================================
  // PRIMARY RENDER 
  // ============================================================================
  return (
    <div className="flex flex-col h-screen bg-background relative overflow-hidden">
      
      {/* GLOBAL HEADER */}
      <div className="pt-8 pb-4 px-4 bg-card border-b flex justify-between items-center z-10">
        {step !== "menu" && step !== "cart" ? (
           <Button variant="ghost" onClick={() => setStep(step === "modifiers" ? "menu" : "cart")} className="min-h-[44px]">
             <ChevronLeft className="mr-2 h-5 w-5" /> Cancel
           </Button>
        ) : (
          <h1 className="text-2xl font-bold tracking-tight px-2">Register</h1>
        )}
        {(step === "menu" || step === "cart") && (
          <Button 
            variant={step === "cart" ? "secondary" : "default"} 
            className="min-h-[44px] relative bg-primary text-primary-foreground font-bold"
            onClick={() => setStep(step === "menu" ? "cart" : "menu")}
          >
            {step === "menu" ? "Current Ticket" : "Return to Menu"}
            {cart.length > 0 && step === "menu" && (
              <span className="absolute -top-2 -right-2 bg-destructive text-destructive-foreground text-xs font-bold h-6 w-6 flex items-center justify-center rounded-full shadow-sm">
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
              {categories.map(cat => (
                <button
                  key={cat.id}
                  onClick={() => { triggerHaptic(); setActiveCategory(cat.id); }}
                  className={`px-6 py-3 rounded-full text-sm font-bold whitespace-nowrap transition-all active:scale-95 ${activeCategory === cat.id ? 'text-white shadow-md' : 'bg-secondary text-secondary-foreground border'}`}
                  style={activeCategory === cat.id ? { backgroundColor: cat.colorCode, borderColor: cat.colorCode } : {}}
                >
                  {cat.name}
                </button>
              ))}
            </div>
            
            <div className="p-4 grid grid-cols-1 gap-4 pb-[120px]">
              {menuItems.filter(item => item.categoryId === activeCategory).map(item => (
                <Card key={item.id} className="active:scale-[0.98] transition-transform cursor-pointer border-border/60 shadow-sm" onClick={() => handleItemSelect(item)}>
                  <CardContent className="p-5 flex justify-between items-center min-h-[80px]">
                    <div>
                      <h3 className="font-bold text-lg">{item.name}</h3>
                      <p className="text-muted-foreground font-medium">${item.basePrice.toFixed(2)}</p>
                    </div>
                    <div className="h-12 w-12 bg-secondary rounded-full flex items-center justify-center border">
                      <Plus className="h-6 w-6 text-foreground" />
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
            <h2 className="text-3xl font-bold mb-1 tracking-tight">{selectedItemForMod.name}</h2>
            <p className="text-muted-foreground mb-8 text-lg">Ticket Customization</p>

            {selectedItemForMod.modifierGroups?.map(group => (
              <div key={group.id} className="mb-8 p-4 bg-muted/30 rounded-2xl border">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="font-bold text-xl">{group.name}</h3>
                  {group.isRequired && <span className="bg-destructive text-destructive-foreground text-xs font-bold px-3 py-1 rounded-sm tracking-widest uppercase">Required</span>}
                </div>
                <div className="flex flex-col gap-3">
                  {group.options.map(opt => {
                    const isSelected = pendingModifiers[group.id]?.id === opt.id;
                    return (
                      <button
                        key={opt.id}
                        onClick={() => handleModifierSelection(group.id, opt)}
                        className={`flex justify-between items-center p-5 rounded-xl border-2 transition-all min-h-[64px] active:scale-[0.98] ${isSelected ? 'border-primary bg-primary/10 ring-4 ring-primary/20' : 'border-border bg-card'}`}
                      >
                        <span className={`font-bold text-lg ${isSelected ? 'text-primary' : 'text-foreground'}`}>{opt.name}</span>
                        {opt.priceDelta > 0 && <span className="text-muted-foreground font-bold">+${opt.priceDelta.toFixed(2)}</span>}
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* VIEW: 3. ACTIVE TICKET (Cart & Seat Splitting) */}
        {step === "cart" && (
          <div className="p-4 pb-[220px]">
            {cart.length === 0 ? (
              <div className="text-center py-32 text-muted-foreground">
                <ShoppingCart className="h-20 w-20 mx-auto mb-6 opacity-20" />
                <p className="text-2xl font-bold">Ticket is empty</p>
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                {cart.map(item => (
                  <Card key={item.cartId} className="border-border shadow-sm">
                    <CardContent className="p-4 flex flex-col gap-4">
                      
                      <div className="flex justify-between items-start">
                        <div>
                          <h3 className="font-bold text-xl leading-tight">{item.name}</h3>
                          {Object.values(item.modifiers).map(mod => (
                            <p key={mod.id} className="text-base text-muted-foreground block font-medium mt-1">↳ {mod.name}</p>
                          ))}
                        </div>
                        <span className="font-bold text-2xl">${(item.calculatedPrice * item.quantity).toFixed(2)}</span>
                      </div>

                      <div className="flex justify-between items-center pt-4 border-t mt-2">
                        {/* Seat Stepper Control */}
                        <div className="flex items-center gap-3 bg-muted p-1 rounded-full border">
                          <span className="pl-3 text-sm font-bold text-muted-foreground uppercase tracking-wider">Seat</span>
                          <Button variant="ghost" className="rounded-full min-h-[44px] min-w-[44px] bg-background shadow-sm hover:bg-background" onClick={() => updateSeat(item.cartId, -1)}>
                            <Minus className="h-4 w-4" />
                          </Button>
                          <span className="font-bold text-lg w-4 text-center">{item.seatNumber}</span>
                          <Button variant="ghost" className="rounded-full min-h-[44px] min-w-[44px] bg-background shadow-sm hover:bg-background" onClick={() => updateSeat(item.cartId, 1)}>
                            <Plus className="h-4 w-4" />
                          </Button>
                        </div>

                        {/* Quantity Stepper */}
                        <div className="flex items-center gap-2 bg-muted p-1 rounded-full border">
                          <Button variant="ghost" className="rounded-full min-h-[44px] min-w-[44px] text-destructive hover:bg-background bg-background shadow-sm" onClick={() => updateQuantity(item.cartId, -1)}>
                            {item.quantity === 1 ? <Trash2 className="h-5 w-5" /> : <Minus className="h-5 w-5" />}
                          </Button>
                          <span className="font-bold text-xl w-8 text-center">{item.quantity}</span>
                          <Button variant="ghost" className="rounded-full min-h-[44px] min-w-[44px] bg-background shadow-sm hover:bg-background" onClick={() => updateQuantity(item.cartId, 1)}>
                            <Plus className="h-5 w-5" />
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
            <h2 className="text-3xl font-bold mb-2 text-center tracking-tight">Select Tip</h2>
            <p className="text-muted-foreground mb-8 text-center text-lg">Ticket Total: ${cartSubtotal.toFixed(2)}</p>
            
            <div className="grid grid-cols-2 gap-4">
              {[0.15, 0.20, 0.25].map(pct => {
                const tipAmt = cartSubtotal * pct;
                return (
                  <Button 
                    key={pct} 
                    variant="outline" 
                    className="h-28 flex flex-col items-center justify-center text-2xl font-bold bg-card border-2 hover:border-primary active:scale-95"
                    onClick={() => { triggerHaptic(); setSelectedTip(tipAmt); setStep("tender"); }}
                  >
                    <span>{pct * 100}%</span>
                    <span className="text-base font-bold text-muted-foreground mt-1">+${tipAmt.toFixed(2)}</span>
                  </Button>
                )
              })}
              <Button 
                variant="outline" 
                className="h-28 text-2xl font-bold bg-card border-2 hover:border-primary active:scale-95 text-muted-foreground"
                onClick={() => { triggerHaptic(); setSelectedTip(0); setStep("tender"); }}
              >
                No Tip
              </Button>
            </div>
          </div>
        )}

        {/* VIEW: 5. TENDER/PAYMENT (USDC/Card Integrated) */}
        {step === "tender" && (
          <div className="p-6 pb-[180px] animate-in slide-in-from-right">
            <h2 className="text-3xl font-bold mb-8 text-center tracking-tight">Payment Method</h2>
            <div className="flex flex-col gap-4">
              <Button size="lg" className="h-24 text-xl font-bold justify-start px-6 bg-blue-600 hover:bg-blue-700 active:scale-[0.98] shadow-md" onClick={() => executeTender("Integrated_Tap")} disabled={isProcessing}>
                <CreditCard className="mr-4 h-8 w-8" /> 
                <div className="text-left flex flex-col">
                  <span>Card / USDC</span>
                  <span className="text-sm font-medium opacity-80">(Dip or Tap Terminal)</span>
                </div>
              </Button>
              <Button size="lg" className="h-20 text-xl font-bold justify-start px-6 bg-purple-600 hover:bg-purple-700 active:scale-[0.98] shadow-md" onClick={() => executeTender("Gift_Card")} disabled={isProcessing}>
                <Gift className="mr-4 h-8 w-8" /> Gift Card
              </Button>
              <Button size="lg" variant="outline" className="h-20 text-xl font-bold justify-start px-6 border-2 active:scale-[0.98]" onClick={() => executeTender("Cash")} disabled={isProcessing}>
                <Banknote className="mr-4 h-8 w-8" /> Cash
              </Button>
            </div>
          </div>
        )}

        {/* VIEW: 6. SIGNATURE */}
        {step === "signature" && (
          <div className="p-6 pb-[180px] text-center animate-in fade-in">
            <h2 className="text-3xl font-bold mb-2 tracking-tight">Authorize Payment</h2>
            <p className="text-muted-foreground mb-6 text-lg">Please sign to complete transaction.</p>
            
            <div className="w-full h-72 bg-muted/30 border-2 border-dashed border-border/80 rounded-3xl flex items-center justify-center text-muted-foreground relative touch-none">
              <PenTool className="h-12 w-12 opacity-20 absolute" />
              <span className="z-10 font-bold tracking-widest uppercase opacity-40">Signature Area</span>
            </div>

            <Button size="lg" className="w-full h-16 mt-8 text-xl font-bold bg-primary text-primary-foreground" onClick={() => { triggerHaptic(); setStep("receipt"); }}>
              Accept Signature
            </Button>
          </div>
        )}

        {/* VIEW: 7. RECEIPT */}
        {step === "receipt" && (
          <div className="p-6 pb-[180px] animate-in slide-in-from-right text-center">
            <div className="h-24 w-24 bg-green-100 rounded-full flex items-center justify-center text-green-600 mx-auto mb-6 shadow-sm">
              <CheckCircle className="h-12 w-12" />
            </div>
            <h2 className="text-3xl font-bold mb-2 tracking-tight">Approved</h2>
            <p className="text-muted-foreground mb-8 text-lg">How would you like your receipt?</p>
            
            <div className="flex flex-col gap-4">
              <Button variant="outline" className="h-16 text-xl font-bold border-2 active:scale-[0.98]" onClick={() => { triggerHaptic(); setStep("success"); }}><Receipt className="mr-3 h-6 w-6" /> Print Receipt</Button>
              <Button variant="outline" className="h-16 text-xl font-bold border-2 active:scale-[0.98]" onClick={() => { triggerHaptic(); setStep("success"); }}>@ Email Receipt</Button>
              <Button variant="outline" className="h-16 text-xl font-bold border-2 active:scale-[0.98]" onClick={() => { triggerHaptic(); setStep("success"); }}><Smartphone className="mr-3 h-6 w-6" /> Text Message</Button>
              <Button variant="ghost" className="h-16 text-xl font-bold mt-4 active:scale-[0.98]" onClick={() => { triggerHaptic(); setStep("success"); }}>No Receipt</Button>
            </div>
          </div>
        )}

        {/* VIEW: 8. SUCCESS (Reset State) */}
        {step === "success" && (
          <div className="flex flex-col items-center justify-center p-10 h-[70vh] animate-in zoom-in-95 text-center">
            <h2 className="text-4xl font-black mb-2 tracking-tight">Order Complete</h2>
            <p className="text-muted-foreground text-xl mb-12">Ticket {orderId}</p>
            <Button size="lg" className="w-full h-20 text-2xl font-bold bg-primary shadow-lg" onClick={() => { triggerHaptic(); setCart([]); setSelectedTip(0); setStep("menu"); }}>
              Start Next Order
            </Button>
          </div>
        )}

      </ScrollArea>

      {/* ============================================================================
          STICKY BOTTOM ACTION BARS (Thumb-Zone Optimized per UI Laws)
          ============================================================================ */}

      {step === "modifiers" && (
        <div className="fixed bottom-0 left-0 w-full bg-background border-t p-4 pb-8 shadow-[0_-10px_40px_rgba(0,0,0,0.1)] z-50 animate-in slide-in-from-bottom">
          <Button size="lg" className="w-full min-h-[70px] text-2xl font-bold" onClick={validateAndSubmitModifiers}>
            Add Custom Item
          </Button>
        </div>
      )}

      {step === "cart" && cart.length > 0 && (
        <div className="fixed bottom-0 left-0 w-full bg-background border-t p-4 pb-8 shadow-[0_-10px_40px_rgba(0,0,0,0.1)] z-50 animate-in slide-in-from-bottom">
          <div className="flex justify-between text-muted-foreground mb-2 px-2 text-lg font-medium">
            <span>Subtotal</span><span>${cartSubtotal.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-muted-foreground mb-4 px-2 text-lg font-medium">
            <span>Tax (6%)</span><span>${cartTax.toFixed(2)}</span>
          </div>
          <div className="flex justify-between items-center mb-6 px-2">
            <span className="text-2xl font-bold tracking-tight">Total</span>
            <span className="text-4xl font-black tracking-tight">${cartTotal.toFixed(2)}</span>
          </div>
          
          <Button 
            size="lg" 
            className="w-full min-h-[72px] text-2xl font-bold active:scale-[0.98] transition-transform bg-primary shadow-lg"
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