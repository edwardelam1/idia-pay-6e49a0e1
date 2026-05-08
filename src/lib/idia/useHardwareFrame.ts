/**
 * HARDWARE IDENTIFICATION → DEVICE FRAME RESOLVER
 * Returns the physical display envelope the Nano-Bite must conform to.
 * - Real mobile hardware (touch + ≤768 viewport): full-bleed.
 * - Desktop / tablet host: a static, centered phone-shaped frame (390×844).
 * The host page is locked to prevent body scroll/stretch.
 */
import { useEffect, useState } from "react";
import { logPlanck } from "@/lib/error-capture";

export type HardwareFrame = {
  width: number;
  height: number;
  isPhysicalMobile: boolean;
  showChrome: boolean; // render the simulator bezel
};

const PHONE_W = 390;
const PHONE_H = 844;

function detect(): HardwareFrame {
  if (typeof window === "undefined") {
    return { width: PHONE_W, height: PHONE_H, isPhysicalMobile: false, showChrome: true };
  }
  const w = window.innerWidth;
  const h = window.innerHeight;
  const hasTouch = "ontouchstart" in window || navigator.maxTouchPoints > 0;
  const isPhysicalMobile = hasTouch && w <= 768;

  if (isPhysicalMobile) {
    return { width: w, height: h, isPhysicalMobile: true, showChrome: false };
  }
  // Desktop host: clamp to a phone-shaped envelope that fits in the viewport.
  const maxH = Math.min(PHONE_H, h - 32);
  const maxW = Math.min(PHONE_W, Math.floor(maxH * (PHONE_W / PHONE_H)));
  return { width: maxW, height: maxH, isPhysicalMobile: false, showChrome: true };
}

export function useHardwareFrame(): HardwareFrame {
  const [frame, setFrame] = useState<HardwareFrame>(() => detect());

  useEffect(() => {
    const onResize = () => {
      const next = detect();
      logPlanck(
        "PROCESS",
        "HARDWARE_FRAME_RESYNC",
        `viewport=${window.innerWidth}x${window.innerHeight} → frame=${next.width}x${next.height} mobile=${next.isPhysicalMobile}`,
      );
      setFrame(next);
    };
    onResize();
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
    };
  }, []);

  // Lock the host body so the background cannot stretch or scroll.
  useEffect(() => {
    if (typeof document === "undefined") return;
    const prevHtml = document.documentElement.style.overflow;
    const prevBody = document.body.style.overflow;
    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    return () => {
      document.documentElement.style.overflow = prevHtml;
      document.body.style.overflow = prevBody;
    };
  }, []);

  return frame;
}
