/** NANO-BITE: nb-hosp-food-truck-order */
import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Tables } from '@/integrations/supabase/types';
import { Plus, Minus, ShoppingCart } from 'lucide-react';
import { cn } from '@/lib/utils';

interface FoodTruckOrderProps {
  businessId: string;
  onAction: (id: string, data: any) => void;
}

export default function FoodTruckOrder({ businessId, onAction }: FoodTruckOrderProps) {
  const [items, setItems] = useState<Tables<'menu_items'>[]>([]);
  const [activeCategory, setActiveCategory] = useState('Mains');
  const [order, setOrder] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchMenu = async () => {
      console.log(`[DATA_HYDRATION]: START - Fetching Menu for: ${businessId}`);
      const { data, error } = await supabase
        .from('menu_items')
        .select('*')
        .eq('business_id', businessId)
        .eq('is_active', true);

      if (error) console.error(`[DATA_HYDRATION]: ERROR`, error);
      else setItems(data || []);
      setLoading(false);
      console.log(`[DATA_HYDRATION]: END - Hydrated ${data?.length} items`);
    };
    fetchMenu();
  }, [businessId]);

  const updateQty = (id: string, delta: number) => {
    setOrder(prev => ({
      ...prev,
      [id]: Math.max(0, (prev[id] || 0) + delta)
    }));
  };

  const categories = ['Mains', 'Sides', 'Drinks'];

  if (loading) return <div className="p-12 text-center text-[#86868B] animate-pulse uppercase text-[11px] font-bold">Liquifying Menu...</div>;

  return (
    <div className="flex flex-col gap-6">
      {/* THE LAW: Segmented Control (High-touch switching) */}
      <div className="flex bg-[#F2F2F7] p-1 rounded-[20px] h-[52px]">
        {categories.map(cat => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            className={cn(
              "flex-1 rounded-[16px] text-[13px] font-bold transition-all active:scale-[0.95]",
              activeCategory === cat ? "bg-white shadow-sm text-[#1D1D1F]" : "text-[#86868B]"
            )}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* THE LAW: Single-Column vertical list for guidance */}
      <div className="flex flex-col gap-3">
        {items.filter(i => i.category === activeCategory).map(item => (
          <div key={item.id} className="h-[90px] bg-white border border-[#F2F2F7] rounded-[24px] px-5 flex items-center justify-between transition-all">
            <div className="flex flex-col">
              <label className="text-[15px] font-bold text-[#1D1D1F]">{item.name}</label>
              <span className="text-[13px] font-medium text-[#86868B] mt-0.5">${item.base_price.toFixed(2)}</span>
            </div>

            {/* THE LAW: 44x44px Steppers (No small input boxes) */}
            <div className="flex items-center gap-4 bg-[#F2F2F7] rounded-full p-1">
              <button 
                onClick={() => updateQty(item.id, -1)}
                className="w-[44px] h-[44px] flex items-center justify-center bg-white rounded-full shadow-sm active:scale-90"
              >
                <Minus size={18} className="text-[#1D1D1F]" />
              </button>
              <span className="w-6 text-center font-bold tabular-nums text-[16px]">
                {order[item.id] || 0}
              </span>
              <button 
                onClick={() => updateQty(item.id, 1)}
                className="w-[44px] h-[44px] flex items-center justify-center bg-white rounded-full shadow-sm active:scale-90"
              >
                <Plus size={18} className="text-[#1D1D1F]" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* THE LAW: Primary Action in Thumb Zone */}
      <button
        onClick={() => {
          console.log(`[ACTION_TRIGGER]: START - Dispatched order`);
          onAction('ORDER_QUEUED', order);
          console.log(`[ACTION_TRIGGER]: END`);
        }}
        className="h-[64px] bg-[#007AFF] text-white text-[17px] font-bold rounded-[22px] shadow-xl flex items-center justify-center gap-3 active:scale-[0.98] transition-all"
      >
        <ShoppingCart size={20} /> Add to Order
      </button>
    </div>
  );
}