/** NANO-BITE: nb-hosp-kds-routing */
import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Tables } from '@/integrations/supabase/types';
import { Clock, CheckCircle2, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function KdsRouting({ businessId, onAction }: any) {
  const [queue, setQueue] = useState<Tables<'pos_transactions'>[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const fetchKDS = async () => {
    console.log(`[DATA_HYDRATION]: START - KDS Sync`);
    try {
      const { data, error } = await supabase
        .from('pos_transactions')
        .select('*')
        .eq('business_id', businessId)
        .eq('payment_status', 'completed')
        .order('created_at', { ascending: true });
      
      if (error) throw error;
      setQueue(data || []);
      setErrorMsg(null);
      console.log(`[DATA_HYDRATION]: END - KDS Ready (${data?.length} tickets)`);
    } catch (err: any) {
      console.error(`[DATA_HYDRATION]: ERROR - KDS fetch failed`, err);
      setErrorMsg("Failed to sync live tickets.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchKDS();
    const channel = supabase.channel('kds').on('postgres_changes', { event: '*', schema: 'public', table: 'pos_transactions' }, fetchKDS).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [businessId]);

  const handleClear = async (id: string) => {
    console.log(`[ACTION_TRIGGER]: START - Clearing ticket ${id}`);
    try {
      // Optimistic UI update for speed
      setQueue(prev => prev.filter(t => t.id !== id));
      await onAction('ROUTE_COMPLETE', { id });
      console.log(`[ACTION_TRIGGER]: END - Ticket cleared.`);
    } catch (err) {
      console.error(`[ACTION_TRIGGER]: ERROR - Failed to clear ticket.`, err);
      // Revert optimistic update on failure (The Law: Easy Reversal)
      fetchKDS();
    }
  };

  if (loading) return <div className="p-12 text-center text-[#86868B] animate-pulse font-bold text-[11px] uppercase">Syncing KDS...</div>;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between px-1">
        <label className="text-[11px] font-bold text-[#86868B] uppercase tracking-[0.12em]">Live Routing</label>
        <span className="bg-[#E5E5E7] text-[#1D1D1F] px-3 py-1 rounded-full text-[11px] font-bold">
          {queue.length} Active
        </span>
      </div>
      
      {/* THE LAW: Inline Error Messages */}
      {errorMsg && (
        <div className="p-4 bg-red-50 text-red-600 rounded-[16px] text-[13px] font-bold flex items-center gap-2">
          <AlertTriangle size={16} /> {errorMsg}
        </div>
      )}

      <div className="flex flex-col gap-3">
        {queue.length === 0 && (
          <div className="p-12 border-2 border-dashed border-[#F2F2F7] rounded-[28px] text-center text-[#D2D2D7] font-medium flex flex-col items-center gap-2">
            <CheckCircle2 size={32} className="text-emerald-400" />
            <span>KDS Clear. All tickets routed.</span>
          </div>
        )}
        
        {queue.map((order) => {
          // Calculate wait time
          const waitTime = Math.floor((Date.now() - new Date(order.created_at!).getTime()) / 60000);
          const isLate = waitTime > 15; // Flag if over 15 mins

          return (
            <div key={order.id} className={cn(
              "p-5 bg-white border rounded-[24px] flex justify-between items-center transition-all",
              isLate ? "border-red-200" : "border-[#F2F2F7]"
            )}>
              <div className="flex flex-col gap-1">
                <span className="text-[18px] font-bold text-[#1D1D1F]">Ticket #{order.transaction_number.slice(-4)}</span>
                <div className={cn("flex items-center gap-1.5 text-[13px] font-medium", isLate ? "text-red-500" : "text-[#86868B]")}>
                  <Clock size={14} />
                  <span>{waitTime} min waiting</span>
                </div>
              </div>
              
              {/* THE LAW: Distinct distinct distinct Action Button (44px min height) */}
              <button 
                onClick={() => handleClear(order.id)}
                className="h-[52px] px-8 bg-[#1D1D1F] text-white text-[14px] font-bold rounded-[18px] active:scale-[0.95] active:bg-emerald-600 transition-all shadow-md"
              >
                CLEAR
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}