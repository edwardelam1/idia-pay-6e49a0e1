/** NANO-BITE: nb-hosp-kds-routing */
import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Tables } from '@/integrations/supabase/types';
import { Clock } from 'lucide-react';

export default function KdsRouting({ businessId, onAction }: any) {
  const [queue, setQueue] = useState<Tables<'pos_transactions'>[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchKDS = async () => {
    console.log(`[DATA_HYDRATION]: START - KDS Sync`);
    const { data } = await supabase.from('pos_transactions').select('*').eq('business_id', businessId).eq('payment_status', 'completed');
    setQueue(data || []);
    setLoading(false);
    console.log(`[DATA_HYDRATION]: END - KDS Ready`);
  };

  useEffect(() => {
    fetchKDS();
    const channel = supabase.channel('kds').on('postgres_changes', { event: '*', schema: 'public', table: 'pos_transactions' }, fetchKDS).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [businessId]);

  if (loading) return <div className="p-12 text-center text-[#86868B] animate-pulse font-bold text-[11px] uppercase">Syncing KDS...</div>;

  return (
    <div className="flex flex-col gap-6">
      <label className="text-[11px] font-bold text-[#86868B] uppercase tracking-[0.12em] px-1">KDS Active Routing</label>
      
      <div className="flex flex-col gap-3">
        {queue.length === 0 && <div className="p-12 text-center text-[#D2D2D7] font-medium">KDS Clear</div>}
        {queue.map((order) => (
          <div key={order.id} className="p-6 bg-white border border-[#F2F2F7] rounded-[24px] flex justify-between items-center">
            <div className="flex flex-col">
              <span className="text-[18px] font-bold text-[#1D1D1F]">Ticket #{order.transaction_number.slice(-4)}</span>
              <div className="flex items-center gap-1.5 mt-1 text-[#86868B]">
                <Clock size={14} />
                <span className="text-[13px] font-medium">{new Date(order.created_at!).toLocaleTimeString()}</span>
              </div>
            </div>
            {/* THE LAW: 44px min height touch target */}
            <button 
              onClick={() => onAction('ROUTE_COMPLETE', { id: order.id })}
              className="h-[48px] px-8 bg-[#F2F2F7] text-[#1D1D1F] text-[14px] font-bold rounded-full active:bg-emerald-50 active:text-emerald-600"
            >
              CLEAR
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}