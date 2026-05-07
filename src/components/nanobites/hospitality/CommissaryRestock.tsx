/** * NANO-BITE ID: hosp.ft.ops.restock
 * NANO-BITE NAME: Commissary Restock & Recipe Engine
 * ROLE: Operations / Menu Engineering / Weekly Restock
 * INDUSTRY: tertiary.hospitality.food_truck 
 */

import React, { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  AlertCircle, Plus, ChevronLeft, PackageSearch, 
  Save, Truck, ChefHat, Search, UtensilsCrossed, 
  Layers, X, DollarSign, Trash2
} from "lucide-react";
import { toast } from "sonner";

// ============================================================================
// STRICT DATA SCHEMAS
// ============================================================================
export interface InventoryItem {
  id: string; 
  sku: string;
  name: string;
  category: "Perishables" | "Dry Goods" | "Packaging" | string;
  uom: string; 
  parLevel: number;
  currentCount: number | '';
  previousCount: number; 
  needsReview: boolean;
  odmDemand?: number; // Live Demand Signal from the Truck (ODM)
}

export interface BaseIngredient {
  inventory_id: string;
  name: string;
  quantity: number;
  uom: string;
}

export interface ModOption {
  id: string; 
  name: string;
  priceDelta: number;
  quantity: number;
  uom: string;
}

export interface ModGroup {
  id: string;
  name: string;
  isRequired: boolean;
  options: ModOption[];
}

export interface CommissaryRestockProps {
  businessId?: string;
  locationId?: string;
}

