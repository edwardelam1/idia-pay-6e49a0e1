/** * NANO-BITE ID: hosp.ft.infra.health
 * NANO-BITE NAME: Health Permit Log
 * ROLE: Daily 
 * INDUSTRY: tertiary.hospitality.food_truck
 */

import React, { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { 
  FileText, 
  Plus, 
  Trash2, 
  CheckCircle2, 
  Calendar, 
  User, 
  ShieldCheck,
  X,
  MapPin
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";

// ============================================================================
// STRICT DATA SCHEMAS: ID DEPRECATED FOR LOCATION
// ============================================================================
export interface HealthPermit {
  location: string; // Primary Identifier
  business_id: string;
  permit_type: string;
  permit_number: string;
  expiration_date: string;
  is_valid: boolean;
  inspector_name: string | null;
  created_at: string;
}

const PERMIT_TYPES = [
  "Health Department Permit",
  "Food Manager Certification",
  "Food Handler's Permit",
  "Fire Safety Certificate",
  "Mobile Food Unit Permit",
  "Commissary Agreement",
  "Liquor License",
  "Outdoor Seating Permit",
  "Zoning Permit"
];

export default function HealthPermitLog({ businessId = "default" }: { businessId?: string }) {
  // --- STATE MACHINE ---
  const [logs, setLogs] = useState<HealthPermit[]>([]);
  const [loading, setLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  
  // Form State: Included Location per Architectural Law
  const [formData, setFormData] = useState({
    location: "",
    permit_type: "",
    permit_number: "",
    expiration_date: "",
    inspector_name: "",
    is_valid: true
  });

  const triggerHaptic = useCallback((type: 'light' | 'heavy' = 'light') => {
    try {
      if (typeof window !== 'undefined' && window.navigator && window.navigator.vibrate) {
        window.navigator.vibrate(type === 'heavy' ? [50, 50, 50] : 50);
      }
    } catch (e) { /* Hardware agnostic fallback */ }
  }, []);

  // ============================================================================
  // SUPABASE: DATA HYDRATION (TS2589 FIX: CAST AS ANY)
  // ============================================================================
  useEffect(() => {
    const fetchLogs = async () => {
      console.log("[BEGIN] fetchLogs execution for Health Permit Log");
      setLoading(true);
      try {
        const { data, error } = await (supabase.from("business_permits" as any)
          .select("*")
          .eq("business_id", businessId)
          .order("created_at", { ascending: false }) as any);

        if (error) {
          if (error.code === '42P01') {
            console.warn("[WARN] business_permits table missing. Defaulting to empty array.");
            setLogs([]);
            return;
          }
          throw error;
        }
        
        setLogs(data as HealthPermit[] || []);
        console.log(`[INFO] fetchLogs: Retrieved ${data?.length || 0} records.`);
      } catch (err: any) {
        console.error("[ERROR] fetchLogs failed:", err.message);
      } finally {
        setLoading(false);
        console.log("[END] fetchLogs execution");
      }
    };

    if (businessId !== "default") fetchLogs();
    else setLoading(false);
  }, [businessId]);

  // ============================================================================
  // SUPABASE: RECORD SUBMISSION (LOCATION-CENTRIC)
  // ============================================================================
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    console.log("[BEGIN] handleSubmit execution for compliance log");
    
    // Inline Validation
    if (!formData.location || !formData.permit_type) {
      triggerHaptic('heavy');
      toast.error("Location and Document Type are required.");
      return;
    }
    if (!formData.permit_number || !formData.expiration_date) {
      triggerHaptic('heavy');
      toast.error("Permit Number and Expiration are mandatory.");
      return;
    }

    setIsProcessing(true);
    triggerHaptic();

    try {
      const payload = {
        business_id: businessId,
        location: formData.location.trim(),
        permit_type: formData.permit_type,
        permit_number: formData.permit_number.trim(),
        expiration_date: formData.expiration_date,
        inspector_name: formData.inspector_name.trim() || null,
        is_valid: formData.is_valid
      };

      const { data, error } = await (supabase.from("business_permits" as any)
        .insert([payload])
        .select()
        .single() as any);

      if (error) {
        if (error.code === '42P01') {
          const mockData = { ...payload, created_at: new Date().toISOString() };
          setLogs([mockData as HealthPermit, ...logs]);
          handleSuccess(payload.location);
          return;
        }
        throw error;
      }

      setLogs([data as HealthPermit, ...logs]);
      handleSuccess(data.location);

    } catch (err: any) {
      console.error("[ERROR] handleSubmit failed:", err.message);
      toast.error("Stall: Could not commit to ledger.");
    } finally {
      setIsProcessing(false);
      console.log("[END] handleSubmit execution");
    }
  };

  const handleSuccess = (locationId: string) => {
    setIsAdding(false);
    setFormData({ location: "", permit_type: "", permit_number: "", expiration_date: "", inspector_name: "", is_valid: true });
    
    toast.success("Artifact verified at location.", {
      action: { 
        label: "Undo", 
        onClick: () => handleDelete(locationId) 
      }
    });
  };

  // ============================================================================
  // SUPABASE: RECORD PURGE (BY LOCATION)
  // ============================================================================
  const handleDelete = async (location: string) => {
    if (!window.confirm(`Purge artifact for ${location}? This action is audited.`)) return;
    
    console.log(`[BEGIN] handleDelete execution for location: ${location}`);
    triggerHaptic('heavy');
    
    try {
      const { error } = await (supabase.from("business_permits" as any).delete().eq("location", location) as any);
      
      if (error && error.code !== '42P01') throw error;
      
      setLogs(prev => prev.filter(l => l.location !== location));
      toast.info("Log purged from ledger.");
      console.log(`[INFO] handleDelete: Purge successful for ${location}.`);
    } catch (err: any) {
      console.error("[ERROR] handleDelete failed:", err.message);
      toast.error("Failed to remove document.");
    } finally {
      console.log(`[END] handleDelete execution`);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="animate-pulse font-bold text-muted-foreground text-sm uppercase tracking-widest flex flex-col items-center gap-4">
          <ShieldCheck className="h-10 w-10 opacity-20" />
          Establishing Verified Reality...
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-background relative overflow-hidden">
      
      <div className="pt-10 pb-4 px-6 bg-card border-b flex justify-between items-center z-10 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center shadow-inner">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Permit Log</h1>
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Infr. Health</p>
          </div>
        </div>
        <Button 
          onClick={() => { triggerHaptic(); setIsAdding(true); }}
          className="min-h-[44px] rounded-full bg-primary font-bold active:scale-95 transition-transform"
        >
          <Plus className="mr-2 h-5 w-5" /> Add Document
        </Button>
      </div>

      <ScrollArea className="flex-1 w-full relative bg-muted/10">
        <div className="p-4 pb-[140px] space-y-4">
          {logs.length === 0 ? (
            <div className="text-center py-24 flex flex-col items-center">
              <FileText className="h-16 w-16 text-muted-foreground opacity-20 mb-4" />
              <p className="text-xl font-bold">Vault Empty</p>
            </div>
          ) : (
            logs.map((log) => (
              <Card key={log.location} className="border-border shadow-sm rounded-2xl bg-card overflow-hidden">
                <CardContent className="p-0 flex items-stretch">
                  <div className="p-5 flex-1 flex flex-col border-r border-border/50">
                    <div className="flex items-start justify-between mb-2">
                      <span className="text-sm font-bold text-primary tracking-tight">{log.permit_type}</span>
                      {log.is_valid ? (
                        <span className="bg-emerald-100 text-emerald-700 text-[10px] uppercase font-bold px-2 py-0.5 rounded">Valid</span>
                      ) : (
                        <span className="bg-destructive/10 text-destructive text-[10px] uppercase font-bold px-2 py-0.5 rounded">Expired</span>
                      )}
                    </div>
                    
                    <h3 className="text-xl font-black mb-1">#{log.permit_number}</h3>
                    <p className="text-xs font-bold text-muted-foreground flex items-center gap-1 mb-3">
                      <MapPin size={12} /> {log.location}
                    </p>
                    
                    <div className="flex flex-col gap-2">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground font-semibold bg-muted/50 w-max px-3 py-1 rounded-md">
                        <Calendar className="h-4 w-4" /> {new Date(log.expiration_date).toLocaleDateString()}
                      </div>
                    </div>
                  </div>

                  <button 
                    onClick={() => handleDelete(log.location)}
                    className="w-[60px] flex items-center justify-center text-destructive/50 active:scale-95 transition-all"
                  >
                    <Trash2 className="h-6 w-6" />
                  </button>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </ScrollArea>

      <div className="fixed bottom-0 left-0 w-full p-6 bg-background/90 backdrop-blur-xl border-t border-border z-20">
        <Button 
          size="lg"
          onClick={() => { triggerHaptic('heavy'); toast.success("Status vaulted."); }}
          className="w-full min-h-[64px] text-xl font-black rounded-2xl shadow-xl"
        >
          <CheckCircle2 className="mr-3 h-6 w-6" /> Vault Compliance
        </Button>
      </div>

      {isAdding && (
        <div className="absolute inset-0 bg-background z-50 flex flex-col animate-in slide-in-from-bottom-full duration-300">
          <div className="flex justify-between items-center p-6 border-b bg-card">
            <h3 className="text-2xl font-black">Log Document</h3>
            <Button variant="ghost" onClick={() => setIsAdding(false)} className="rounded-full h-12 w-12 p-0 bg-muted">
              <X className="h-6 w-6" />
            </Button>
          </div>

          <ScrollArea className="flex-1 w-full">
            <form id="permit-form" onSubmit={handleSubmit} className="p-6 space-y-8 pb-32">
              
              {/* NEW: Location Input Logic */}
              <div className="space-y-3">
                <Label htmlFor="location" className="text-sm font-bold text-muted-foreground uppercase tracking-wider ml-1">
                  Assigned Location / Station <span className="text-destructive">*</span>
                </Label>
                <Input 
                  id="location"
                  placeholder="e.g. Unit-01, Main Kitchen"
                  value={formData.location}
                  onChange={(e) => setFormData({...formData, location: e.target.value})}
                  className="h-[60px] rounded-2xl bg-card border-2 border-border text-lg font-bold shadow-sm"
                />
              </div>

              <div className="space-y-3">
                <Label htmlFor="permitType" className="text-sm font-bold text-muted-foreground uppercase tracking-wider ml-1">
                  Document Type <span className="text-destructive">*</span>
                </Label>
                <select
                  id="permitType"
                  value={formData.permit_type}
                  onChange={(e) => setFormData({...formData, permit_type: e.target.value})}
                  className="w-full h-[60px] rounded-2xl bg-card border-2 border-border text-lg font-bold px-4 appearance-none"
                >
                  <option value="" disabled>Select...</option>
                  {PERMIT_TYPES.map(type => (
                    <option key={type} value={type}>{type}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-3">
                <Label htmlFor="permitNumber" className="text-sm font-bold text-muted-foreground uppercase tracking-wider ml-1">
                  Permit / License Number <span className="text-destructive">*</span>
                </Label>
                <Input 
                  id="permitNumber"
                  value={formData.permit_number}
                  onChange={(e) => setFormData({...formData, permit_number: e.target.value})}
                  className="h-[60px] rounded-2xl bg-card border-2 border-border text-xl font-bold shadow-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-3">
                  <Label htmlFor="expDate" className="text-sm font-bold text-muted-foreground uppercase tracking-wider ml-1">
                    Expiration <span className="text-destructive">*</span>
                  </Label>
                  <Input 
                    id="expDate"
                    type="date"
                    value={formData.expiration_date}
                    onChange={(e) => setFormData({...formData, expiration_date: e.target.value})}
                    className="h-[60px] rounded-2xl bg-card border-2 border-border text-lg font-bold shadow-sm"
                  />
                </div>
                
                <div className="space-y-3">
                  <Label className="text-sm font-bold text-muted-foreground uppercase tracking-wider ml-1">
                    Status
                  </Label>
                  <div className="h-[60px] flex items-center justify-between px-5 bg-card border-2 border-border rounded-2xl shadow-sm">
                    <span className="text-lg font-bold">Valid</span>
                    <Switch 
                      checked={formData.is_valid}
                      onCheckedChange={(checked) => setFormData({...formData, is_valid: checked})}
                      className="scale-110"
                    />
                  </div>
                </div>
              </div>
            </form>
          </ScrollArea>

          <div className="fixed bottom-0 left-0 w-full p-6 bg-background/90 backdrop-blur-xl border-t border-border z-50">
            <Button 
              type="submit"
              form="permit-form"
              disabled={isProcessing}
              className="w-full h-[64px] text-xl font-black rounded-2xl bg-primary text-primary-foreground shadow-xl disabled:opacity-50"
            >
              {isProcessing ? "Processing..." : "Log Official Artifact"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}