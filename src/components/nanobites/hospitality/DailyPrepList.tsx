/**
 * NANO-BITE: hosp.ft.ops.prep
 * ROLE: Daily Prep List Management
 * INDUSTRY: tertiary.hospitality.food_truck
 */

import React, { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { 
  Plus, 
  Trash2, 
  ChevronRight, 
  RotateCcw, 
  CheckCircle2, 
  AlertCircle,
  Clock,
  ClipboardList,
  History
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface PrepItem {
  id: string;
  item_name: string;
  quantity: number;
  uom: string;
  is_completed: boolean;
  assigned_to?: string;
  updated_at: string;
}

export default function DailyPrepList({ businessId }: { businessId: string }) {
  const [items, setItems] = useState<PrepItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdding, setIsTransitioning] = useState(false);
  const [newItem, setNewItem] = useState({ name: "", qty: "", uom: "oz" });

  // ─── DATA HYDRATION ────────────────────────────────────────────────────────
  const fetchPrepList = useCallback(async () => {
    console.log("[DATA_HYDRATION]: START - Fetching Daily Prep List for business:", businessId);
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("hosp_prep_lists" as any)
        .select("*")
        .eq("business_id", businessId)
        .order("created_at", { ascending: true });

      if (error) throw error;
      setItems(data || []);
      console.log("[DATA_HYDRATION]: END - Successfully hydrated", data?.length, "items.");
    } catch (err: any) {
      console.error("[DATA_HYDRATION]: ERROR - Silent stall avoided. Error details:", err.message);
      toast.error("Failed to load prep list");
    } finally {
      setLoading(false);
    }
  }, [businessId]);

  useEffect(() => {
    fetchPrepList();
  }, [fetchPrepList]);

  // ─── ACTIONS ───────────────────────────────────────────────────────────────

  const handleAddItem = async (e: React.FormEvent) => {
    e.preventDefault();
    console.log("[ACTION_TRIGGER]: START - Adding new prep item:", newItem.name);
    
    if (!newItem.name || !newItem.qty) {
      console.log("[ACTION_TRIGGER]: HALT - Mandatory fields missing.");
      return;
    }

    try {
      const payload = {
        business_id: businessId,
        item_name: newItem.name,
        quantity: parseFloat(newItem.qty),
        uom: newItem.uom,
        is_completed: false
      };

      const { data, error } = await supabase
        .from("hosp_prep_lists" as any)
        .insert([payload])
        .select();

      if (error) throw error;

      setItems((prev) => [...prev, ...data]);
      setNewItem({ name: "", qty: "", uom: "oz" });
      setIsTransitioning(false);
      
      // THE LAW: Haptic/Visual Feedback via Undo Toast
      toast.success("Prep item added", {
        action: { label: "Undo", onClick: () => handleDelete(data[0].id) }
      });

      console.log("[ACTION_TRIGGER]: END - Item successfully added to manifest.");
    } catch (err: any) {
      console.error("[ACTION_TRIGGER]: ERROR - Failed to append prep item:", err.message);
    }
  };

  const toggleStatus = async (id: string, currentStatus: boolean) => {
    console.log("[DATA_UPDATE]: START - Toggling status for node:", id);
    try {
      const { error } = await supabase
        .from("hosp_prep_lists" as any)
        .update({ is_completed: !currentStatus, updated_at: new Date().toISOString() })
        .eq("id", id);

      if (error) throw error;
      
      setItems(prev => prev.map(item => 
        item.id === id ? { ...item, is_completed: !currentStatus } : item
      ));
      console.log("[DATA_UPDATE]: END - Status synchronized with Hub.");
    } catch (err: any) {
      console.error("[DATA_UPDATE]: ERROR - Sync failure:", err.message);
    }
  };

  const handleDelete = async (id: string) => {
    // THE LAW: Require confirmation for deletion
    if (!window.confirm("Permanent delete? This action will be logged.")) return;
    
    console.log("[DATA_DELETE]: START - Removing node:", id);
    try {
      const { error } = await supabase.from("hosp_prep_lists" as any).delete().eq("id", id);
      if (error) throw error;
      setItems(prev => prev.filter(item => item.id !== id));
      toast.info("Item removed from prep list");
      console.log("[DATA_DELETE]: END - Node purged.");
    } catch (err: any) {
      console.error("[DATA_DELETE]: ERROR - Purge failure:", err.message);
    }
  };

  // ─── RENDER ────────────────────────────────────────────────────────────────

  if (loading) return (
    <div className="flex flex-col items-center justify-center p-12 space-y-4 animate-pulse">
      <RotateCcw className="h-8 w-8 text-[#86868B] animate-spin" />
      <span className="text-[11px] font-bold uppercase tracking-widest text-[#86868B]">Syncing Prep Manifest...</span>
    </div>
  );

  return (
    <div className="flex flex-col h-full bg-white relative pb-24">
      {/* THE LAW: Add Button top-right */}
      <div className="flex items-center justify-between p-4 bg-[#FBFBFD] border-b border-[#F2F2F7]">
        <div className="flex items-center gap-2">
          <ClipboardList className="h-5 w-5 text-[#007AFF]" />
          <span className="text-[15px] font-bold text-[#1D1D1F]">Daily Prep List</span>
        </div>
        <button 
          onClick={() => setIsTransitioning(true)}
          className="h-[44px] px-4 bg-[#007AFF] text-white rounded-full text-[13px] font-bold shadow-sm active:scale-95 transition-all flex items-center gap-1"
        >
          <Plus size={18} /> Add Item
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
        {items.length === 0 && (
          <div className="text-center py-20">
            <Clock className="h-12 w-12 text-[#E5E5E7] mx-auto mb-4" />
            <p className="text-[14px] font-medium text-[#86868B]">Daily list is empty.</p>
          </div>
        )}

        {/* THE LAW: Single-Column Layout / Grouped Fields */}
        {items.map((item) => (
          <Card 
            key={item.id} 
            className={cn(
              "border-[#F2F2F7] shadow-none rounded-[20px] transition-all",
              item.is_completed ? "bg-[#FBFBFD] opacity-60" : "bg-white"
            )}
          >
            <CardContent className="p-4 flex items-center justify-between min-h-[72px]">
              <div className="flex flex-col flex-1">
                <span className={cn(
                  "text-[15px] font-bold leading-tight",
                  item.is_completed ? "line-through text-[#86868B]" : "text-[#1D1D1F]"
                )}>
                  {item.item_name}
                </span>
                <div className="flex items-center gap-2 mt-1">
                  <Badge variant="outline" className="text-[10px] uppercase font-bold tracking-wider px-2 border-[#F2F2F7] text-[#86868B]">
                    {item.quantity} {item.uom}
                  </Badge>
                  <span className="text-[10px] text-[#D2D2D7] font-medium flex items-center gap-1">
                    <History size={10} /> {new Date(item.updated_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-4">
                {/* THE LAW: 44px Edit/Delete targets */}
                <button 
                  onClick={() => handleDelete(item.id)}
                  className="w-[44px] h-[44px] flex items-center justify-center text-[#FF3B30] active:scale-90"
                >
                  <Trash2 size={20} />
                </button>
                {/* THE LAW: Toggles over Checkboxes */}
                <Switch 
                  checked={item.is_completed}
                  onCheckedChange={() => toggleStatus(item.id, item.is_completed)}
                  className="data-[state=checked]:bg-[#34C759]"
                />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* THE LAW: Bottom-Weighted Action (Thumb Zone) */}
      <div className="absolute bottom-0 left-0 right-0 p-4 bg-white/90 backdrop-blur-md border-t border-[#F2F2F7] z-20">
        <button 
          onClick={() => toast.success("Daily manifest finalized and vaulted.")}
          disabled={items.length === 0}
          className="w-full h-[64px] bg-[#1D1D1F] text-white text-[17px] font-bold rounded-[22px] flex items-center justify-center gap-2 active:scale-[0.98] transition-all shadow-xl disabled:opacity-30"
        >
          <CheckCircle2 size={20} /> Finalize Manifest
        </button>
      </div>

      {/* ADD ITEM DRAWER (Emulated Form Wizard State) */}
      {isAdding && (
        <div className="absolute inset-0 bg-white z-50 p-6 flex flex-col slide-in-bottom">
          <div className="flex justify-between items-center mb-8">
            <h3 className="text-xl font-bold">New Prep Requirement</h3>
            <Button variant="ghost" onClick={() => setIsTransitioning(false)} className="rounded-full h-10 w-10 p-0">
              <X className="h-6 w-6" />
            </Button>
          </div>

          <form onSubmit={handleAddItem} className="space-y-6">
            <div className="space-y-2">
              <Label className="text-[13px] font-bold ml-1">Item Name *</Label>
              <Input 
                autoFocus
                placeholder="e.g. Diced Onions"
                value={newItem.name}
                onChange={(e) => setNewItem({...newItem, name: e.target.value})}
                className="h-[56px] rounded-[16px] bg-[#FBFBFD] border-[#F2F2F7] text-[16px]"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-[13px] font-bold ml-1">Target Quantity *</Label>
                <Input 
                  type="number"
                  placeholder="0.00"
                  value={newItem.qty}
                  onChange={(e) => setNewItem({...newItem, qty: e.target.value})}
                  className="h-[56px] rounded-[16px] bg-[#FBFBFD] border-[#F2F2F7] text-[16px]"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-[13px] font-bold ml-1">Unit</Label>
                <select 
                  value={newItem.uom}
                  onChange={(e) => setNewItem({...newItem, uom: e.target.value})}
                  className="w-full h-[56px] rounded-[16px] bg-[#FBFBFD] border border-[#F2F2F7] px-4 font-bold text-[16px] appearance-none"
                >
                  <option value="oz">Ounces (oz)</option>
                  <option value="lb">Pounds (lb)</option>
                  <option value="qt">Quarts (qt)</option>
                  <option value="gal">Gallons (gal)</option>
                  <option value="ct">Count (ct)</option>
                </select>
              </div>
            </div>

            <div className="pt-8">
              <button 
                type="submit"
                className="w-full h-[64px] bg-[#007AFF] text-white text-[17px] font-bold rounded-[22px] shadow-lg active:scale-95 transition-all"
              >
                Confirm Requirement
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

const X = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className={className}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
  </svg>
);