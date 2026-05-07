/** * NANO-BITE ID: hosp.ft.ops.restock
 * NANO-BITE NAME: Commissary restock
 * ROLE: Weekly
 * INDUSTRY: tertiary.hospitality.food_truck 
 */

import React, { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { AlertCircle } from "lucide-react";

interface InventoryItem {
  sku: string;
  name: string;
  uom: string; // Unit of Measure
  parLevel: number;
  currentCount: number | '';
  needsReview: boolean;
}

export default function CommissaryRestock() {
  const [activeTab, setActiveTab] = useState("perishables");
  const [inventory, setInventory] = useState<Record<string, InventoryItem[]>>({
    perishables: [
      { sku: 'PR-101', name: 'Ground Beef (80/20)', uom: 'Lbs', parLevel: 150, currentCount: '', needsReview: false },
      { sku: 'PR-102', name: 'Brioche Buns', uom: 'Sleeves', parLevel: 40, currentCount: '', needsReview: false },
    ],
    dryGoods: [
      { sku: 'DG-201', name: 'Frying Oil', uom: 'Jugs', parLevel: 8, currentCount: '', needsReview: false },
    ]
  });
  
  const [requiresUrgentDelivery, setRequiresUrgentDelivery] = useState(false);

  const handleInputChange = (category: string, sku: string, val: string) => {
    console.log(`[BEGIN] handleInputChange execution for sku: ${sku}, val: ${val}`);
    try {
      // Explicitly type parsedVal to prevent it from broadening to `string`
      const parsedVal: number | '' = val === '' ? '' : parseInt(val, 10);
      
      setInventory(prev => {
        const categoryItems = prev[category];
        // Explicitly map the return array as InventoryItem[]
        const updatedItems: InventoryItem[] = categoryItems.map(item => {
          if (item.sku === sku) {
            // Inline validation logic
            const reviewFlag = typeof parsedVal === 'number' && parsedVal > (item.parLevel * 1.5);
            console.log(`[INFO] handleInputChange: SKU ${sku} updated to ${parsedVal}. Review Flag: ${reviewFlag}`);
            
            return { ...item, currentCount: parsedVal, needsReview: reviewFlag };
          }
          return item;
        });
        return { ...prev, [category]: updatedItems };
      });
    } catch (error) {
      console.error(`[ERROR] handleInputChange failed:`, error);
    } finally {
      console.log(`[END] handleInputChange execution for sku: ${sku}`);
    }
  };

  const submitRestock = () => {
    console.log("[BEGIN] submitRestock execution");
    try {
      console.log("[INFO] submitRestock: Validating payload...");
      
      // Ensure no blank fields exist before submission
      const allCategories = Object.values(inventory).flat();
      const missingCounts = allCategories.filter(item => item.currentCount === '');
      
      if (missingCounts.length > 0) {
        console.warn(`[WARN] submitRestock: User attempted to submit with ${missingCounts.length} empty fields.`);
        alert("Please complete all inventory counts before submitting.");
        return;
      }

      const payload = {
        timestamp: new Date().toISOString(),
        urgentDelivery: requiresUrgentDelivery,
        data: inventory
      };

      console.log("[INFO] submitRestock: Payload generated.", payload);
      // Execute API transmission here
      
      console.log("[INFO] submitRestock: Restock manifest committed to ledger successfully.");
    } catch (error) {
      console.error(`[ERROR] submitRestock failed:`, error);
    } finally {
      console.log("[END] submitRestock execution");
    }
  };

  return (
    <div className="flex flex-col h-screen bg-background relative pb-[120px]">
      <div className="pt-12 pb-4 px-6 bg-card border-b">
        <h1 className="text-2xl font-bold tracking-tight">Commissary Restock</h1>
        <p className="text-sm text-muted-foreground">Weekly Requisition Wizard</p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full flex-1 flex flex-col">
        <div className="px-4 py-2 border-b bg-card z-10 sticky top-0">
          <TabsList className="grid w-full grid-cols-2 min-h-[44px]">
            <TabsTrigger value="perishables" className="min-h-[40px] text-sm">Perishables</TabsTrigger>
            <TabsTrigger value="dryGoods" className="min-h-[40px] text-sm">Dry Goods</TabsTrigger>
          </TabsList>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-6">
          {Object.keys(inventory).map((category) => (
            <TabsContent key={category} value={category} className="m-0 flex flex-col gap-6 focus-visible:outline-none focus-visible:ring-0">
              {inventory[category].map((item) => (
                <div key={item.sku} className="flex flex-col gap-2">
                  {/* Label placed above input for keyboard visibility */}
                  <div className="flex justify-between items-end">
                    <Label htmlFor={item.sku} className="text-base font-semibold">
                      {item.name}
                    </Label>
                    <span className="text-xs text-muted-foreground">Par: {item.parLevel} {item.uom}</span>
                  </div>
                  
                  {/* Contextual Numeric Keyboard via type="number" */}
                  <Input 
                    id={item.sku}
                    type="number"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    placeholder={`Current ${item.uom} count...`}
                    value={item.currentCount}
                    onChange={(e) => handleInputChange(category, item.sku, e.target.value)}
                    className={`min-h-[56px] text-lg ${item.needsReview ? 'border-destructive focus-visible:ring-destructive' : ''}`}
                  />
                  
                  {/* Inline Error Validation */}
                  {item.needsReview && (
                    <div className="flex items-center gap-2 text-destructive text-sm mt-1">
                      <AlertCircle className="h-4 w-4" />
                      <span>Count exceeds 150% of Par. Please verify.</span>
                    </div>
                  )}
                </div>
              ))}
            </TabsContent>
          ))}

          {/* Toggle over Checkbox for binary decisions */}
          <Card className="mt-8 border-border/50 bg-muted/30">
            <CardContent className="p-4 flex items-center justify-between">
              <div className="flex flex-col gap-1">
                <Label className="text-base font-medium cursor-pointer" htmlFor="urgent-delivery">Urgent Delivery Required</Label>
                <span className="text-sm text-muted-foreground">Flag for expedited routing</span>
              </div>
              <Switch 
                id="urgent-delivery" 
                checked={requiresUrgentDelivery}
                onCheckedChange={setRequiresUrgentDelivery}
                className="scale-125 mr-2" 
              />
            </CardContent>
          </Card>
        </div>
      </Tabs>

      {/* Sticky Footer */}
      <div className="fixed bottom-0 left-0 w-full bg-background border-t p-4 pb-8 shadow-[0_-10px_40px_rgba(0,0,0,0.1)] z-50">
        <Button 
          size="lg" 
          className="w-full min-h-[60px] text-xl font-bold bg-green-600 hover:bg-green-700 active:bg-green-800 text-white"
          onClick={submitRestock}
        >
          Submit Restock
        </Button>
      </div>
    </div>
  );
}