/**
 * NANO-BITE ID: hosp.ft.infra.health
 * NANO-BITE NAME: Health Permit Log
 * ROLE: Daily 
 * INDUSTRY: tertiary.hospitality.food_truck
 */

import React, { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { 
  FileText, 
  Plus, 
  Trash2, 
  CheckCircle2, 
  AlertCircle, 
  Calendar, 
  User, 
  History,
  ShieldCheck,
  X
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface HealthLog {
  id: string;
  permit_number: string;
  expiration_date: string;
  is_valid: boolean;
  inspector_name: string;
  notes: string;
  created_at: string;
}

export default function HealthPermitLog({ businessId }: { businessId: string }) {
  const [logs, setLogs] = useState<HealthLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [formData, setFormData] = useState({
    permit_number: "",
    expiration_date: "",
    inspector_name: "",
    notes: "",
    is_valid: true
  });

  // ─── DATA HYDRATION ────────────────────────────────────────────────────────
  useEffect(() => {
    const fetchLogs = async () => {
      console.log("[DATA_HYDRATION]: START - Fetching Health Permit Logs");
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from("hosp_health_logs" as any)
          .select("*")
          .eq("business_id", businessId)
          .order("created_at", { ascending: false });

        if (error) throw error;
        setLogs(data || []);
        console.log("[DATA_HYDRATION]: END - Success");
      } catch (err: any) {
        console.error("[DATA_HYDRATION]: ERROR -", err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchLogs();
  }, [businessId]);

  // ─── ACTIONS ───────────────────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    console.log("[ACTION_TRIGGER]: START - Submitting Health Permit Log");
    
    if (!formData.permit_number || !formData.expiration_date) {
      toast.error("Permit Number and Expiration are mandatory.");
      return;
    }

    try {
      const { data, error } = await supabase
        .from("hosp_health_logs" as any)
        .insert([{ ...formData, business_id: businessId }])
        .select();

      if (error) throw error;

      setLogs([data[0], ...logs]);
      setIsAdding(false);
      setFormData({ permit_number: "", expiration_date: "", inspector_name: "", notes: "", is_valid: true });
      
      toast.success("Health permit log synchronized", {
        action: { label: "Undo", onClick: () => handleDelete(data[0].id) }
      });
      console.log("[ACTION_TRIGGER]: END - Log success");
    } catch (err: any) {
      console.error("[ACTION_TRIGGER]: ERROR -", err.message);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("Permanent delete? This action will be audited.")) return;
    
    console.log("[DATA_DELETE]: START - Removing record", id);
    try {
      const { error } = await supabase.from("hosp_health_logs" as any).delete().eq("id", id);
      if (error) throw error;
      setLogs(logs.filter(l => l.id !== id));
      toast.info("Log entry removed");
      console.log("[DATA_DELETE]: END - Record purged");
    } catch (err: any) {
      console.error("[DATA_DELETE]: ERROR - Purge failure", err.message);
    }
  };

  if (loading) return <div className="p-12 text-center animate-pulse font-bold text-[#86868B] text-[11px] uppercase tracking-widest">Syncing Infrastructure...</div>;

  return (
    <div className="flex flex-col h-full bg-white relative pb-24">
      {/* THE LAW: Add Button Top-Right */}
      <div className="flex items-center justify-between p-4 bg-[#FBFBFD] border-b border-[#F2F2F7]">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-[#007AFF]" />
          <span className="text-[15px] font-bold text-[#1D1D1F]">Health Permit Log</span>
        </div>
        <button 
          onClick={() => setIsAdding(true)}
          className="h-[44px] px-4 bg-[#007AFF] text-white rounded-full text-[13px] font-bold active:scale-95 transition-all flex items-center gap-1 shadow-sm"
        >
          <Plus size={18} /> New Log
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
        {logs.length === 0 && (
          <div className="text-center py-20">
            <FileText className="h-12 w-12 text-[#E5E5E7] mx-auto mb-4" />
            <p className="text-[14px] font-medium text-[#86868B]">No health logs found.</p>
          </div>
        )}

        {/* THE LAW: Single-Column List */}
        {logs.map((log) => (
          <Card key={log.id} className="border-[#F2F2F7] shadow-none rounded-[20px] bg-white">
            <CardContent className="p-4 flex items-center justify-between min-h-[80px]">
              <div className="flex flex-col flex-1 gap-1">
                <div className="flex items-center gap-2">
                  <span className="text-[15px] font-bold text-[#1D1D1F]">#{log.permit_number}</span>
                  {log.is_valid ? (
                    <Badge className="bg-[#34C759]/10 text-[#34C759] border-none text-[10px] uppercase font-bold">Valid</Badge>
                  ) : (
                    <Badge className="bg-[#FF3B30]/10 text-[#FF3B30] border-none text-[10px] uppercase font-bold">Expired</Badge>
                  )}
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1">
                  <div className="flex items-center gap-1.5 text-[12px] text-[#86868B] font-medium">
                    <Calendar size={13} /> Exp: {new Date(log.expiration_date).toLocaleDateString()}
                  </div>
                  <div className="flex items-center gap-1.5 text-[12px] text-[#86868B] font-medium">
                    <User size={13} /> {log.inspector_name || "Self-Report"}
                  </div>
                </div>
              </div>

              {/* THE LAW: 44px Delete Target */}
              <button 
                onClick={() => handleDelete(log.id)}
                className="w-[44px] h-[44px] flex items-center justify-center text-[#FF3B30] active:scale-90"
              >
                <Trash2 size={20} />
              </button>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* THE LAW: Bottom-Weighted Action (Thumb Zone) */}
      <div className="absolute bottom-0 left-0 right-0 p-4 bg-white/90 backdrop-blur-md border-t border-[#F2F2F7] z-20">
        <button 
          onClick={() => toast.success("Infrastructure status vaulted to Hub.")}
          className="w-full h-[64px] bg-[#1D1D1F] text-white text-[17px] font-bold rounded-[22px] flex items-center justify-center gap-2 active:scale-[0.98] shadow-xl"
        >
          <CheckCircle2 size={20} /> Vault Status
        </button>
      </div>

      {/* THE LAW: Form Wizard / Drawer Entry */}
      {isAdding && (
        <div className="absolute inset-0 bg-white z-50 p-6 flex flex-col slide-in-bottom">
          <div className="flex justify-between items-center mb-8">
            <h3 className="text-xl font-bold">Infrastructure Entry</h3>
            <Button variant="ghost" onClick={() => setIsAdding(false)} className="rounded-full h-10 w-10 p-0">
              <X className="h-6 w-6" />
            </Button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* THE LAW: Labels ABOVE Inputs */}
            <div className="space-y-2">
              <Label className="text-[13px] font-bold ml-1">Permit Number *</Label>
              <Input 
                autoFocus
                placeholder="ABC-12345"
                value={formData.permit_number}
                onChange={(e) => setFormData({...formData, permit_number: e.target.value})}
                className="h-[56px] rounded-[16px] bg-[#FBFBFD] border-[#F2F2F7] text-[16px]"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-[13px] font-bold ml-1">Expiration Date *</Label>
                <Input 
                  type="date"
                  value={formData.expiration_date}
                  onChange={(e) => setFormData({...formData, expiration_date: e.target.value})}
                  className="h-[56px] rounded-[16px] bg-[#FBFBFD] border-[#F2F2F7] text-[16px]"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-[13px] font-bold ml-1">Status</Label>
                <div className="h-[56px] flex items-center justify-between px-4 bg-[#FBFBFD] border border-[#F2F2F7] rounded-[16px]">
                  <span className="text-[14px] font-medium">Valid</span>
                  {/* THE LAW: Switch over Checkbox */}
                  <Switch 
                    checked={formData.is_valid}
                    onCheckedChange={(checked) => setFormData({...formData, is_valid: checked})}
                  />
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-[13px] font-bold ml-1">Inspector Name</Label>
              <Input 
                placeholder="Name or Agency"
                value={formData.inspector_name}
                onChange={(e) => setFormData({...formData, inspector_name: e.target.value})}
                className="h-[56px] rounded-[16px] bg-[#FBFBFD] border-[#F2F2F7] text-[16px]"
              />
            </div>

            <div className="pt-8">
              <button 
                type="submit"
                className="w-full h-[64px] bg-[#007AFF] text-white text-[17px] font-bold rounded-[22px] shadow-lg active:scale-95 transition-all"
              >
                Log Infrastructure
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}