/** * NANO-BITE ID: hosp.ft.sales.mobile_pos
 * NANO-BITE NAME: Mobile-POS sale
 * ROLE: Daily
 * INDUSTRY: tertiary.hospitality.food_truck 
 */

import React, { useState, useCallback } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Minus, Trash2, ShoppingCart, RotateCcw, CheckCircle } from "lucide-react";

// In production, this catalog is fetched dynamically based on businessId
const MENU_CATALOG = [
  { id: 'sku-101', name: 'Signature Smashburger', price: 12.50, category: 'Mains', hasModifiers: true },
  { id: 'sku-102', name: 'Truffle Fries', price: 6.00, category: 'Sides', hasModifiers: true },
  { id: 'sku-103', name: 'Artisan Cola', price: 3.50, category: 'Drinks', hasModifiers: false },
  { id: 'sku-104', name: 'Spicy Chicken Sandwich', price: 11.00, category: 'Mains', hasModifiers: false },
];

type Modifier = 'Small' | 'Regular' | 'Large' | 'None';

interface CartItem {
  cartId: string;
  sku: string;
  name: string;
  price: number;
  quantity: number;
  modifier: Modifier;
}

export default function MobilePosSale({ businessId }: { businessId?: string }) {
  const [activeTab, setActiveTab] = useState<"menu" | "cart">("menu");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [paymentRail, setPaymentRail] = useState<"Fiat" | "Platform Credits">("Fiat");
  const [isProcessing, setIsProcessing] = useState(false);
  const [checkoutComplete, setCheckoutComplete] = useState<{status: boolean, orderId: string | null}>({ status: false, orderId: null });

  // Safe haptic feedback wrapper
  const triggerHaptic = useCallback(() => {
    try {
      if (typeof window !== 'undefined' && window.navigator && window.navigator.vibrate) {
        window.navigator.vibrate(50);
      }
    } catch (e) {
      // Silently fail if hardware doesn't support it
    }
  }, []);

  const addToCart = useCallback((item: typeof MENU_CATALOG[0]) => {
    console.log(`[BEGIN] addToCart execution for sku: ${item.id}`);
    try {
      triggerHaptic();
      setCart(prev => {
        const defaultMod = item.hasModifiers ? 'Regular' : 'None';
        // Check if exact item + modifier combo exists
        const existingIdx = prev.findIndex(c => c.sku === item.id && c.modifier === defaultMod);
        
        if (existingIdx >= 0) {
          console.log(`[INFO] addToCart: Incrementing existing cart item ${prev[existingIdx].cartId}`);
          const newCart = [...prev];
          newCart[existingIdx].quantity += 1;
          return newCart;
        }

        const newCartItem: CartItem = {
          cartId: `cart-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          sku: item.id,
          name: item.name,
          price: item.price,
          quantity: 1,
          modifier: defaultMod
        };
        console.log(`[INFO] addToCart: Added new item to cart ${newCartItem.cartId}`);
        return [...prev, newCartItem];
      });
    } catch (error) {
      console.error(`[ERROR] addToCart failed:`, error);
    } finally {
      console.log(`[END] addToCart execution for sku: ${item.id}`);
    }
  }, [triggerHaptic]);

  const updateQuantity = useCallback((cartId: string, delta: number) => {
    console.log(`[BEGIN] updateQuantity execution for cartId: ${cartId}, delta: ${delta}`);
    try {
      triggerHaptic();
      setCart(prev => prev.map(item => {
        if (item.cartId === cartId) {
          const newQuantity = Math.max(0, item.quantity + delta);
          console.log(`[INFO] updateQuantity: Item ${cartId} quantity changing to ${newQuantity}`);
          return { ...item, quantity: newQuantity };
        }
        return item;
      }).filter(item => item.quantity > 0)); 
    } catch (error) {
      console.error(`[ERROR] updateQuantity failed:`, error);
    } finally {
      console.log(`[END] updateQuantity execution for cartId: ${cartId}`);
    }
  }, [triggerHaptic]);

  const setItemModifier = useCallback((cartId: string, mod: Modifier) => {
    console.log(`[BEGIN] setItemModifier execution for cartId: ${cartId}, modifier: ${mod}`);
    try {
      triggerHaptic();
      setCart(prev => prev.map(item => item.cartId === cartId ? { ...item, modifier: mod } : item));
    } catch (error) {
      console.error(`[ERROR] setItemModifier failed:`, error);
    } finally {
      console.log(`[END] setItemModifier execution for cartId: ${cartId}`);
    }
  }, [triggerHaptic]);

  const handleCheckout = async () => {
    console.log("[BEGIN] handleCheckout execution");
    setIsProcessing(true);
    
    try {
      console.log(`[INFO] handleCheckout: Processing ${cart.length} items on ${paymentRail} rail.`);
      if (cart.length === 0) throw new Error("Cart is empty.");
      
      // Simulate API Execution Delay
      await new Promise(resolve => setTimeout(resolve, 1200));
      
      const generatedOrderId = `ORD-${Math.floor(1000 + Math.random() * 9000)}`;
      console.log(`[INFO] handleCheckout: Transaction approved. Order ID: ${generatedOrderId}`);
      
      setCheckoutComplete({ status: true, orderId: generatedOrderId });
      setCart([]); // Clear cart post-success
      
    } catch (error) {
      console.error(`[ERROR] handleCheckout failed:`, error);
    } finally {
      setIsProcessing(false);
      console.log("[END] handleCheckout execution");
    }
  };

  const handleUndo = () => {
    console.log(`[BEGIN] handleUndo execution for Order ID: ${checkoutComplete.orderId}`);
    try {
      triggerHaptic();
      // In production, this fires a void/reversal API call to the ledger
      console.log(`[INFO] handleUndo: Reversal requested for ${checkoutComplete.orderId}`);
      setCheckoutComplete({ status: false, orderId: null });
      setActiveTab("menu");
    } catch (error) {
      console.error(`[ERROR] handleUndo failed:`, error);
    } finally {
      console.log(`[END] handleUndo execution`);
    }
  };

  const cartTotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  const cartItemCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  // --- RENDER: SUCCESS / UNDO STATE ---
  if (checkoutComplete.status) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-background px-6">
        <div className="flex flex-col items-center text-center gap-4 animate-in fade-in zoom-in duration-300">
          <div className="h-24 w-24 bg-green-100 rounded-full flex items-center justify-center text-green-600 mb-4">
            <CheckCircle className="h-12 w-12" />
          </div>
          <h2 className="text-3xl font-bold tracking-tight">Payment Secured</h2>
          <p className="text-muted-foreground text-lg">Order #{checkoutComplete.orderId} processed via {paymentRail}.</p>
          
          <div className="flex flex-col gap-4 w-full max-w-sm mt-8">
            <Button 
              size="lg" 
              className="w-full min-h-[60px] text-lg font-bold"
              onClick={() => setCheckoutComplete({ status: false, orderId: null })}
            >
              Start New Order
            </Button>
            
            {/* The Mandated Easy Reversal Button */}
            <Button 
              variant="outline" 
              size="lg" 
              className="w-full min-h-[60px] text-lg font-bold text-destructive border-destructive/30 hover:bg-destructive/10"
              onClick={handleUndo}
            >
              <RotateCcw className="mr-2 h-5 w-5" />
              Undo Transaction
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // --- RENDER: STANDARD POS STATE ---
  return (
    <div className="flex flex-col h-screen bg-background relative pb-[160px]">
      
      <div className="pt-8 pb-4 px-4 bg-card border-b sticky top-0 z-10">
        <Tabs value={activeTab} onValueChange={(val) => setActiveTab(val as "menu" | "cart")} className="w-full">
          <TabsList className="grid w-full grid-cols-2 min-h-[50px]">
            <TabsTrigger value="menu" className="min-h-[44px] text-base font-semibold">
              Menu Catalog
            </TabsTrigger>
            <TabsTrigger value="cart" className="min-h-[44px] text-base font-semibold relative">
              Active Cart
              {cartItemCount > 0 && (
                <span className="absolute top-2 right-4 bg-primary text-primary-foreground text-xs font-bold px-2 py-0.5 rounded-full">
                  {cartItemCount}
                </span>
              )}
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <ScrollArea className="flex-1 w-full px-4 pt-4">
        
        {/* MENU VIEW */}
        {activeTab === "menu" && (
          <div className="grid grid-cols-1 gap-4 pb-8">
            {MENU_CATALOG.map((item) => (
              <Card key={item.id} className="overflow-hidden active:scale-[0.98] transition-transform">
                <CardContent className="p-0 flex items-center justify-between min-h-[80px]">
                  <div className="p-4 flex-1">
                    <h3 className="font-semibold text-lg leading-tight">{item.name}</h3>
                    <p className="text-muted-foreground text-sm">${item.price.toFixed(2)}</p>
                  </div>
                  <Button 
                    className="h-full min-h-[80px] w-[80px] rounded-none border-l bg-secondary text-secondary-foreground hover:bg-secondary/80 flex items-center justify-center"
                    onClick={() => addToCart(item)}
                  >
                    <Plus className="h-8 w-8" />
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* CART VIEW */}
        {activeTab === "cart" && (
          <div className="flex flex-col gap-4 pb-8">
            {cart.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
                <ShoppingCart className="h-16 w-16 mb-4 opacity-20" />
                <p className="text-lg font-medium">Cart is empty</p>
                <Button variant="link" onClick={() => setActiveTab("menu")} className="mt-2 min-h-[44px]">
                  Return to Menu
                </Button>
              </div>
            ) : (
              cart.map((item) => (
                <Card key={item.cartId} className="border-border/50 shadow-sm overflow-hidden">
                  <CardContent className="p-4 flex flex-col gap-4">
                    <div className="flex justify-between items-start">
                      <div>
                        <h3 className="font-semibold text-lg leading-tight">{item.name}</h3>
                        <p className="text-muted-foreground text-sm">${item.price.toFixed(2)} ea</p>
                      </div>
                      <div className="font-bold text-xl">
                        ${(item.price * item.quantity).toFixed(2)}
                      </div>
                    </div>

                    {/* Modifiers - Segmented Control (UI Rule: Avoid dropdowns for 2-4 options) */}
                    {item.modifier !== 'None' && (
                      <div className="flex bg-muted p-1 rounded-md w-full">
                        {(['Small', 'Regular', 'Large'] as Modifier[]).map((mod) => (
                          <button 
                            key={mod}
                            onClick={() => setItemModifier(item.cartId, mod)}
                            className={`flex-1 text-center py-2 text-sm rounded-sm transition-all active:scale-95 ${item.modifier === mod ? 'bg-background shadow-sm font-bold text-foreground' : 'text-muted-foreground font-medium'}`}
                            style={{ minHeight: '44px' }}
                          >
                            {mod}
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Selection Steppers & Swipe-to-Delete replacement (Generous spacing rule) */}
                    <div className="flex justify-between items-center bg-muted/30 p-1 rounded-full border">
                      <Button 
                        variant="ghost" 
                        className="text-destructive rounded-full min-h-[44px] min-w-[44px]"
                        onClick={() => updateQuantity(item.cartId, -item.quantity)} // Delete entirely
                      >
                        <Trash2 className="h-5 w-5" />
                      </Button>

                      <div className="flex items-center gap-2">
                        <Button 
                          variant="secondary" 
                          className="rounded-full min-h-[44px] min-w-[44px] bg-background shadow-sm"
                          onClick={() => updateQuantity(item.cartId, -1)}
                        >
                          <Minus className="h-5 w-5" />
                        </Button>
                        <span className="font-bold text-xl w-10 text-center">{item.quantity}</span>
                        <Button 
                          variant="default" 
                          className="rounded-full min-h-[44px] min-w-[44px]"
                          onClick={() => updateQuantity(item.cartId, 1)}
                        >
                          <Plus className="h-5 w-5" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        )}
      </ScrollArea>

      {/* Sticky Footer - Thumb Zone Optimization */}
      <div className="fixed bottom-0 left-0 w-full bg-background border-t shadow-[0_-10px_40px_rgba(0,0,0,0.1)] z-50">
        
        {/* Payment Rail Toggle (IDIA Specific) */}
        <div className="flex bg-secondary/50 p-2 border-b">
          {(["Fiat", "Platform Credits"] as const).map((rail) => (
            <button
              key={rail}
              onClick={() => { triggerHaptic(); setPaymentRail(rail); }}
              className={`flex-1 flex items-center justify-center text-sm font-bold transition-all rounded-md ${
                paymentRail === rail 
                  ? "bg-primary text-primary-foreground shadow-md scale-100" 
                  : "text-muted-foreground hover:bg-secondary scale-[0.98]"
              }`}
              style={{ minHeight: '48px' }}
            >
              {rail === "Fiat" ? "Fiat (FBO)" : "Platform Credits"}
            </button>
          ))}
        </div>

        <div className="p-4 pb-8">
          <div className="flex justify-between items-center mb-4 px-2">
            <span className="text-lg text-muted-foreground font-medium">Total</span>
            <span className="text-4xl font-bold tracking-tight">${cartTotal.toFixed(2)}</span>
          </div>
          
          <Button 
            size="lg" 
            className="w-full min-h-[64px] text-2xl font-bold active:scale-[0.98] transition-transform"
            onClick={handleCheckout}
            disabled={cart.length === 0 || isProcessing}
            style={cart.length > 0 ? { background: "var(--idia-gradient, linear-gradient(135deg, #000 0%, #333 100%))", color: "white" } : {}}
          >
            {isProcessing ? "Processing Ledger..." : "Charge"}
          </Button>
        </div>
      </div>

    </div>
  );
}