/** NANO-BITE: nb-hosp-food-truck-queue */
import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Tables } from '@/integrations/supabase/types';
import { CheckCircle2, Clock } from 'lucide-react';

export default function FoodTruckQueue({ businessId, onAction }: any) {
  const [orders, setOrders] = useState<Tables<'pos_transactions'>[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchQueue = async () => {
    console.log(`[DATA_HYDRATION]: START - Queue Sync: ${businessId}`);
    const { data } = await supabase
      .from('pos_transactions')
      .select('*')
      .eq('business_id', businessId)
      .eq('payment_status', 'completed')
      .order('created_at', { ascending: true });
    
    setOrders(data || []);
    setLoading(false);
    console.log(`[DATA_HYDRATION]: END - ${data?.length} orders active`);
  };

  useEffect(() => {
    fetchQueue();
    const channel = supabase.channel('q-sync').on('postgres_changes', { event: '*', schema: 'public', table: 'pos_transactions' }, fetchQueue).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [businessId]);

  if (loading) return <div className="p-12 text-center text-[#86868B] animate-pulse font-bold text-[11px] uppercase">Syncing Kitchen...</div>;

  return (
    <div className="flex flex-col gap-6">
      <label className="text-[11px] font-bold text-[#86868B] uppercase tracking-[0.12em] px-1">Live Prep Queue</label>
      
      <div className="flex flex-col gap-3">
        {orders.length === 0 && (
          <div className="p-12 border-2 border-dashed border-[#F2F2F7] rounded-[28px] text-center text-[#D2D2D7] font-medium">
            Waiting for orders...
          </div>
        )}
        {orders.map((order) => (
          <div key={order.id} className="p-6 bg-white border border-[#F2F2F7] rounded-[24px] flex justify-between items-center transition-all active:scale-[0.98]">
            <div className="flex flex-col">
              <span className="text-[18px] font-bold text-[#1D1D1F]">#{order.transaction_number.slice(-4)}</span>
              <div className="flex items-center gap-1.5 mt-1 text-[#86868B]">
                <Clock size={14} />
                <span className="text-[13px] font-medium">
                  {new Date(order.created_at!).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            </div>
            {/* THE LAW: 44px min height button */}
            <button 
              onClick={() => {
                console.log(`[ACTION_TRIGGER]: START - Fulfill order ${order.id}`);
                onAction('ORDER_READY', { id: order.id });
                console.log(`[ACTION_TRIGGER]: END`);
              }}
              className="h-[48px] px-8 bg-[#F2F2F7] text-[#1D1D1F] text-[14px] font-bold rounded-full transition-all active:bg-emerald-50 active:text-emerald-600"
            >
              READY
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}