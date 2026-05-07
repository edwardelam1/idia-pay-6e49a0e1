/** NANO-BITE: nb-hosp-billing */
import React, { useState } from 'react';
import { cn } from '@/lib/utils';
import { AlertCircle, CheckCircle2 } from 'lucide-react';

export default function Billing({ amount = 0, onAction }: any) {
  // Update state to use 'BASE' instead of 'USDC'
  const [rail, setRail] = useState('USD');
  const [processing, setProcessing] = useState(false);
  const [status, setStatus] = useState<'IDLE' | 'SUCCESS' | 'ERROR'>('IDLE');
  const [errorMsg, setErrorMsg] = useState("");

  const handleBill = async () => {
    console.log(`[ACTION_TRIGGER]: START - Billing ${amount} on ${rail}`);
    setProcessing(true);
    setStatus('IDLE');
    
    try {
      if (amount <= 0) throw new Error("Amount must be greater than 0");
      
      // Dispatch the selected rail (USD or BASE)
      await onAction('BILLING_COMPLETE', { amount, rail, timestamp: new Date().toISOString() });
      
      setStatus('SUCCESS');
      console.log(`[ACTION_TRIGGER]: END - Settlement successful.`);
    } catch (err: any) {
      console.error(`[ACTION_TRIGGER]: ERROR - Billing failed.`, err);
      setStatus('ERROR');
      setErrorMsg(err.message || "Settlement failed. Please retry.");
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="flex flex-col gap-8 h-full justify-between">
      <div>
        {/* THE LAW: Labels Above Inputs */}
        <div className="text-center py-6 bg-[#FBFBFD] rounded-[28px] border border-[#F2F2F7]">
          <label className="text-[11px] font-bold text-[#86868B] uppercase tracking-[0.15em]">Total Due</label>
          <h2 className="text-[56px] font-semibold tracking-tight text-[#1D1D1F] mt-1 tabular-nums">
            ${amount.toFixed(2)}
          </h2>
        </div>

        <div className="space-y-4 mt-8">
          <label className="text-[13px] font-bold px-1 text-[#1D1D1F]">Select Settlement Rail</label>
          
          {/* THE LAW: Large Segmented Controls (No Dropdowns) */}
          <div className="grid grid-cols-2 gap-3">
            {['USD', 'BASE'].map(r => (
              <button
                key={r}
                disabled={processing || status === 'SUCCESS'}
                onClick={() => setRail(r)}
                className={cn(
                  "h-[76px] rounded-[24px] border-2 flex flex-col items-center justify-center transition-all",
                  rail === r ? "border-[#007AFF] bg-blue-50/50 text-[#007AFF] shadow-sm" : "border-[#F2F2F7] bg-white text-[#86868B] active:bg-[#F2F2F7]",
                  (processing || status === 'SUCCESS') && "opacity-50 cursor-not-allowed"
                )}
              >
                <span className="text-[18px] font-bold">{r}</span>
                <span className="text-[11px] font-bold uppercase tracking-wider">
                  {/* Updated Subtext to reflect L2 ETH vs Fiat */}
                  {r === 'USD' ? 'Fiat Network' : 'L2 ETH Network'}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* THE LAW: Error/Feedback Messages inline */}
        {status === 'ERROR' && (
          <div className="mt-6 p-4 bg-red-50 text-red-600 rounded-[16px] text-[13px] font-bold flex items-center gap-2">
            <AlertCircle size={18} /> {errorMsg}
          </div>
        )}
        
        {status === 'SUCCESS' && (
          <div className="mt-6 p-4 bg-emerald-50 text-emerald-600 rounded-[16px] text-[14px] font-bold flex items-center justify-center gap-2 border border-emerald-100 shadow-sm">
            <CheckCircle2 size={20} /> Payment Successful
          </div>
        )}
      </div>

      {/* THE LAW: Sticky Primary Action (Thumb Zone) */}
      <div className="mt-auto pt-6">
        <button
          onClick={handleBill}
          disabled={processing || amount <= 0 || status === 'SUCCESS'}
          className={cn(
            "h-[72px] w-full text-white text-[18px] font-bold rounded-[24px] shadow-xl transition-all flex items-center justify-center gap-2",
            processing ? "bg-[#86868B]" : "bg-[#1D1D1F] active:scale-[0.98] active:bg-black",
            (amount <= 0 || status === 'SUCCESS') && "opacity-50"
          )}
        >
          {processing ? "Processing Network..." : "Finalize Settlement"}
        </button>
      </div>
    </div>
  );
}