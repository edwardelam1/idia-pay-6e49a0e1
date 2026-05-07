/**
 * NANO-BITE ID: SovereignWrapper
 * NANO-BITE NAME: Sovereign Baseplate
 * ROLE: System Layout Wrapper for Physical Atoms
 * DESIGN: Verified Reality Glassmorphism (2026 Production Spec)
 */

import React, { useEffect, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Activity, ShieldCheck, Box, AlertCircle } from "lucide-react";

interface SovereignWrapperProps {
  id: string;
  children: ReactNode;
  className?: string;
}

export const SovereignWrapper = ({ id, children, className }: SovereignWrapperProps) => {
  // ─── SYSTEM LOGGING: GRANULAR TRACE ─────────────────────────────────────────
  useEffect(() => {
    console.log(`[SOVEREIGN_NODE]: START - Physical Atom [${id}] initiating hydration pour.`);
    
    // Safety check for empty physical containers
    if (!children) {
      console.warn(`[SOVEREIGN_NODE]: WARNING - Node [${id}] mounted with empty payload. Silent stall potential.`);
    }

    return () => {
      console.log(`[SOVEREIGN_NODE]: END - Physical Atom [${id}] purging from active memory.`);
    };
  }, [id, children]);

  return (
    <div
      className={cn(
        "group relative flex flex-col bg-white overflow-hidden transition-all duration-300",
        "border border-[#F2F2F7] shadow-[0_8px_32px_rgba(0,0,0,0.04)]",
        "hover:shadow-[0_12px_48px_rgba(0,0,0,0.08)] hover:-translate-y-0.5",
        className
      )}
      style={{
        borderRadius: 28,
        minHeight: "160px",
      }}
    >
      {/* ─── SYSTEM HEADER (Meta Data Layer) ────────────────────────────────── */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-[#F2F2F7] bg-[#FBFBFD]/80 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 flex items-center justify-center bg-blue-50 rounded-[14px]">
            <Box className="h-5 w-5 text-[#007AFF]" />
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] font-bold text-[#86868B] uppercase tracking-[0.12em] leading-none mb-1">
              Sovereign Node
            </span>
            <span className="text-[15px] font-bold text-[#1D1D1F] tracking-tight leading-tight">
              {id.split('.').pop()?.replace(/_/g, ' ').toUpperCase()}
            </span>
          </div>
        </div>
        
        {/* THE LAW: Status Pill (44px vertical center) */}
        <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-50 border border-emerald-100 rounded-full h-[32px]">
          <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">
            Live
          </span>
        </div>
      </div>

      {/* ─── PHYSICAL STAGE (Injection Slot) ────────────────────────────────── */}
      <div className="flex-1 p-0 relative min-h-[44px]">
        {children ? (
          <div className="animate-in fade-in duration-500">
            {children}
          </div>
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center space-y-3 p-8">
            <Activity className="h-10 w-10 text-[#D2D2D7] animate-pulse" />
            <div className="text-center">
              <p className="text-[12px] font-bold uppercase tracking-widest text-[#86868B]">
                Awaiting Manifest Pour
              </p>
              <p className="text-[10px] text-[#D2D2D7] mt-1 font-mono">{id}</p>
            </div>
          </div>
        )}
      </div>

      {/* ─── SYSTEM FOOTER (Audit Footprint) ───────────────────────────────── */}
      <div className="px-6 py-3 bg-[#FBFBFD]/30 flex items-center justify-between border-t border-[#F2F2F7] opacity-0 group-hover:opacity-100 transition-opacity">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-3 w-3 text-[#34C759]" />
          <code className="text-[9px] font-mono text-[#D2D2D7] font-bold">
            TRACER_ID: {id.toUpperCase()}
          </code>
        </div>
        <div className="flex gap-1">
          <div className="h-1 w-4 bg-blue-100 rounded-full" />
          <div className="h-1 w-2 bg-blue-100 rounded-full" />
        </div>
      </div>

      {/* Touch Error Boundary Indicator */}
      <div className="absolute top-4 right-4 pointer-events-none opacity-0 group-hover:opacity-100">
         <AlertCircle className="h-4 w-4 text-[#F2F2F7]" />
      </div>
    </div>
  );
};

export default SovereignWrapper;