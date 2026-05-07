/** NANO-BITE: nb-hosp-food-truck-payment */
import React, { useState } from 'react';
import { cn } from '@/lib/utils';

interface FoodTruckPaymentProps {
  amount: number;
  onAction: (id: string, data: any) => void;
}

export default function FoodTruckPayment({ amount, onAction }: FoodTruckPaymentProps) {
  const [rail, setRail] = useState('USD');
  const [isProcessing, setIsProcessing] = useState(false);

  const handleSettlement = async () => {
    // UI LAW: Granular logging to prevent silent stalling
    console.log(`[ACTION_TRIGGER]: START - Processing settlement: ${amount} via ${rail}`);
    setIsProcessing(true);

    try {
      await onAction('COMPLETE_PAYMENT', { 
        amount, 
        rail,
        timestamp: new Date().toISOString()
      });
      console.log(`[ACTION_TRIGGER]: END - Settlement successful.`);
    } catch (error) {
      console.error(`[ACTION_TRIGGER]: ERROR - Settlement failed.`, error);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="flex flex-col gap-10">
      {/* THE LAW: Clear label placed above the data */}
      <div className="text-center py-4">
        <label className="text-[11px] font-bold text-[#86868B] uppercase tracking-[0.15em]">
          Settle Amount
        </label>
        <h2 className="text-[52px] font-semibold tracking-tight text-[#1D1D1F] mt-2">
          ${amount.toFixed(2)}
        </h2>
      </div>

      <div className="space-y-4">
        {/* THE LAW: Labels strictly above inputs */}
        <label className="text-[13px] font-bold px-1 text-[#1D1D1F]">
          Payment Rail
        </label>
        
        {/* THE LAW: Large Segmented Control (72px height) for gestural tapping */}
        <div className="grid grid-cols-2 gap-3">
          {(['USD', 'USDC'] as const).map(r => (
            <button
              key={r}
              type="button"
              disabled={isProcessing}
              onClick={() => setRail(r)}
              className={cn(
                "h-[72px] rounded-[24px] border-2 transition-all flex flex-col items-center justify-center active:scale-[0.96]",
                rail === r 
                  ? "border-[#007AFF] bg-blue-50/30 text-[#007AFF]" 
                  : "border-[#F2F2F7] bg-white text-[#86868B]"
              )}
            >
              <span className="text-[16px] font-bold">{r}</span>
              <span className="text-[10px] uppercase font-bold tracking-wider">
                {r === 'USD' ? 'Fiat' : 'Stable'}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* THE LAW: Primary high-contrast action button in the Thumb Zone */}
      <button
        onClick={handleSettlement}
        disabled={isProcessing || amount <= 0}
        className={cn(
          "h-[68px] w-full text-white text-[17px] font-bold rounded-[24px] shadow-2xl transition-all mt-4 active:scale-[0.98]",
          isProcessing ? "bg-[#86868B] cursor-not-allowed" : "bg-[#1D1D1F] active:bg-black"
        )}
      >
        {isProcessing ? "Processing..." : "Charge & Settle"}
      </button>

      {/* THE LAW: Visual feedback showing system status */}
      <div className="flex items-center justify-center gap-2">
        <div className={cn(
          "w-2 h-2 rounded-full",
          isProcessing ? "bg-blue-500 animate-pulse" : "bg-emerald-500"
        )} />
        <span className="text-[11px] font-bold text-[#86868B] uppercase tracking-wider">
          Dual-Rail TSP Active
        </span>
      </div>
    </div>
  );
}