export default function CommissaryRestock({
  businessId = "default",
  locationId = "default",
}: CommissaryRestockProps) {

  // --- STRICT STATE MACHINE ---
  type ViewState = "count_execution" | "create_item" | "recipe_select" | "recipe_build";
  const [view, setView] = useState<ViewState>("count_execution");
  
  // Tab States
  const [inventoryTab, setInventoryTab] = useState<string>("Perishables");
  const [recipeTab, setRecipeTab] = useState<"base" | "modifiers">("base");
  
  // Data States
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [menuItems, setMenuItems] = useState<any[]>([]);
  const [requiresUrgentDelivery, setRequiresUrgentDelivery] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Master Data Creation State
  const [newItemName, setNewItemName] = useState("");
  const [newItemCategory, setNewItemCategory] = useState<string>("Perishables");
  const [newItemUom, setNewItemUom] = useState("");
  const [newItemPar, setNewItemPar] = useState("");
  const [creationError, setCreationError] = useState<string | null>(null);

  // Recipe Builder State
  const [selectedMenu, setSelectedMenu] = useState<any>(null);
  const [baseRecipe, setBaseRecipe] = useState<BaseIngredient[]>([]);
  const [modGroups, setModGroups] = useState<ModGroup[]>([]);
  const [recipeSearchTerm, setRecipeSearchTerm] = useState("");

  const triggerHaptic = useCallback((type: 'light' | 'heavy' = 'light') => {
    try {
      if (typeof window !== 'undefined' && window.navigator?.vibrate) {
        window.navigator.vibrate(type === 'heavy' ? [50, 50, 50] : 50);
      }
    } catch (e) { /* hardware agnostic */ }
  }, []);

  // ============================================================================
  // SUPABASE: UNIFIED LEDGER HYDRATION
  // ============================================================================
  const fetchLedgers = useCallback(async () => {
    console.log(`[DATA_HYDRATION]: START - Resolving Inventory, Demand, and Menu Registries.`);
    setIsLoading(true);
    try {
      // 1. Fetch Inventory Items
      const invPromise = (supabase.from('inventory_items' as any)
        .select(`id, vendor_sku, name, category, unit_of_measure, par_level`)
        .eq('business_id', businessId)
        .eq('is_active', true) as any);

      // 2. Fetch Live Demand Signals (ODM)
      const demandPromise = (supabase.from('inventory_demand' as any)
        .select('item_name, quantity_needed')
        .eq('business_id', businessId)
        .eq('status', 'pending_restock') as any);

      // 3. Fetch Menu Items (For Recipe Builder)
      const menuPromise = (supabase.from('menu_items' as any)
        .select('*')
        .eq('business_id', businessId) as any);

      const [invRes, demandRes, menuRes] = await Promise.all([invPromise, demandPromise, menuPromise]);

      if (invRes.error) throw invRes.error;
      if (menuRes.error) throw menuRes.error;

      // Hydrate Inventory with ODM Demand Context
      if (invRes.data) {
        const formattedData: InventoryItem[] = invRes.data.map((item: any) => {
          const activeDemand = demandRes.data?.find((d: any) => d.item_name === item.name);
          return {
            id: item.id,
            sku: item.vendor_sku || item.id.substring(0, 8),
            name: item.name,
            category: item.category,
            uom: item.unit_of_measure,
            parLevel: item.par_level || 0,
            currentCount: '',
            previousCount: 0, 
            needsReview: false,
            odmDemand: activeDemand?.quantity_needed || 0
          };
        });
        setInventory(formattedData);
      }

      // Hydrate Menu Items
      if (menuRes.data) {
        setMenuItems(menuRes.data);
      }

      console.log(`[DATA_HYDRATION]: SUCCESS - Unified ledgers synchronized.`);
    } catch (err: any) {
      console.error("[CRITICAL_FAILURE]: fetchLedgers Stalled:", err.message);
      toast.error("Offline: Ledger synchronization failed.");
    } finally {
      setIsLoading(false);
      console.log(`[DATA_HYDRATION]: END - Sync complete.`);
    }
  }, [businessId]);

  useEffect(() => {
    if (businessId !== "default") fetchLedgers();
    else setIsLoading(false);
  }, [businessId, fetchLedgers]);

  // ============================================================================
  // OPERATIONS: COMMISSARY RESTOCK & MASTER ITEM CREATION
  // ============================================================================
  const handleCreateMasterItem = async () => {
    console.log(`[TRANSACTION_START]: Committing SKU to Master Inventory.`);
    setCreationError(null);
    setIsProcessing(true);

    try {
      triggerHaptic();
      if (!newItemName.trim()) throw new Error("Item Name is required.");
      const parsedPar = parseInt(newItemPar, 10);

      const { data: itemData, error: itemError } = await (supabase.from('inventory_items' as any)
        .insert({
          business_id: businessId,
          name: newItemName.trim(),
          category: newItemCategory,
          unit_of_measure: newItemUom.trim(),
          par_level: isNaN(parsedPar) ? 0 : parsedPar,
          is_active: true
        })
        .select()
        .single() as any);

      if (itemError) throw itemError;

      console.log(`[TRANSACTION_DATA]: SKU ${itemData.id} Vaulted.`);
      await fetchLedgers();
      
      setNewItemName("");
      setNewItemUom("");
      setNewItemPar("");
      setView("count_execution");
      toast.success("Master item archived to registry.");
      
    } catch (error: any) {
      console.error(`[TRANSACTION_STALL]: Creation failed:`, error.message);
      setCreationError(error.message);
      triggerHaptic('heavy');
    } finally {
      setIsProcessing(false);
    }
  };

  const submitRestockManifest = async () => {
    console.log("[TRANSACTION_START]: Synchronizing Restock Ledger with ODM Demand.");
    try {
      setIsProcessing(true);
      triggerHaptic('heavy');
      
      const missingCounts = inventory.filter(item => item.currentCount === '');
      if (missingCounts.length > 0) {
        toast.error("Action Blocked: Complete all counts.");
        return;
      }

      for (const item of inventory) {
        await (supabase.from('inventory_adjustments' as any).insert({
          business_id: businessId,
          inventory_item_id: item.id,
          adjustment_type: 'restock',
          adjustment_quantity: item.currentCount,
          reason: 'ODM Shift Fulfillment'
        }) as any);

        if (item.odmDemand && item.odmDemand > 0) {
          await (supabase.from('inventory_demand' as any)
            .update({ status: 'fulfilled', fulfilled_at: new Date().toISOString() })
            .eq('item_name', item.name)
            .eq('business_id', businessId) as any);
        }
      }
      
      toast.success("Restock manifest synchronized. ODM fulfilled.");
      await fetchLedgers(); 
      
    } catch (error: any) {
      console.error(`[TRANSACTION_STALL]: Submission failed:`, error.message);
      toast.error("Stall: Ledger synchronization failed.");
    } finally {
      setIsProcessing(false);
    }
  };

  // ============================================================================
  // OPERATIONS: RECIPE BUILDER LOGIC
  // ============================================================================
  const selectMenuTarget = (item: any) => {
    triggerHaptic();
    setSelectedMenu(item);
    setBaseRecipe(item.recipe_ingredients || []);
    setModGroups(item.modifier_groups || []);
    setView("recipe_build");
    setRecipeTab("base");
  };

  const addBaseIngredient = (invItem: any) => {
    if (baseRecipe.find(i => i.inventory_id === invItem.id)) {
      toast.error("Ingredient already in base recipe.");
      return;
    }
    triggerHaptic();
    setBaseRecipe([...baseRecipe, {
      inventory_id: invItem.id,
      name: invItem.name,
      quantity: 1,
      uom: invItem.unit_of_measure || invItem.uom
    }]);
  };

  const updateBaseQty = (id: string, qty: number) => {
    setBaseRecipe(prev => prev.map(i => i.inventory_id === id ? { ...i, quantity: qty } : i));
  };

  const removeBaseIngredient = (id: string) => {
    triggerHaptic('heavy');
    setBaseRecipe(prev => prev.filter(i => i.inventory_id !== id));
  };

  const addModifierGroup = () => {
    triggerHaptic();
    const newGroup: ModGroup = { id: `grp-${Date.now()}`, name: "New Customization", isRequired: false, options: [] };
    setModGroups([...modGroups, newGroup]);
  };

  const updateModGroup = (id: string, updates: Partial<ModGroup>) => {
    setModGroups(prev => prev.map(g => g.id === id ? { ...g, ...updates } : g));
  };

  const deleteModGroup = (id: string) => {
    triggerHaptic('heavy');
    setModGroups(prev => prev.filter(g => g.id !== id));
  };

  const addOptionToGroup = (groupId: string, invItem: any) => {
    triggerHaptic();
    setModGroups(prev => prev.map(g => {
      if (g.id === groupId) {
        if (g.options.find(o => o.id === invItem.id)) return g;
        return {
          ...g,
          options: [...g.options, {
            id: invItem.id, 
            name: invItem.name,
            priceDelta: 0,
            quantity: 1,
            uom: invItem.unit_of_measure || invItem.uom
          }]
        };
      }
      return g;
    }));
  };

  const updateOption = (groupId: string, optionId: string, updates: Partial<ModOption>) => {
    setModGroups(prev => prev.map(g => {
      if (g.id === groupId) return { ...g, options: g.options.map(o => o.id === optionId ? { ...o, ...updates } : o) };
      return g;
    }));
  };

  const removeOption = (groupId: string, optionId: string) => {
    triggerHaptic('heavy');
    setModGroups(prev => prev.map(g => {
      if (g.id === groupId) return { ...g, options: g.options.filter(o => o.id !== optionId) };
      return g;
    }));
  };

  const commitRecipeToLedger = async () => {
    console.log(`[TRANSACTION_START]: Committing Artifacts for ${selectedMenu.id}`);
    setIsProcessing(true);
    triggerHaptic('heavy');

    try {
      const { error } = await (supabase.from('menu_items' as any)
        .update({ 
          recipe_ingredients: baseRecipe,
          modifier_groups: modGroups 
        })
        .eq('id', selectedMenu.id) as any);

      if (error) throw error;

      console.log(`[TRANSACTION_DATA]: Menu Item synchronized with production logic.`);
      toast.success("Recipe and Modifiers vaulted successfully.");
      setView("recipe_select");
      fetchLedgers(); 
    } catch (err: any) {
      console.error("[TRANSACTION_STALL]: Commit failed:", err.message);
      toast.error("Stall: Could not update the ledger.");
    } finally {
      setIsProcessing(false);
    }
  };

  // ============================================================================
  // RENDER BLOCKS (The Law applies everywhere)
  // ============================================================================
  if (isLoading) return <div className="h-screen flex items-center justify-center animate-pulse font-black text-xs uppercase tracking-widest text-[#86868B]">Hydrating Ledgers...</div>;

  return (
    <div className="flex flex-col h-screen bg-[#F5F5F7] relative overflow-hidden">
      
      {/* ================================================================= */}
      {/* VIEW: COUNT EXECUTION (RESTOCK HOME)                              */}
      {/* ================================================================= */}
      {view === "count_execution" && (
        <div className="flex flex-col h-full relative pb-[120px] animate-in fade-in">
          <header className="pt-12 pb-4 px-6 bg-white border-b flex justify-between items-center z-10 shadow-sm">
            <div className="flex flex-col">
              <h1 className="text-2xl font-black tracking-tighter text-[#1D1D1F]">Restock Manifest</h1>
              <span className="text-[10px] font-bold text-[#86868B] uppercase tracking-widest">ODM Fulfillment</span>
            </div>
            <div className="flex gap-2">
              {/* Navigate to Recipe Builder */}
              <Button variant="outline" className="h-11 w-11 rounded-full p-0 border-2" onClick={() => { triggerHaptic(); setView("recipe_select"); }}>
                <ChefHat size={20} />
              </Button>
              {/* Navigate to Create Item */}
              <Button variant="outline" className="h-11 w-11 rounded-full p-0 border-2" onClick={() => { triggerHaptic(); setView("create_item"); }}>
                <Plus size={24} />
              </Button>
            </div>
          </header>

          <Tabs value={inventoryTab} onValueChange={setInventoryTab} className="w-full flex-1 flex flex-col">
            <div className="bg-white border-b sticky top-0 z-10 px-4 py-2">
              <TabsList className="w-full h-[48px] bg-[#F5F5F7] rounded-xl p-1">
                {["Perishables", "Dry Goods", "Packaging"].map(cat => (
                  <TabsTrigger key={cat} value={cat} className="flex-1 rounded-lg text-xs font-black uppercase tracking-tight">
                    {cat}
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>

            <ScrollArea className="flex-1">
              <div className="p-4 pb-[200px] space-y-4">
                {inventory.filter(i => i.category === inventoryTab).length === 0 ? (
                  <div className="py-20 text-center">
                    <PackageSearch className="mx-auto h-16 w-16 text-[#D2D2D7] mb-4" />
                    <p className="text-[#86868B] font-bold">Category empty in master registry.</p>
                  </div>
                ) : (
                  inventory.filter(i => i.category === inventoryTab).map((item) => (
                    <Card key={item.id} className="border-none shadow-sm rounded-[24px] overflow-hidden bg-white">
                      <CardContent className="p-6 space-y-4">
                        <div className="flex justify-between items-start">
                          <div className="flex flex-col">
                            <h3 className="text-xl font-black text-[#1D1D1F]">{item.name}</h3>
                            <span className="text-[11px] font-bold text-[#86868B] uppercase">SKU: {item.sku}</span>
                          </div>
                          
                          {/* ODM DEMAND INDICATOR */}
                          {item.odmDemand! > 0 && (
                            <div className="bg-[#007AFF] text-white px-3 py-1 rounded-full flex items-center gap-1.5 animate-bounce">
                              <Truck size={12} />
                              <span className="text-[10px] font-black uppercase">Truck Needs {item.odmDemand}</span>
                            </div>
                          )}
                        </div>

                        <div className="space-y-2">
                          <Label className="text-[10px] font-black text-[#86868B] uppercase tracking-widest ml-1">Restock Quantity ({item.uom})</Label>
                          <Input 
                            type="number"
                            inputMode="numeric"
                            placeholder="Enter count..."
                            value={item.currentCount}
                            onChange={(e) => {
                              const val = e.target.value;
                              setInventory(prev => prev.map(i => i.id === item.id ? { ...i, currentCount: val === '' ? '' : parseInt(val, 10) } : i));
                            }}
                            className="h-[60px] rounded-2xl text-2xl font-black bg-[#F5F5F7] border-transparent focus:border-[#007AFF] transition-all"
                          />
                        </div>
                      </CardContent>
                    </Card>
                  ))
                )}
              </div>
            </ScrollArea>
          </Tabs>

          {/* Restock Footer */}
          {inventory.length > 0 && (
            <div className="fixed bottom-0 left-0 w-full p-6 bg-white/90 backdrop-blur-xl border-t border-[#F2F2F7] z-20 space-y-4 animate-in slide-in-from-bottom">
              <div className="flex items-center justify-between px-2">
                <div className="flex flex-col">
                  <span className="text-[10px] font-black text-[#86868B] uppercase">Logistics Status</span>
                  <span className="text-sm font-bold text-[#1D1D1F]">Awaiting Shift Egress</span>
                </div>
                <div className="flex items-center gap-3">
                   <span className="text-xs font-bold text-[#86868B]">Urgent</span>
                   <Switch checked={requiresUrgentDelivery} onCheckedChange={(val) => { triggerHaptic(); setRequiresUrgentDelivery(val); }} />
                </div>
              </div>
              <Button 
                disabled={isProcessing || inventory.length === 0}
                className="w-full h-[72px] text-xl font-black rounded-[24px] bg-[#34C759] text-white shadow-2xl active:scale-[0.98] transition-transform"
                onClick={submitRestockManifest}
              >
                {isProcessing ? "Synchronizing..." : "SUBMIT RESTOCK MANIFEST"}
              </Button>
            </div>
          )}
        </div>
      )}

      {/* ================================================================= */}
      {/* VIEW: CREATE MASTER ITEM                                          */}
      {/* ================================================================= */}
      {view === "create_item" && (
        <div className="flex flex-col h-full relative animate-in slide-in-from-right">
          <header className="pt-12 pb-4 px-6 bg-white border-b flex items-center gap-4 z-10 shadow-sm">
            <Button variant="ghost" className="h-11 w-11 rounded-full p-0 bg-[#F5F5F7]" onClick={() => setView("count_execution")}>
              <ChevronLeft size={24} />
            </Button>
            <h1 className="text-xl font-black uppercase tracking-tighter">New Master SKU</h1>
          </header>

          <ScrollArea className="flex-1 w-full">
            <div className="p-6 space-y-8 pb-32 max-w-md mx-auto">
              {creationError && (
                <div className="p-4 bg-destructive/10 text-destructive border border-destructive/20 rounded-2xl flex items-center gap-3">
                  <AlertCircle size={20} />
                  <span className="text-sm font-bold">{creationError}</span>
                </div>
              )}

              <div className="space-y-3">
                <Label className="text-[10px] font-black text-[#86868B] uppercase tracking-widest ml-1">Item Name *</Label>
                <Input value={newItemName} onChange={(e) => setNewItemName(e.target.value)} className="h-[60px] rounded-2xl text-lg font-bold border-2" placeholder="e.g. Diced Onions" />
              </div>

              <div className="space-y-3">
                <Label className="text-[10px] font-black text-[#86868B] uppercase tracking-widest ml-1">Category *</Label>
                <div className="grid grid-cols-1 gap-2">
                  {["Perishables", "Dry Goods", "Packaging"].map(cat => (
                    <button 
                      key={cat}
                      onClick={() => { triggerHaptic(); setNewItemCategory(cat); }}
                      className={`h-[56px] rounded-2xl font-bold border-2 transition-all ${newItemCategory === cat ? 'bg-[#1D1D1F] text-white border-[#1D1D1F]' : 'bg-white border-[#D2D2D7] text-[#1D1D1F]'}`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-3">
                  <Label className="text-[10px] font-black text-[#86868B] uppercase tracking-widest ml-1">UOM *</Label>
                  <Input value={newItemUom} onChange={(e) => setNewItemUom(e.target.value)} className="h-[60px] rounded-2xl font-bold border-2" placeholder="Lbs" />
                </div>
                <div className="space-y-3">
                  <Label className="text-[10px] font-black text-[#86868B] uppercase tracking-widest ml-1">Par Level</Label>
                  <Input type="number" value={newItemPar} onChange={(e) => setNewItemPar(e.target.value)} className="h-[60px] rounded-2xl font-bold border-2" placeholder="0" />
                </div>
              </div>
            </div>
          </ScrollArea>

          <div className="fixed bottom-0 left-0 w-full p-6 bg-white/90 backdrop-blur-xl border-t border-[#F2F2F7] z-50">
            <Button 
              className="w-full h-[72px] text-xl font-black rounded-[24px] bg-[#1D1D1F] text-white shadow-2xl"
              onClick={handleCreateMasterItem}
              disabled={isProcessing}
            >
              {isProcessing ? "Archiving SKU..." : "LOG MASTER ARTIFACT"}
            </Button>
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* VIEW: RECIPE SELECT (MENU TARGETS)                                */}
      {/* ================================================================= */}
      {view === "recipe_select" && (
        <div className="flex flex-col h-full relative animate-in fade-in">
          <header className="pt-12 pb-4 px-6 bg-white border-b flex justify-between items-center z-10 shadow-sm">
            <div className="flex items-center gap-3">
              <Button variant="ghost" className="h-11 w-11 rounded-full p-0 bg-[#F5F5F7]" onClick={() => setView("count_execution")}>
                <ChevronLeft size={24} />
              </Button>
              <div className="flex flex-col">
                <h1 className="text-xl font-black tracking-tighter text-[#1D1D1F]">Recipe Engine</h1>
                <span className="text-[10px] font-bold text-[#86868B] uppercase tracking-[0.12em]">Select Menu Target</span>
              </div>
            </div>
          </header>

          <ScrollArea className="flex-1 w-full">
            <div className="p-4 pb-[100px] space-y-4">
              <div className="px-2">
                <div className="relative mt-2">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-[#D2D2D7]" size={18} />
                  <Input 
                    className="h-[56px] pl-12 rounded-2xl border-none shadow-sm bg-white font-bold" 
                    placeholder="Search active menu items..." 
                    onChange={(e) => setRecipeSearchTerm(e.target.value)}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3">
                {menuItems.filter(i => i.name.toLowerCase().includes(recipeSearchTerm.toLowerCase())).map((item) => (
                  <Card 
                    key={item.id} 
                    className="border-none shadow-sm rounded-[24px] overflow-hidden bg-white active:scale-[0.98] transition-all cursor-pointer"
                    onClick={() => selectMenuTarget(item)}
                  >
                    <CardContent className="p-6 flex justify-between items-center">
                      <div className="flex flex-col">
                        <h3 className="text-2xl font-black text-[#1D1D1F]">{item.name}</h3>
                        <div className="flex gap-3 mt-1">
                          <span className="text-[11px] font-bold text-[#86868B] uppercase">Base: {item.recipe_ingredients?.length || 0}</span>
                          <span className="text-[11px] font-bold text-[#007AFF] uppercase">Mods: {item.modifier_groups?.length || 0}</span>
                        </div>
                      </div>
                      <ChevronLeft className="rotate-180 text-[#D2D2D7]" size={24} />
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          </ScrollArea>
        </div>
      )}

      {/* ================================================================= */}
      {/* VIEW: RECIPE BUILDER (BASE & MODIFIERS)                           */}
      {/* ================================================================= */}
      {view === "recipe_build" && (
        <div className="flex flex-col h-full relative animate-in slide-in-from-right duration-300">
          <header className="pt-12 pb-4 px-6 bg-white border-b flex justify-between items-center z-10 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 bg-[#1D1D1F] text-white rounded-xl flex items-center justify-center">
                <ChefHat size={22} />
              </div>
              <div className="flex flex-col">
                <h1 className="text-xl font-black tracking-tighter text-[#1D1D1F]">Recipe Engine</h1>
                <span className="text-[10px] font-bold text-[#86868B] uppercase tracking-[0.12em]">Production Logic</span>
              </div>
            </div>
            <Button variant="ghost" className="h-11 w-11 rounded-full p-0 bg-[#F5F5F7]" onClick={() => setView("recipe_select")}>
              <X size={20} />
            </Button>
          </header>

          <ScrollArea className="flex-1 w-full">
            <div className="p-4 pb-[200px] space-y-4">
              <div className="px-2 mb-6 mt-4">
                <h2 className="text-3xl font-black text-[#1D1D1F] tracking-tighter leading-none">{selectedMenu?.name}</h2>
                <p className="text-[#86868B] font-bold text-sm mt-2">Configure physical depletion and POS behavior.</p>
              </div>

              {/* TABS (Base vs Modifiers) */}
              <div className="flex items-center bg-[#E5E5EA] p-1.5 rounded-2xl mb-6">
                <button 
                  className={`flex-1 h-[48px] rounded-xl font-black text-sm uppercase tracking-wider transition-all ${recipeTab === "base" ? "bg-white text-[#1D1D1F] shadow-sm" : "text-[#86868B]"}`}
                  onClick={() => setRecipeTab("base")}
                >
                  Base Recipe
                </button>
                <button 
                  className={`flex-1 h-[48px] rounded-xl font-black text-sm uppercase tracking-wider transition-all ${recipeTab === "modifiers" ? "bg-white text-[#1D1D1F] shadow-sm" : "text-[#86868B]"}`}
                  onClick={() => setRecipeTab("modifiers")}
                >
                  POS Modifiers
                </button>
              </div>

              {/* --- TAB: BASE RECIPE --- */}
              {recipeTab === "base" && (
                <div className="space-y-6 animate-in fade-in">
                  <div className="space-y-3">
                    <Label className="text-[10px] font-black text-[#86868B] uppercase tracking-widest ml-1">Included Ingredients</Label>
                    {baseRecipe.length === 0 ? (
                      <div className="p-8 text-center bg-white rounded-[24px] border-2 border-dashed border-[#D2D2D7]">
                        <UtensilsCrossed size={32} className="mx-auto text-[#D2D2D7] mb-2" />
                        <p className="text-sm font-bold text-[#86868B]">No base ingredients logged.</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {baseRecipe.map((ing) => (
                          <div key={ing.inventory_id} className="p-4 bg-white rounded-[20px] shadow-sm flex justify-between items-center">
                            <div className="flex flex-col">
                              <span className="font-black text-[#1D1D1F] text-lg leading-tight">{ing.name}</span>
                              <span className="text-[10px] font-bold text-[#86868B] uppercase">Depletion Unit: {ing.uom}</span>
                            </div>
                            <div className="flex items-center gap-3">
                              <Input 
                                type="number"
                                className="w-[72px] h-[48px] rounded-xl text-center font-black bg-[#F5F5F7] border-none text-lg"
                                value={ing.quantity}
                                onChange={(e) => updateBaseQty(ing.inventory_id, Number(e.target.value))}
                              />
                              <button onClick={() => removeBaseIngredient(ing.inventory_id)} className="h-[48px] w-[48px] flex items-center justify-center text-[#FF3B30] active:bg-red-50 rounded-full transition-colors">
                                <Trash2 size={20} />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="space-y-3 pt-6 border-t border-[#D2D2D7]">
                    <Label className="text-[10px] font-black text-[#86868B] uppercase tracking-widest ml-1">Add from Inventory</Label>
                    <div className="grid grid-cols-1 gap-2">
                      {inventory.map((inv) => (
                        <button key={inv.id} onClick={() => addBaseIngredient(inv)} className="h-[60px] px-6 bg-white rounded-[20px] flex justify-between items-center shadow-sm active:scale-[0.98]">
                          <span className="font-bold text-[#1D1D1F]">{inv.name}</span>
                          <div className="h-8 w-8 bg-[#F5F5F7] rounded-full flex items-center justify-center"><Plus size={16} className="text-[#007AFF]" /></div>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* --- TAB: POS MODIFIERS --- */}
              {recipeTab === "modifiers" && (
                <div className="space-y-8 animate-in fade-in">
                  {modGroups.map((group) => (
                    <div key={group.id} className="p-5 bg-white rounded-[28px] shadow-sm border border-[#E5E5EA]">
                      
                      <div className="flex justify-between items-start mb-6">
                        <div className="flex-1 mr-4">
                          <Label className="text-[10px] font-black text-[#86868B] uppercase tracking-widest ml-1">Group Name</Label>
                          <Input 
                            value={group.name} 
                            onChange={(e) => updateModGroup(group.id, { name: e.target.value })}
                            className="h-[48px] font-black text-xl border-none bg-[#F5F5F7] mt-1"
                          />
                        </div>
                        <button onClick={() => deleteModGroup(group.id)} className="h-[48px] w-[48px] flex items-center justify-center text-[#FF3B30] bg-[#FF3B30]/10 rounded-full shrink-0">
                          <Trash2 size={20} />
                        </button>
                      </div>

                      <div className="flex items-center justify-between p-4 bg-[#F5F5F7] rounded-[20px] mb-6">
                        <div className="flex flex-col">
                          <span className="font-bold text-[#1D1D1F]">Required Selection</span>
                          <span className="text-[11px] text-[#86868B] font-bold leading-tight">Customer must choose an option</span>
                        </div>
                        <Switch checked={group.isRequired} onCheckedChange={(val) => { triggerHaptic(); updateModGroup(group.id, { isRequired: val }); }} />
                      </div>

                      <div className="space-y-3">
                        <Label className="text-[10px] font-black text-[#86868B] uppercase tracking-widest ml-1">Options mapped to inventory</Label>
                        {group.options.map(opt => (
                          <div key={opt.id} className="p-4 bg-[#F5F5F7] rounded-[20px] space-y-3 border border-[#D2D2D7]">
                            <div className="flex justify-between items-center">
                              <span className="font-black text-[#1D1D1F] text-lg">{opt.name}</span>
                              <button onClick={() => removeOption(group.id, opt.id)} className="text-[#FF3B30] active:scale-95"><X size={20}/></button>
                            </div>
                            <div className="flex gap-3">
                              <div className="flex-1">
                                <Label className="text-[10px] font-bold text-[#86868B] uppercase">Price Delta (+/-)</Label>
                                <div className="relative mt-1">
                                  <DollarSign size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#86868B]" />
                                  <Input type="number" value={opt.priceDelta} onChange={(e) => updateOption(group.id, opt.id, { priceDelta: Number(e.target.value) })} className="h-[44px] pl-8 font-bold border-[#D2D2D7]"/>
                                </div>
                              </div>
                              <div className="flex-1">
                                <Label className="text-[10px] font-bold text-[#86868B] uppercase">Deplete Qty ({opt.uom})</Label>
                                <Input type="number" value={opt.quantity} onChange={(e) => updateOption(group.id, opt.id, { quantity: Number(e.target.value) })} className="h-[44px] font-bold border-[#D2D2D7] mt-1"/>
                              </div>
                            </div>
                          </div>
                        ))}

                        <select 
                          className="w-full h-[56px] rounded-[20px] bg-white border-2 border-[#007AFF] text-[#007AFF] font-black text-center appearance-none mt-2"
                          onChange={(e) => {
                            const invItem = inventory.find(i => i.id === e.target.value);
                            if (invItem) addOptionToGroup(group.id, invItem);
                            e.target.value = ""; // reset
                          }}
                          value=""
                        >
                          <option value="" disabled>+ ADD MODIFIER FROM INVENTORY</option>
                          {inventory.map(inv => (
                            <option key={inv.id} value={inv.id}>{inv.name}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  ))}

                  <Button variant="outline" className="w-full h-[64px] rounded-[24px] border-dashed border-2 border-[#D2D2D7] text-[#1D1D1F] font-black text-lg active:scale-[0.98]" onClick={addModifierGroup}>
                    <Layers className="mr-2" size={20} /> CREATE NEW MODIFIER GROUP
                  </Button>

                </div>
              )}
            </div>
          </ScrollArea>

          {/* Builder Footer */}
          <div className="fixed bottom-0 left-0 w-full p-6 bg-white/90 backdrop-blur-xl border-t border-[#F2F2F7] z-20 animate-in slide-in-from-bottom">
            <Button 
              disabled={isProcessing}
              className="w-full h-[72px] text-xl font-black rounded-[24px] bg-[#1D1D1F] text-white shadow-2xl active:scale-[0.98] transition-transform"
              onClick={commitRecipeToLedger}
            >
              {isProcessing ? "Transmuting..." : "VAULT FULL RECIPE LOGIC"}
            </Button>
          </div>
        </div>
      )}

    </div>
  );
}