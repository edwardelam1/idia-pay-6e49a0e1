/** * NANO-BITE ID: hosp.ft.ops.service
 * NANO-BITE NAME: Service-location schedule
 * ROLE: Daily
 * INDUSTRY: tertiary.hospitality.food_truck 
 */

import React, { useState, useCallback, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { MapPin, Navigation, Clock, CheckCircle, PowerOff } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default function ServiceLocation({ businessId = "default" }: { businessId?: string }) {
  // --- STATE MACHINE ---
  type ViewStep = "loading" | "entry" | "active";
  const [step, setStep] = useState<ViewStep>("loading");
  
  // Data State
  const [address, setAddress] = useState("");
  const [activeLocationId, setActiveLocationId] = useState<string | null>(null);
  const [activeSince, setActiveSince] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const triggerHaptic = useCallback((type: 'light' | 'heavy' = 'light') => {
    try {
      if (typeof window !== 'undefined' && window.navigator && window.navigator.vibrate) {
        window.navigator.vibrate(type === 'heavy' ? [50, 50, 50] : 50);
      }
    } catch (e) { /* Hardware agnostic fallback */ }
  }, []);

  // ============================================================================
  // SUPABASE: FETCH CURRENT STATUS
  // ============================================================================
  const fetchActiveLocation = useCallback(async () => {
    console.log(`[BEGIN] fetchActiveLocation execution`);
    try {
      const { data, error } = await supabase
        .from('business_locations')
        .select('id, address, created_at')
        .eq('business_id', businessId)
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        console.log(`[INFO] fetchActiveLocation: Found active location ${data.id}`);
        setAddress(data.address);
        setActiveLocationId(data.id);
        setActiveSince(data.created_at);
        setStep("active");
      } else {
        console.log(`[INFO] fetchActiveLocation: No active location found. Routing to entry.`);
        setStep("entry");
      }
    } catch (err: any) {
      console.error(`[ERROR] fetchActiveLocation failed:`, err.message);
      setStep("entry"); // Fallback to entry if fetch fails
    } finally {
      console.log(`[END] fetchActiveLocation execution`);
    }
  }, [businessId]);

  useEffect(() => {
    if (businessId !== "default") {
      fetchActiveLocation();
    } else {
      setStep("entry");
    }
  }, [businessId, fetchActiveLocation]);

  // ============================================================================
  // SUPABASE: CHECK-IN TO NEW LOCATION
  // ============================================================================
  const handleCheckIn = async () => {
    console.log(`[BEGIN] handleCheckIn execution for address: ${address}`);
    if (!address.trim()) return;
    
    setIsProcessing(true);
    triggerHaptic('heavy');

    try {
      // 1. Deactivate any currently active locations for this business
      console.log(`[INFO] handleCheckIn: Deactivating previous location artifacts.`);
      const { error: deactivateError } = await supabase
        .from('business_locations')
        .update({ is_active: false })
        .eq('business_id', businessId)
        .eq('is_active', true);

      if (deactivateError) throw deactivateError;

      // 2. Insert the new active location
      console.log(`[INFO] handleCheckIn: Writing new location to ledger.`);
      const newTimestamp = new Date().toISOString();
      const { data: newLoc, error: insertError } = await supabase
        .from('business_locations')
        .insert({
          business_id: businessId,
          name: `Mobile Service - ${new Date().toLocaleDateString()}`,
          address: address.trim(),
          is_active: true,
          facility_type: 'location',
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
        })
        .select('id')
        .single();

      if (insertError) throw insertError;

      console.log(`[INFO] handleCheckIn: Check-in successful. ID: ${newLoc.id}`);
      setActiveLocationId(newLoc.id);
      setActiveSince(newTimestamp);
      setStep("active");

    } catch (error: any) {
      console.error(`[ERROR] handleCheckIn failed:`, error.message);
      alert("System Error: Could not broadcast location. Please check connectivity.");
    } finally {
      setIsProcessing(false);
      console.log(`[END] handleCheckIn execution`);
    }
  };

  // ============================================================================
  // SUPABASE: END SERVICE
  // ============================================================================
  const handleEndService = async () => {
    console.log(`[BEGIN] handleEndService execution for location: ${activeLocationId}`);
    if (!activeLocationId) return;

    setIsProcessing(true);
    triggerHaptic('heavy');

    try {
      const { error } = await supabase
        .from('business_locations')
        .update({ is_active: false })
        .eq('id', activeLocationId);

      if (error) throw error;

      console.log(`[INFO] handleEndService: Location deactivated successfully.`);
      setAddress("");
      setActiveLocationId(null);
      setActiveSince(null);
      setStep("entry");

    } catch (error: any) {
      console.error(`[ERROR] handleEndService failed:`, error.message);
      alert("System Error: Could not end service.");
    } finally {
      setIsProcessing(false);
      console.log(`[END] handleEndService execution`);
    }
  };

  // ============================================================================
  // RENDER BLOCKS
  // ============================================================================
  if (step === "loading") {
    return (
      <div className="flex flex-col items-center justify-center h-[70vh] p-6">
        <div className="animate-pulse flex flex-col items-center">
          <MapPin className="h-12 w-12 text-muted-foreground opacity-20 mb-4" />
          <p className="text-muted-foreground font-bold tracking-widest uppercase">Querying Ledger...</p>
        </div>
      </div>
    );
  }

  if (step === "active") {
    return (
      <div className="flex flex-col h-screen bg-background relative pb-[120px] animate-in fade-in zoom-in-95">
        <div className="pt-12 pb-4 px-6 bg-card border-b z-10">
          <h1 className="text-3xl font-black tracking-tight">Active Operations</h1>
          <p className="text-lg text-emerald-600 font-bold flex items-center gap-2 mt-1">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
            </span>
            Broadcasting to IDIA Hub
          </p>
        </div>

        <div className="flex-1 p-6">
          <Card className="border-2 border-emerald-500/20 bg-emerald-50/30 shadow-lg rounded-3xl overflow-hidden">
            <CardContent className="p-8 flex flex-col items-center text-center gap-6">
              <div className="h-24 w-24 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center shadow-inner">
                <MapPin className="h-12 w-12" />
              </div>
              
              <div>
                <Label className="text-sm font-bold text-muted-foreground uppercase tracking-widest block mb-2">Current Service Spot</Label>
                <h2 className="text-3xl font-black leading-tight text-foreground">{address}</h2>
              </div>

              <div className="flex items-center gap-2 text-muted-foreground bg-background px-4 py-2 rounded-full border shadow-sm mt-4">
                <Clock className="h-5 w-5" />
                <span className="font-bold">
                  Online since {activeSince ? new Date(activeSince).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '...'}
                </span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Bottom Action Bar */}
        <div className="fixed bottom-0 left-0 w-full bg-background border-t p-6 shadow-[0_-10px_40px_rgba(0,0,0,0.1)] z-50">
          <Button 
            variant="outline"
            size="lg" 
            onClick={handleEndService}
            disabled={isProcessing}
            className="w-full min-h-[72px] text-2xl font-black border-2 border-destructive/20 text-destructive hover:bg-destructive hover:text-destructive-foreground active:scale-[0.98] transition-all rounded-2xl"
          >
            {isProcessing ? "Updating Ledger..." : <><PowerOff className="mr-3 h-7 w-7" /> End Service & Disconnect</>}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-background relative pb-[120px] animate-in slide-in-from-bottom-4">
      <div className="pt-12 pb-4 px-6 bg-card border-b z-10">
        <h1 className="text-3xl font-black tracking-tight">Location Setup</h1>
        <p className="text-lg text-muted-foreground font-medium mt-1">Establish your daily coordinates.</p>
      </div>
      
      <div className="flex-1 p-6 space-y-8">
        <div className="space-y-4">
          <Label className="text-base font-bold text-muted-foreground uppercase tracking-wider ml-1">Current Service Spot <span className="text-destructive">*</span></Label>
          <div className="relative">
            <MapPin className="absolute left-5 top-1/2 -translate-y-1/2 h-7 w-7 text-primary" />
            <Input 
              placeholder="e.g. 5th & Broadway"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="h-[80px] pl-16 rounded-2xl bg-muted/30 border-2 border-border text-2xl font-bold shadow-inner placeholder:text-muted-foreground/50 focus-visible:ring-primary focus-visible:border-primary"
            />
          </div>
          <p className="text-sm text-muted-foreground font-medium ml-2">This address will be broadcasted to the consumer app.</p>
        </div>
      </div>
      
      <div className="fixed bottom-0 left-0 w-full bg-background border-t p-6 shadow-[0_-10px_40px_rgba(0,0,0,0.1)] z-50">
        <Button 
          onClick={handleCheckIn}
          disabled={!address.trim() || isProcessing}
          className="w-full min-h-[80px] bg-primary text-primary-foreground text-2xl font-black rounded-2xl shadow-xl active:scale-[0.98] transition-transform disabled:opacity-50"
        >
          {isProcessing ? "Securing Coordinates..." : <><Navigation className="mr-3 h-7 w-7" /> Open for Service</>}
        </Button>
      </div>
    </div>
  );
}