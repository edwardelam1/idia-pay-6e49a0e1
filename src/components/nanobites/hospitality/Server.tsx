/** NANO-BITE: nb-hosp-server */
import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Tables } from '@/integrations/supabase/types';
import { Plus, Minus, ShoppingCart, RefreshCw, Info } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function Server({ businessId, onAction }: any) {
  const [items, setItems] = useState<Tables<'menu_items'>[]>([]);
  const [category, setCategory] = useState('Mains');
  const [order, setOrder] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  const fetchMenu = async () => {
    console.log(`[DATA_HYDRATION]: START - Fetching Server Menu`);
    setSyncing(true);
    try {
      const { data, error } = await supabase
        .from('menu_items')
        .select('*')
        .eq('business_id', businessId)
        .eq('is_active', true);
      
      if (error) throw error;
      setItems(data || []);
      console.log(`[DATA_HYDRATION]: END - Server Menu Ready`);
    } catch (err) {
      console.error(`[DATA_HYDRATION]: ERROR - Failed to sync menu.`, err);
    } finally {
      setLoading(false);
      setSyncing(false);
    }
  };

  useEffect(() => { fetchMenu(); }, [businessId]);

  const updateQty = (id: string, delta: number) => {
    setOrder(prev => {
      const newQty = Math.max(0, (prev[id] || 0) + delta);
      const newOrder = { ...prev };
      if (newQty === 0) delete newOrder[id];
      else newOrder[id] = newQty;
      return newOrder;
    });
  };

  const handleSubmit = () => {
    console.log(`[ACTION_TRIGGER]: START - Dispatched Server Order`);
    try {
      if (Object.keys(order).length === 0) throw new Error("Order is empty");
      onAction('ORDER_QUEUED', order);
      setOrder({}); // Reset on successful submission
      console.log(`[ACTION_TRIGGER]: END - Order successfully queued.`);
    } catch (err) {
      console.error(`[ACTION_TRIGGER]: ERROR - Order submission failed:`, err);
    }
  };

  if (loading) return <div className="p-12 text-center text-[#86868B] animate-pulse font-bold text-[11px] uppercase">Syncing Server...</div>;

  return (
    <div className="flex flex-col gap-6 relative pb-24 h-full">
      {/* THE LAW: Clear label above + Top Right Action */}
      <div className="flex items-center justify-between px-1">
        <label className="text-[11px] font-bold text-[#86868B] uppercase tracking-[0.12em]">Active Menu</label>
        <button onClick={fetchMenu} disabled={syncing} className="h-[44px] px-4 flex items-center justify-center bg-[#F2F2F7] rounded-full active:scale-95 transition-all">
          <RefreshCw size={16} className={cn("text-[#1D1D1F]", syncing && "animate-spin")} />
        </button>
      </div>

      {/* THE LAW: Segmented Control (High-touch switching) */}
      <div className="flex bg-[#F2F2F7] p-1 rounded-[20px] h-[52px]">
        {['Mains', 'Sides', 'Drinks'].map(cat => (
          <button
            key={cat}
            onClick={() => setCategory(cat)}
            className={cn(
              "flex-1 rounded-[16px] text-[13px] font-bold transition-all active:scale-[0.95]",
              category === cat ? "bg-white shadow-sm text-[#1D1D1F]" : "text-[#86868B]"
            )}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* THE LAW: Single-Column Vertical Flow */}
      <div className="flex flex-col gap-3">
        {items.filter(i => i.category === category).map(item => (
          <div key={item.id} className="h-[90px] bg-white border border-[#F2F2F7] rounded-[24px] px-5 flex items-center justify-between">
            <div className="flex flex-col">
              <div className="flex items-center gap-2">
                <label className="text-[15px] font-bold text-[#1D1D1F]">{item.name}</label>
                {/* THE LAW: Avoid hover tooltips, use static info icons */}
                {item.description && <Info size={14} className="text-[#D2D2D7]" />}
              </div>
              <span className="text-[13px] font-medium text-[#86868B] mt-0.5">${item.base_price.toFixed(2)}</span>
            </div>

            {/* THE LAW: 44x44px Steppers */}
            <div className="flex items-center gap-4 bg-[#F2F2F7] rounded-full p-1">
              <button onClick={() => updateQty(item.id, -1)} className="w-[44px] h-[44px] flex items-center justify-center bg-white rounded-full shadow-sm active:scale-90">
                <Minus size={18} className="text-[#1D1D1F]" />
              </button>
              <span className="w-6 text-center font-bold tabular-nums text-[16px]">{order[item.id] || 0}</span>
              <button onClick={() => updateQty(item.id, 1)} className="w-[44px] h-[44px] flex items-center justify-center bg-white rounded-full shadow-sm active:scale-90">
                <Plus size={18} className="text-[#1D1D1F]" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* THE LAW: Sticky Footer / Bottom-Weighted Action (Thumb Zone) */}
      <div className="absolute bottom-0 left-0 right-0 bg-white/90 backdrop-blur-md pt-4 pb-2 border-t border-[#F2F2F7]">
        <button
          onClick={handleSubmit}
          disabled={Object.keys(order).length === 0}
          className="h-[64px] w-full bg-[#007AFF] text-white text-[17px] font-bold rounded-[22px] shadow-xl flex items-center justify-center gap-3 active:scale-[0.98] disabled:opacity-50 disabled:bg-[#D2D2D7] transition-all"
        >
          <ShoppingCart size={20} /> Submit Order ({Object.values(order).reduce((a, b) => a + b, 0)})
        </button>
      </div>
    </div>
  );
}