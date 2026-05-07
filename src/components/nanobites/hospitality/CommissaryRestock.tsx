/** * NANO-BITE ID: hosp.ft.ops.restock
 * NANO-BITE NAME: Commissary restock
 * ROLE: Weekly
 * INDUSTRY: tertiary.hospitality.food_truck 
 */

import React, { useState, useCallback } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AlertCircle, Plus, ChevronLeft, PackageSearch, Save } from "lucide-react";

// ============================================================================
// SCHEMAS
// ============================================================================
export interface InventoryItem {
  id: string; // Internal database ID
  sku: string;
  name: string;
  category: "Perishables" | "Dry Goods" | "Packaging";
  uom: string; // Unit of Measure (e.g., Lbs, Sleeves, Jugs)
  parLevel: number;
  currentCount: number | '';
  needsReview: boolean;
}

export interface CommissaryRestockProps {
  businessId?: string;
  savedInventory?: InventoryItem[];
  onCommitInventoryItem?: (item: Omit<InventoryItem, 'currentCount' | 'needsReview'>) => Promise<boolean>;
  onSubmitRestockManifest?: (payload: any) => Promise<boolean>;
}

export default function CommissaryRestock({
  businessId = "default",
  savedInventory = [],
  onCommitInventoryItem,
  onSubmitRestockManifest
}: CommissaryRestockProps) {

  // --- STATE MACHINE ---
  type ViewState = "count_execution" | "create_item";
  const [view, setView] = useState<ViewState>("count_execution");
  const [activeTab, setActiveTab] = useState<string>("Perishables");
  
  // Operational State
  const [inventory, setInventory] = useState<InventoryItem[]>(savedInventory);
  const [requiresUrgentDelivery, setRequiresUrgentDelivery] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  // Master Data Creation State
  const [newItemName, setNewItemName] = useState("");
  const [newItemCategory, setNewItemCategory] = useState<"Perishables" | "Dry Goods" | "Packaging">("Perishables");
  const [newItemUom, setNewItemUom] = useState("");
  const [newItemPar, setNewItemPar] = useState("");
  const [creationError, setCreationError] = useState<string | null>(null);

  const triggerHaptic = useCallback((type: 'light' | 'heavy' = 'light') => {
    try {
      if (typeof window !== 'undefined' && window.navigator && window.navigator.vibrate) {
        window.navigator.vibrate(type === 'heavy' ? [50, 50, 50] : 50);
      }
    } catch (e) { /* Hardware agnostic fallback */ }
  }, []);

  // ============================================================================
  // WORKFLOW: MASTER DATA CREATION (Data Entry)
  // ============================================================================
  const handleCreateMasterItem = async () => {
    console.log(`[BEGIN] handleCreateMasterItem execution`);
    setCreationError(null);
    setIsProcessing(true);

    try {
      triggerHaptic();
      
      // Inline Validation logic
      if (!newItemName.trim()) throw new Error("Item Name is required.");
      if (!newItemUom.trim()) throw new Error("Unit of Measure is required.");
      const parsedPar = parseInt(newItemPar, 10);
      if (isNaN(parsedPar) || parsedPar <= 0) throw new Error("Par Level must be a valid number greater than 0.");

      const generatedSku = `${newItemCategory.substring(0, 2).toUpperCase()}-${Date.now().toString().slice(-4)}`;
      
      const newItemPayload = {
        id: `inv_${Date.now()}`,
        sku: generatedSku,
        name: newItemName.trim(),
        category: newItemCategory,
        uom: newItemUom.trim(),
        parLevel: parsedPar,
      };

      console.log(`[INFO] handleCreateMasterItem: Payload generated`, newItemPayload);

      if (onCommitInventoryItem) {
        await onCommitInventoryItem(newItemPayload);
      }

      // Inject into active count session
      setInventory(prev => [...prev, { ...newItemPayload, currentCount: '', needsReview: false }]);
      
      // Reset Form State
      setNewItemName("");
      setNewItemUom("");
      setNewItemPar("");
      setActiveTab(newItemCategory); // Switch view to the category just added to
      setView("count_execution");
      
      console.log(`[INFO] handleCreateMasterItem: Item committed successfully.`);
    } catch (error: any) {
      console.error(`[ERROR] handleCreateMasterItem failed:`, error.message);
      setCreationError(error.message);
      triggerHaptic('heavy');
    } finally {
      setIsProcessing(false);
      console.log(`[END] handleCreateMasterItem execution`);
    }
  };

  // ============================================================================
  // WORKFLOW: COUNT EXECUTION (Data Entry)
  // ============================================================================
  const handleCountChange = (id: string, val: string) => {
    console.log(`[BEGIN] handleCountChange execution for id: ${id}, val: ${val}`);
    try {
      const parsedVal: number | '' = val === '' ? '' : parseInt(val, 10);
      
      setInventory(prev => prev.map(item => {
        if (item.id === id) {
          // Inline Validation: Prevent silent errors on massive deviations
          const reviewFlag = typeof parsedVal === 'number' && item.parLevel > 0 && parsedVal > (item.parLevel * 1.5);
          return { ...item, currentCount: parsedVal, needsReview: reviewFlag };
        }
        return item;
      }));
    } catch (error) {
      console.error(`[ERROR] handleCountChange failed:`, error);
    } finally {
      console.log(`[END] handleCountChange execution`);
    }
  };

  const submitRestockManifest = async () => {
    console.log("[BEGIN] submitRestockManifest execution");
    try {
      setIsProcessing(true);
      triggerHaptic('heavy');
      
      // Verification
      const missingCounts = inventory.filter(item => item.currentCount === '');
      if (missingCounts.length > 0) {
        alert("Action Blocked: Please complete all inventory counts before submitting.");
        return;
      }

      const payload = {
        businessId,
        timestamp: new Date().toISOString(),
        urgentDelivery: requiresUrgentDelivery,
        data: inventory
      };

      console.log("[INFO] submitRestockManifest: Payload compiled.", payload);
      
      if (onSubmitRestockManifest) {
        await onSubmitRestockManifest(payload);
      }
      
      alert(`Restock manifest submitted successfully for ${inventory.length} items.`);
    } catch (error) {
      console.error(`[ERROR] submitRestockManifest failed:`, error);
      alert("System Error: Failed to submit restock manifest.");
    } finally {
      setIsProcessing(false);
      console.log("[END] submitRestockManifest execution");
    }
  };

  const activeItems = inventory.filter(i => i.category === activeTab);

  // ============================================================================
  // RENDER: MASTER DATA CREATION VIEW
  // ============================================================================
  if (view === "create_item") {
    return (
      <div className="flex flex-col h-screen bg-background relative overflow-hidden animate-in slide-in-from-right">
        <div className="pt-12 pb-4 px-4 bg-card border-b flex items-center gap-2 z-10">
          <Button variant="ghost" onClick={() => { triggerHaptic(); setView("count_execution"); }} className="min-h-[44px]">
            <ChevronLeft className="mr-2 h-5 w-5" /> Back
          </Button>
          <h1 className="text-xl font-bold tracking-tight">Create Master Item</h1>
        </div>

        <ScrollArea className="flex-1 w-full px-6 py-8">
          <div className="flex flex-col gap-8 pb-32">
            
            {creationError && (
              <div className="p-4 bg-destructive/10 text-destructive border border-destructive/20 rounded-xl flex items-center gap-3">
                <AlertCircle className="h-5 w-5 shrink-0" />
                <span className="text-sm font-bold">{creationError}</span>
              </div>
            )}

            <div className="flex flex-col gap-2">
              <Label htmlFor="itemName" className="text-base font-bold text-muted-foreground uppercase tracking-wider">Item Name <span className="text-destructive">*</span></Label>
              <Input 
                id="itemName" 
                value={newItemName} 
                onChange={(e) => setNewItemName(e.target.value)} 
                placeholder="e.g. Ground Beef (80/20)" 
                className="min-h-[56px] text-lg bg-card"
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label className="text-base font-bold text-muted-foreground uppercase tracking-wider">Category <span className="text-destructive">*</span></Label>
              <div className="grid grid-cols-1 gap-3">
                {(["Perishables", "Dry Goods", "Packaging"] as const).map(cat => (
                  <button
                    key={cat}
                    onClick={() => { triggerHaptic(); setNewItemCategory(cat); }}
                    className={`flex items-center justify-center p-4 rounded-xl border-2 font-bold text-lg transition-all active:scale-[0.98] ${newItemCategory === cat ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-card text-foreground'}`}
                    style={{ minHeight: '60px' }}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="itemUom" className="text-base font-bold text-muted-foreground uppercase tracking-wider">UOM <span className="text-destructive">*</span></Label>
                <Input 
                  id="itemUom" 
                  value={newItemUom} 
                  onChange={(e) => setNewItemUom(e.target.value)} 
                  placeholder="e.g. Lbs, Cases" 
                  className="min-h-[56px] text-lg bg-card"
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="itemPar" className="text-base font-bold text-muted-foreground uppercase tracking-wider">Par Level <span className="text-destructive">*</span></Label>
                <Input 
                  id="itemPar" 
                  type="number"
                  inputMode="numeric"
                  value={newItemPar} 
                  onChange={(e) => setNewItemPar(e.target.value)} 
                  placeholder="0" 
                  className="min-h-[56px] text-lg bg-card"
                />
              </div>
            </div>

          </div>
        </ScrollArea>

        <div className="fixed bottom-0 left-0 w-full bg-background border-t p-4 pb-8 shadow-[0_-10px_40px_rgba(0,0,0,0.1)] z-50">
          <Button 
            size="lg" 
            className="w-full min-h-[64px] text-xl font-bold bg-primary text-primary-foreground"
            onClick={handleCreateMasterItem}
            disabled={isProcessing}
          >
            {isProcessing ? "Saving..." : <><Save className="mr-2 h-6 w-6" /> Save to Master Inventory</>}
          </Button>
        </div>
      </div>
    );
  }

  // ============================================================================
  // RENDER: COUNT EXECUTION VIEW (Default)
  // ============================================================================
  return (
    <div className="flex flex-col h-screen bg-background relative pb-[120px]">
      
      <div className="pt-12 pb-4 px-6 bg-card border-b flex justify-between items-center z-10">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Commissary Restock</h1>
          <p className="text-sm text-muted-foreground">Weekly Count Execution</p>
        </div>
        <Button variant="outline" size="icon" className="min-h-[44px] min-w-[44px] rounded-full border-primary/20 bg-primary/5 text-primary hover:bg-primary/10" onClick={() => { triggerHaptic(); setView("create_item"); }}>
          <Plus className="h-6 w-6" />
        </Button>
      </div>

      {inventory.length === 0 ? (
        <div className="flex flex-col items-center justify-center flex-1 p-6 text-center">
          <PackageSearch className="h-20 w-20 text-muted-foreground opacity-20 mb-6" />
          <h2 className="text-2xl font-bold tracking-tight">Master Catalog Empty</h2>
          <p className="text-muted-foreground mt-2 text-lg mb-8">Your inventory system is blank. You must create master items before executing a count.</p>
          <Button size="lg" className="min-h-[60px] text-lg font-bold px-8" onClick={() => { triggerHaptic(); setView("create_item"); }}>
            <Plus className="mr-2 h-6 w-6" /> Create First Item
          </Button>
        </div>
      ) : (
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full flex-1 flex flex-col">
          <div className="px-4 py-2 border-b bg-card z-10 sticky top-0 overflow-x-auto no-scrollbar">
            <TabsList className="w-full min-h-[50px] inline-flex">
              {(["Perishables", "Dry Goods", "Packaging"] as const).map(cat => (
                <TabsTrigger key={cat} value={cat} className="min-h-[44px] text-base font-semibold px-6 flex-1">
                  {cat}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-6">
            <TabsContent value={activeTab} className="m-0 flex flex-col gap-6 focus-visible:outline-none focus-visible:ring-0">
              
              {activeItems.length === 0 ? (
                <div className="text-center py-20 text-muted-foreground">
                  <p className="text-lg">No {activeTab} items in master catalog.</p>
                  <Button variant="link" onClick={() => setView("create_item")} className="mt-2 text-primary font-bold">
                    + Add New Item to {activeTab}
                  </Button>
                </div>
              ) : (
                activeItems.map((item) => (
                  <div key={item.id} className="flex flex-col gap-2">
                    <div className="flex justify-between items-end mb-1">
                      <Label htmlFor={item.id} className="text-lg font-bold">
                        {item.name}
                      </Label>
                      <span className="text-sm text-muted-foreground font-medium">Par: {item.parLevel} {item.uom}</span>
                    </div>
                    
                    {/* Contextual Numeric Keyboard via type="number" */}
                    <Input 
                      id={item.id}
                      type="number"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      placeholder={`Current ${item.uom} count...`}
                      value={item.currentCount}
                      onChange={(e) => handleCountChange(item.id, e.target.value)}
                      className={`min-h-[60px] text-xl font-bold bg-muted/30 border-border/60 ${item.needsReview ? 'border-destructive focus-visible:ring-destructive bg-destructive/5' : ''}`}
                    />
                    
                    {item.needsReview && (
                      <div className="flex items-center gap-2 text-destructive text-sm mt-1 font-bold">
                        <AlertCircle className="h-4 w-4" />
                        <span>Count exceeds 150% of Par. Please verify.</span>
                      </div>
                    )}
                  </div>
                ))
              )}

              {activeItems.length > 0 && (
                <div className="mt-8 border-t pt-8 pb-8">
                  <Button variant="outline" className="w-full min-h-[60px] text-lg font-bold border-dashed border-2" onClick={() => { triggerHaptic(); setNewItemCategory(activeTab as any); setView("create_item"); }}>
                    <Plus className="mr-2 h-5 w-5" /> Add Master Item to Category
                  </Button>
                </div>
              )}

              {/* Toggle over Checkbox for binary decisions */}
              {activeItems.length > 0 && (
                <Card className="mt-4 border-border/50 bg-muted/20">
                  <CardContent className="p-5 flex items-center justify-between">
                    <div className="flex flex-col gap-1 pr-4">
                      <Label className="text-base font-bold cursor-pointer" htmlFor="urgent-delivery">Urgent Delivery Required</Label>
                      <span className="text-sm text-muted-foreground font-medium">Flag manifest for expedited central routing</span>
                    </div>
                    <Switch 
                      id="urgent-delivery" 
                      checked={requiresUrgentDelivery}
                      onCheckedChange={(val) => { triggerHaptic(); setRequiresUrgentDelivery(val); }}
                      className="scale-125" 
                    />
                  </CardContent>
                </Card>
              )}
            </TabsContent>
          </div>
        </Tabs>
      )}

      {/* Sticky Footer */}
      {inventory.length > 0 && (
        <div className="fixed bottom-0 left-0 w-full bg-background border-t p-4 pb-8 shadow-[0_-10px_40px_rgba(0,0,0,0.1)] z-50">
          <Button 
            size="lg" 
            className="w-full min-h-[64px] text-xl font-bold bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white active:scale-[0.98] transition-transform"
            onClick={submitRestockManifest}
            disabled={isProcessing}
          >
            {isProcessing ? "Transmitting..." : "Submit Restock Manifest"}
          </Button>
        </div>
      )}

    </div>
  );
}