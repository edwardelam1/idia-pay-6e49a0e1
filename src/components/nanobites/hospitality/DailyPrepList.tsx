/** * NANO-BITE ID: hosp.ft.ops.prep
 * NANO-BITE NAME: DailyPrepList
 * ROLE: Daily 
 * INDUSTRY: tertiary.hospitality.food_truck 
 */

import React, { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { 
  ClipboardList, Plus, Trash2, CheckCircle2, 
  ChevronLeft, X, Calculator, Truck, Search, Info
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";

// ============================================================================
// STRICT DATA SCHEMAS
// ============================================================================
export interface PrepItem {
  location: string; 
  item_name: string;
  unit: string;
  on_hand: number;
  par_level: number;
  need: number;
  station: 'Cold' | 'Griddle' | 'Assembly';
}

export default function DailyPrepList({ businessId = "default" }: { businessId?: string }) {
  const [logs, setLogs] = useState<PrepItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState<"list" | "entry">("list");
  const [isProcessing, setIsProcessing] = useState(false);

  const [formData, setFormData] = useState({
    location: "",
    item_name: "",
    unit: "Pans",
    on_hand: 0,
    par_level: 0,
    station: "Cold" as 'Cold' | 'Griddle' | 'Assembly'
  });

  const triggerHaptic = useCallback((type: 'light' | 'heavy' = 'light') => {
    try {
      if (typeof window !== 'undefined' && window.navigator?.vibrate) {
        window.navigator.vibrate(type === 'heavy' ? [50, 50, 50] : 50);
      }
    } catch (e) { /* Hardware Agnostic */ }
  }, []);

  // ============================================================================
  // DISCOVERY LOGIC: LIQUID OS ARTIFACT RESOLUTION
  // ============================================================================
  const discoveryEngine = async () => {
    console.log(`[DISCOVERY_START]: Resonating for Daily Prep List at: ${businessId}`);
    setLoading(true);
    
    try {
      // 1. Resolve list mapping from the Registry (Supabase Map)
      const { data, error } = await (supabase.from('daily_prep_list' as any)
        .select('*')
        .eq('business_id', businessId) as any);

      if (error) throw error;

      // 2. Hydrate local state with derived 'Need' logic
      const artifactMapping = (data || []).map((item: any) => ({
        ...item,
        need: Math.max(0, item.par_level - item.on_hand)
      }));

      setLogs(artifactMapping);
      console.log(`[DISCOVERY_SUCCESS]: ${artifactMapping.length} artifacts materialized from ledger.`);
    } catch (err: any) {
      console.error(`[DISCOVERY_STALL]: Daily Prep List failed: ${err.message}`);
      toast.error("Discovery Failed: Artifact registry unreachable.");
    } finally {
      setLoading(false);
      console.log(`[DISCOVERY_END]: Discovery cycle terminated.`);
    }
  };

  useEffect(() => {
    if (businessId !== "default") discoveryEngine();
  }, [businessId]);

  // ============================================================================
  // TRANSACTIONS: LEDGER COMMITMENT
  // ============================================================================
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    console.log("[TRANSACTION_START]: Committing Prep Artifact to Ledger.");
    setIsProcessing(true);
    triggerHaptic();

    try {
      const payload = {
        business_id: businessId,
        location: formData.location.trim().toUpperCase(),
        item_name: formData.item_name,
        unit: formData.unit,
        on_hand: formData.on_hand,
        par_level: formData.par_level,
        station: formData.station,
        created_at: new Date().toISOString()
      };

      const { data, error } = await (supabase.from('daily_prep_list' as any)
        .insert([payload])
        .select()
        .single() as any);

      if (error) throw error;

      setLogs(prev => [...prev, { ...data, need: Math.max(0, data.par_level - data.on_hand) }]);
      setStep("list");
      console.log(`[TRANSACTION_DATA]: Artifact ${data.location} vaulted successfully.`);
      toast.success("List Archived.");
    } catch (err: any) {
      console.error("[TRANSACTION_STALL]: Vaulting failed:", err.message);
      toast.error("Stall: Failed to commit to ledger.");
    } finally {
      setIsProcessing(false);
      console.log("[TRANSACTION_END]: Sequence closed.");
    }
  };

  const syncToCommissary = async () => {
    console.log("[INTEGRATION_START]: Pushing Demand Signal to Commissary Restock.");
    setIsProcessing(true);
    triggerHaptic('heavy');

    try {
      const demandItems = logs.filter(item => item.need > 0).map(item => ({
        business_id: businessId,
        item_name: item.item_name,
        quantity_needed: item.need,
        unit: item.unit,
        source: 'Daily_Prep_List',
        status: 'pending_restock'
      }));

      if (demandItems.length === 0) {
        toast.info("Demand Signal Null: All Pars met.");
        return;
      }

      const { error } = await (supabase.from('inventory_demand' as any).insert(demandItems) as any);
      if (error) throw error;

      toast.success("Demand vaulted to Commissary Restock.");
    } catch (err: any) {
      console.error("[INTEGRATION_STALL]: Egress failed:", err.message);
      toast.error("Sync Stall: Commissary ledger unreachable.");
    } finally {
      setIsProcessing(false);
    }
  };

  // ============================================================================
  // RENDER: THE LAW (44px Targets, Single Column, Labels Above)
  // ============================================================================
  if (loading) return <div className="h-screen flex items-center justify-center animate-pulse font-black text-xs uppercase tracking-widest text-[#86868B]">Resonating Registry...</div>;

  return (
    <div className="flex flex-col h-screen bg-[#F5F5F7] relative overflow-hidden">
      
      {/* HEADER: Action Button Top Right */}
      <div className="pt-10 pb-4 px-6 bg-white border-b flex justify-between items-center z-10 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 bg-[#1D1D1F] text-white rounded-xl flex items-center justify-center">
            <ClipboardList size={22} />
          </div>
          <div className="flex flex-col">
            <h1 className="text-xl font-black tracking-tighter text-[#1D1D1F]">DPL</h1>
            <span className="text-[10px] font-bold text-[#86868B] uppercase tracking-[0.12em]">Daily Prep List</span>
          </div>
        </div>
        <Button 
          onClick={() => { triggerHaptic(); setStep("entry"); }}
          className="h-11 rounded-full bg-[#1D1D1F] text-white font-bold px-6 shadow-md"
        >
          <Plus className="mr-2 h-4 w-4" /> Add Item
        </Button>
      </div>

      <ScrollArea className="flex-1 w-full">
        <div className="p-4 pb-[200px] space-y-3">
          {logs.map((item) => (
            <Card key={item.location} className="border-none shadow-sm rounded-[24px] overflow-hidden bg-white">
              <CardContent className="p-6 flex justify-between items-center">
                <div className="flex flex-col">
                  <span className="text-[11px] font-black text-[#007AFF] uppercase tracking-wider">{item.station}</span>
                  <h3 className="text-2xl font-black text-[#1D1D1F] mt-1">{item.item_name}</h3>
                  <div className="flex items-center gap-2 mt-2 text-[#86868B] font-bold text-sm">
                    <Calculator size={14} /> {item.on_hand} / {item.par_level} {item.unit}
                  </div>
                </div>
                <div className={`flex flex-col items-end ${item.need > 0 ? 'text-[#FF3B30]' : 'text-[#34C759]'}`}>
                  <span className="text-[10px] font-black uppercase tracking-widest">Need</span>
                  <span className="text-4xl font-black leading-none mt-1">{item.need}</span>
                </div>
              </CardContent>
              {/* THE LAW: 44px Interaction Target */}
              <div className="flex h-[56px] border-t border-[#F2F2F7]">
                <button className="flex-1 text-[13px] font-black uppercase text-[#1D1D1F] active:bg-[#F5F5F7]">Calibrate Par</button>
              </div>
            </Card>
          ))}
        </div>
      </ScrollArea>

      {/* FOOTER: Bottom-Weighted Action (Thumb Zone) */}
      <div className="fixed bottom-0 left-0 w-full p-6 bg-white/90 backdrop-blur-xl border-t border-[#F2F2F7] z-20 flex flex-col gap-3">
        <div className="flex items-center gap-2 px-2 text-[#86868B]">
          <Info size={14} />
          <span className="text-[11px] font-bold uppercase tracking-tight">Egress: Commissary Restock Ledger</span>
        </div>
        <Button 
          disabled={isProcessing || logs.length === 0}
          className="w-full h-[72px] text-xl font-black rounded-[24px] bg-[#007AFF] text-white shadow-2xl active:scale-[0.98] transition-transform"
          onClick={syncToCommissary}
        >
          {isProcessing ? "Transmitting..." : "VAULT DEMAND SIGNAL"}
        </Button>
      </div>

      {/* ============================================================================
          FORM ENTRY: THE LAW (Labels Above, Single Column)
          ============================================================================ */}
      {step === "entry" && (
        <div className="absolute inset-0 bg-white z-50 flex flex-col animate-in slide-in-from-bottom">
          <header className="p-6 border-b flex justify-between items-center">
            <h2 className="text-2xl font-black tracking-tighter">Log Demand Artifact</h2>
            <Button variant="ghost" className="h-12 w-12 rounded-full p-0 bg-[#F5F5F7]" onClick={() => setStep("list")}>
              <X size={24} />
            </Button>
          </header>

          <ScrollArea className="flex-1">
            <form onSubmit={handleSubmit} className="p-6 space-y-8 pb-32">
              <div className="space-y-3">
                <Label className="text-xs font-black text-[#86868B] uppercase tracking-widest ml-1">Location Identifier *</Label>
                <Input 
                  className="h-[60px] rounded-2xl text-xl font-bold border-2" 
                  placeholder="e.g. UNIT-01-A"
                  value={formData.location}
                  onChange={(e) => setFormData({...formData, location: e.target.value})}
                />
              </div>

              <div className="space-y-3">
                <Label className="text-xs font-black text-[#86868B] uppercase tracking-widest ml-1">Item Name *</Label>
                <Input 
                  className="h-[60px] rounded-2xl text-xl font-bold border-2" 
                  placeholder="e.g. Marinated Steak"
                  value={formData.item_name}
                  onChange={(e) => setFormData({...formData, item_name: e.target.value})}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-3">
                  <Label className="text-xs font-black text-[#86868B] uppercase tracking-widest ml-1">On Hand</Label>
                  <Input type="number" className="h-[60px] rounded-2xl text-xl font-bold border-2" value={formData.on_hand} onChange={(e) => setFormData({...formData, on_hand: Number(e.target.value)})}/>
                </div>
                <div className="space-y-3">
                  <Label className="text-xs font-black text-[#86868B] uppercase tracking-widest ml-1">Par Level *</Label>
                  <Input type="number" className="h-[60px] rounded-2xl text-xl font-bold border-2" value={formData.par_level} onChange={(e) => setFormData({...formData, par_level: Number(e.target.value)})}/>
                </div>
              </div>

              <div className="space-y-3">
                <Label className="text-xs font-black text-[#86868B] uppercase tracking-widest ml-1">Production Station</Label>
                <select 
                  className="w-full h-[60px] rounded-2xl border-2 px-4 text-lg font-bold bg-white appearance-none"
                  value={formData.station}
                  onChange={(e) => setFormData({...formData, station: e.target.value as any})}
                >
                  <option value="Cold">Cold Prep</option>
                  <option value="Griddle">Griddle</option>
                  <option value="Assembly">Assembly</option>
                </select>
              </div>
            </form>
          </ScrollArea>

          <div className="fixed bottom-0 left-0 w-full p-6 bg-white border-t z-50">
            {/* Syntax Error Resolved: Added handleSubmit trigger */}
            <Button 
              className="w-full h-[72px] text-2xl font-black rounded-[24px] bg-[#1D1D1F] text-white shadow-2xl"
              onClick={handleSubmit}
              disabled={isProcessing}
            >
              {isProcessing ? "Vauling..." : "LOG ARTIFACT"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}