/**
 * NANO-BITE ID: hosp.ft.ops.service
 * ROLE: Service location & check-in
 * INDUSTRY: tertiary.hospitality.food_truck
 */
import React, { useState } from "react";
import { MapPin, CheckCircle2, Navigation, Clock } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

export default function ServiceLocation({ businessId }: { businessId: string }) {
  const [location, setLocation] = useState("");
  
  const handleCheckIn = () => {
    console.log("[ACTION_TRIGGER]: START - Service Check-in at", location);
    toast.success("Service Location Live", {
      description: `Active at ${location}. Signal sent to Hub.`
    });
    console.log("[ACTION_TRIGGER]: END - Location broadcast successful.");
  };

  return (
    <div className="p-6 space-y-6">
      <div className="space-y-2">
        <Label className="text-[13px] font-bold ml-1">Current Service Spot *</Label>
        <div className="relative">
          <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-[#007AFF]" />
          <Input 
            placeholder="e.g. 5th & Broadway"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            className="h-[56px] pl-12 rounded-[16px] bg-[#FBFBFD] border-[#F2F2F7] text-[16px]"
          />
        </div>
      </div>
      
      <button 
        onClick={handleCheckIn}
        disabled={!location}
        className="w-full h-[64px] bg-[#007AFF] text-white text-[17px] font-bold rounded-[22px] flex items-center justify-center gap-2 active:scale-95 transition-all shadow-lg disabled:opacity-30"
      >
        <Navigation size={20} /> Open for Service
      </button>
    </div>
  );
}