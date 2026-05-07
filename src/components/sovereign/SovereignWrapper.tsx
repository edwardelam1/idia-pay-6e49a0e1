/** NANO-BITE: SovereignWrapper (Baseplate) */
import React, { useEffect } from 'react';
import { cn } from '@/lib/utils';

interface SovereignWrapperProps {
  children: React.ReactNode;
  className?: string;
  id?: string;
}

export const SovereignWrapper: React.FC<SovereignWrapperProps> = ({ 
  children, 
  className,
  id = "unnamed-bite"
}) => {
  
  useEffect(() => {
    // UI LAW: Granular logging for lifecycle tracing
    console.log(`[SOVEREIGN_WRAPPER]: START - Mounting surface for ${id}`);
    
    return () => {
      console.log(`[SOVEREIGN_WRAPPER]: END - Unmounting surface for ${id}`);
    };
  }, [id]);

  return (
    <div 
      className={cn(
        // THE LAW: Generous spacing and distinct grouping
        "relative overflow-hidden p-6",
        // Apple 2016 Minimalist Physics
        "bg-white/94 backdrop-blur-[30px]",
        "rounded-[28px]",
        "border border-[#F2F2F7]",
        "shadow-[0_4px_24px_rgba(0,0,0,0.04)]",
        // THE LAW: Visual press state for the container
        "transition-all duration-300 active:scale-[0.995]",
        className
      )}
    >
      {/* Tracing the content render pass to ensure 
        no silent stalling occurs inside children hydration 
      */}
      {(() => {
        console.log(`[SOVEREIGN_WRAPPER]: TRACE - Hydrating internal atoms for ${id}`);
        return children;
      })()}
    </div>
  );
};