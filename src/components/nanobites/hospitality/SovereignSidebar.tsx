/**
 * UI LAW: Bottom-Weighted Actions & 44px Touch Targets
 * Logic: Grouped by screenTag from Hub JSON
 */
import React from 'react';
import { cn } from '@/lib/utils';

export const SovereignSidebar = ({ screens, activeScreen, onNavigate, onEndSession }: any) => {
  return (
    <aside className="w-[280px] h-screen bg-white/94 backdrop-blur-[30px] border-r border-[#F2F2F7] flex flex-col">
      <div className="p-6 pt-12 flex-1">
        <p className="text-[10px] font-bold text-[#86868B] uppercase tracking-[0.15em] mb-6 px-4">
          Operational Screens
        </p>
        <nav className="space-y-2">
          {screens.map((screen: string) => (
            <button
              key={screen}
              onClick={() => {
                console.log(`[NAV_TOUCH]: START - Navigating to ${screen}`);
                onNavigate(screen);
              }}
              /* UI LAW: 44px min height for touch targets */
              className={cn(
                "w-full h-[48px] px-4 text-left rounded-[18px] text-[15px] font-semibold transition-all active:scale-[0.97]",
                activeScreen === screen 
                  ? "bg-[#1D1D1F] text-white shadow-lg" 
                  : "bg-transparent text-[#424245] hover:bg-[#F2F2F7]"
              )}
            >
              {screen}
            </button>
          ))}
        </nav>
      </div>

      {/* UI LAW: Bottom-Weighted Action (Thumb Zone) */}
      <div className="p-6 pb-10 mt-auto">
        <button
          onClick={onEndSession}
          className="w-full h-[54px] border border-[#F2F2F7] rounded-[18px] text-[14px] font-bold text-[#FF3B30] bg-white transition-all active:bg-red-50"
        >
          End Session
        </button>
      </div>
    </aside>
  );
};