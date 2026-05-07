/** * NANO-BITE ID: hosp.ft.sales.mobile_pos
 * NANO-BITE NAME: Mobile-POS sale
 * ROLE: Daily
 * INDUSTRY: tertiary.hospitality.food_truck 
 */

import React, { useState, useCallback } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Plus, Minus, Trash2 } from "lucide-react";

interface LineItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
  modifier: 'Small' | 'Regular' | 'Large' | null;
}

export default function MobilePosSale() {
  const [cart, setCart] = useState<LineItem[]>([
    { id: 'item-1', name: 'Signature Smashburger', price: 12.50, quantity: 1, modifier: 'Regular' },
    { id: 'item-2', name: 'Truffle Fries', price: 6.00, quantity: 2, modifier: 'Large' }
  ]);
  const [isProcessing, setIsProcessing] = useState(false);

  const updateQuantity = useCallback((id: string, delta: number) => {
    console.log(`[BEGIN] updateQuantity execution for id: ${id}, delta: ${delta}`);
    try {
      setCart(prev => prev.map(item => {
        if (item.id === id) {
          const newQuantity = Math.max(0, item.quantity + delta);
          console.log(`[INFO] updateQuantity: Item ${id} quantity changing from ${item.quantity} to ${newQuantity}`);
          return { ...item, quantity: newQuantity };
        }
        return item;
      }).filter(item => item.quantity > 0)); // Auto-remove if quantity hits 0
    } catch (error) {
      console.error(`[ERROR] updateQuantity failed:`, error);
    } finally {
      console.log(`[END] updateQuantity execution for id: ${id}`);
    }
  }, []);

  const handleCheckout = async () => {
    console.log("[BEGIN] handleCheckout execution");
    setIsProcessing(true);
    
    try {
      console.log(`[INFO] handleCheckout: Processing ${cart.length} items.`);
      if (cart.length === 0) {
        throw new Error("Cart is empty. Cannot process checkout.");
      }
      
      // Simulate network request
      await new Promise(resolve => setTimeout(resolve, 800));
      
      console.log("[INFO] handleCheckout: Transaction approved.");
      setCart([]); // Clear cart post-success
      
      // Implement Undo Toast here per UI guidelines
      console.log("[INFO] handleCheckout: Firing success toast with Undo action.");
      
    } catch (error) {
      console.error(`[ERROR] handleCheckout failed:`, error);
    } finally {
      setIsProcessing(false);
      console.log("[END] handleCheckout execution");
    }
  };

  const cartTotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);

  return (
    <div className="flex flex-col h-screen bg-background relative pb-[100px]">
      {/* Header */}
      <div className="pt-12 pb-4 px-6 bg-card border-b">
        <h1 className="text-2xl font-bold tracking-tight">Active Order</h1>
        <p className="text-sm text-muted-foreground">Mobile POS • Walk-up</p>
      </div>

      {/* Cart List - Single Column */}
      <ScrollArea className="flex-1 w-full px-4 pt-4">
        <div className="flex flex-col gap-4 pb-8">
          {cart.map((item) => (
            <Card key={item.id} className="border-border/50 shadow-sm overflow-hidden active:scale-[0.98] transition-transform">
              <CardContent className="p-4 flex flex-col gap-3">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="font-semibold text-lg leading-tight">{item.name}</h3>
                    <p className="text-muted-foreground text-sm">${item.price.toFixed(2)}</p>
                  </div>
                  <div className="font-bold text-lg">
                    ${(item.price * item.quantity).toFixed(2)}
                  </div>
                </div>

                {/* Modifiers - Segmented Control Simulation */}
                {item.modifier && (
                  <div className="flex bg-muted p-1 rounded-md w-full">
                    {['Small', 'Regular', 'Large'].map((mod) => (
                      <div 
                        key={mod}
                        className={`flex-1 text-center py-2 text-sm rounded-sm transition-colors ${item.modifier === mod ? 'bg-background shadow-sm font-medium' : 'text-muted-foreground'}`}
                        style={{ minHeight: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                      >
                        {mod}
                      </div>
                    ))}
                  </div>
                )}

                {/* Selection Steppers & Swipe Actions */}
                <div className="flex justify-between items-center mt-2">
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="text-destructive min-h-[44px] min-w-[44px]"
                    onClick={() => updateQuantity(item.id, -item.quantity)}
                  >
                    <Trash2 className="h-5 w-5" />
                  </Button>

                  <div className="flex items-center gap-4 bg-muted rounded-full p-1">
                    <Button 
                      variant="secondary" 
                      size="icon" 
                      className="rounded-full min-h-[44px] min-w-[44px]"
                      onClick={() => updateQuantity(item.id, -1)}
                    >
                      <Minus className="h-5 w-5" />
                    </Button>
                    <span className="font-bold text-lg w-8 text-center">{item.quantity}</span>
                    <Button 
                      variant="default" 
                      size="icon" 
                      className="rounded-full min-h-[44px] min-w-[44px]"
                      onClick={() => updateQuantity(item.id, 1)}
                    >
                      <Plus className="h-5 w-5" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </ScrollArea>

      {/* Sticky Footer - Thumb Zone Optimization */}
      <div className="fixed bottom-0 left-0 w-full bg-background border-t p-4 pb-8 shadow-[0_-10px_40px_rgba(0,0,0,0.1)] z-50">
        <div className="flex justify-between items-center mb-4 px-2">
          <span className="text-lg text-muted-foreground">Total (Incl. Tax)</span>
          <span className="text-3xl font-bold">${cartTotal.toFixed(2)}</span>
        </div>
        <Button 
          size="lg" 
          className="w-full min-h-[60px] text-xl font-bold"
          onClick={handleCheckout}
          disabled={cart.length === 0 || isProcessing}
        >
          {isProcessing ? "Processing..." : "Charge / Checkout"}
        </Button>
      </div>
    </div>
  );
}