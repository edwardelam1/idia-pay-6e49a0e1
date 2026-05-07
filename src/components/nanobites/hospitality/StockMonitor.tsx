/**
 * NANO-BITE: nb-hosp-stock-monitor
 * THE LAW: Single-column layout, labels-above-inputs, 44px touch targets.
 * Physics: Real-time inventory tracking via public.inventory_items.
 */
import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Tables } from '@/integrations/supabase/types';
import { Plus, RefreshCw, AlertTriangle, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface StockMonitorProps {
  businessId: string;
  onAction: (id: string, data: any) => void;
}

export default function StockMonitor({ businessId, onAction }: StockMonitorProps) {
  const [inventory, setInventory] = useState<Tables<'inventory_items'>[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchInventory = async () => {
    console.log(`[DATA_HYDRATION]: START - Refreshing Inventory for: ${businessId}`);
    setIsRefreshing(true);
    
    const { data, error } = await supabase
      .from('inventory_items')
      .select('*')
      .eq('business_id', businessId)
      .order('current_stock', { ascending: true });

    if (error) {
      console.error(`[DATA_HYDRATION]: ERROR - Inventory fetch failed.`, error);
    } else {
      setInventory(data || []);
      console.log(`[DATA_HYDRATION]: END - Inventory hydrated with ${data?.length} rows.`);
    }
    setLoading(false);
    setIsRefreshing(false);
  };

  useEffect(() => {
    fetchInventory();
    
    // Real-time listener for stock changes
    const channel = supabase
      .channel('stock-updates')
      .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'inventory_items',
        filter: `business_id=eq.${businessId}` 
      }, fetchInventory)
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [businessId]);

  const handleRestockTrigger = (item: Tables<'inventory_items'>) => {
    console.log(`[ACTION_TRIGGER]: START - Manual restock request for ${item.name}`);
    onAction('RESTOCK_INTENT', { itemId: item.id, name: item.name });
    console.log(`[ACTION_TRIGGER]: END - Intent dispatched.`);
  };

  if (loading) return <div className="p-12 text-center animate-pulse text-[#86868B]">Syncing Stock...</div>;

  return (
    <div className="flex flex-col gap-6">
      {/* THE LAW: Header with Add Item consistently placed top-right */}
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <label className="text-[11px] font-bold text-[#86868B] uppercase tracking-[0.12em]">Inventory Status</label>
          {isRefreshing && <RefreshCw size={12} className="animate-spin text-blue-500" />}
        </div>
        <button 
          onClick={() => onAction('ADD_INVENTORY_ITEM', {})}
          className="h-[36px] px-4 bg-[#F2F2F7] rounded-full text-[12px] font-bold text-[#1D1D1F] flex items-center gap-1.5 active:scale-95"
        >
          <Plus size={14} /> Add Item
        </button>
      </div>

      {/* THE LAW: Single-Column vertical guide */}
      <div className="flex flex-col gap-3">
        {inventory.map((item) => {
          const isLow = (item.current_stock || 0) <= (item.par_level || 0);
          
          return (
            <div 
              key={item.id}
              className={cn(
                "h-[88px] bg-white border rounded-[24px] px-5 flex items-center justify-between transition-all active:scale-[0.98]",
                isLow ? "border-red-100 bg-red-50/30" : "border-[#F2F2F7]"
              )}
            >
              <div className="flex items-center gap-4">
                {isLow && (
                  <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center text-red-600">
                    <AlertTriangle size={18} />
                  </div>
                )}
                <div className="flex flex-col">
                  <span className="text-[15px] font-bold text-[#1D1D1F]">{item.name}</span>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className={cn(
                      "text-[13px] font-medium",
                      isLow ? "text-red-600" : "text-[#86868B]"
                    )}>
                      {item.current_stock} {item.unit_of_measure}
                    </span>
                    <span className="text-[11px] text-[#D2D2D7]">/ Par: {item.par_level}</span>
                  </div>
                </div>
              </div>

              {/* THE LAW: 44x44px min touch target for Restock/Edit */}
              <button 
                onClick={() => handleRestockTrigger(item)}
                className={cn(
                  "w-[44px] h-[44px] flex items-center justify-center rounded-full transition-all active:scale-90",
                  isLow ? "bg-red-600 text-white shadow-lg shadow-red-200" : "bg-[#F2F2F7] text-[#86868B]"
                )}
              >
                <ChevronRight size={20} />
              </button>
            </div>
          );
        })}
      </div>

      {/* THE LAW: Feedback/Safety features (Audit Trail Access) */}
      <button 
        onClick={() => onAction('VIEW_STOCK_HISTORY', {})}
        className="h-[52px] w-full border border-[#F2F2F7] rounded-[18px] text-[13px] font-bold text-[#86868B] flex items-center justify-center gap-2 active:bg-[#F2F2F7]"
      >
        <RefreshCw size={14} /> View Version History
      </button>

      {/* THE LAW: Sticky Footer for Primary Action in "Thumb Zone" */}
      <div className="mt-2">
        <button
          onClick={() => fetchInventory()}
          className="h-[60px] w-full bg-[#1D1D1F] text-white text-[16px] font-bold rounded-[22px] shadow-xl active:scale-[0.98]"
        >
          Refresh All Stock
        </button>
      </div>
    </div>
  );
}