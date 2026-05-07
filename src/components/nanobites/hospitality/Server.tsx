/** NANO-BITE: nb-hosp-server */
import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Tables } from '@/integrations/supabase/types';
import { Plus, Minus, ShoppingCart } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function Server({ businessId, onAction }: any) {
  const [items, setItems] = useState<Tables<'menu_items'>[]>([]);
  const [category, setCategory] = useState('Mains');
  const [order, setOrder] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchMenu = async () => {
      console.log(`[DATA_HYDRATION]: START - Fetching Server Menu`);
      const { data } = await supabase.from('menu_items').select('*').eq('business_id', businessId);
      setItems(data || []);
      setLoading(false);
      console.log(`[DATA_HYDRATION]: END - Server Menu Ready`);
    };
    fetchMenu();
  }, [businessId]);

  const updateQty = (id: string, delta: number) => {
    setOrder(prev => ({ ...prev, [id]: Math.max(0, (prev[id] || 0) + delta) }));
  };

  if (loading) return <div className="p-12 text-center text-[#86868B] animate-pulse font-bold text-[11px] uppercase">Syncing Server...</div>;

  return (
    <div className="flex flex-col gap-6">
      {/* THE LAW: Segmented Control */}
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

      <div className="flex flex-col gap-3">
        {items.filter(i => i.category === category).map(item => (
          <div key={item.id} className="h-[90px] bg-white border border-[#F2F2F7] rounded-[24px] px-5 flex items-center justify-between">
            <div className="flex flex-col">
              <label className="text-[15px] font-bold text-[#1D1D1F]">{item.name}</label>
              <span className="text-[13px] font-medium text-[#86868B] mt-0.5">${item.base_price.toFixed(2)}</span>
            </div>

            {/* THE LAW: 44px Touch Targets for Steppers */}
            <div className="flex items-center gap-4 bg-[#F2F2F7] rounded-full p-1">
              <button onClick={() => updateQty(item.id, -1)} className="w-[44px] h-[44px] flex items-center justify-center bg-white rounded-full shadow-sm active:scale-90">
                <Minus size={18} />
              </button>
              <span className="w-6 text-center font-bold tabular-nums text-[16px]">{order[item.id] || 0}</span>
              <button onClick={() => updateQty(item.id, 1)} className="w-[44px] h-[44px] flex items-center justify-center bg-white rounded-full shadow-sm active:scale-90">
                <Plus size={18} />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* THE LAW: Thumb Zone Primary Action */}
      <button
        onClick={() => {
          console.log(`[ACTION_TRIGGER]: START - Dispatched Server Order`);
          onAction('ORDER_QUEUED', order);
          console.log(`[ACTION_TRIGGER]: END`);
        }}
        className="h-[64px] bg-[#007AFF] text-white text-[17px] font-bold rounded-[22px] shadow-xl flex items-center justify-center gap-3 active:scale-[0.98]"
      >
        <ShoppingCart size={20} /> Add to Order
      </button>
    </div>
  );
}