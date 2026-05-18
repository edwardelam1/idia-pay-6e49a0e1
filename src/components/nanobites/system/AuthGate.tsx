/**
 * NANO-BITE ID: sys.auth.gate
 * NANO-BITE NAME: IDIA Pay Auth Gate
 * ROLE: Identity Verification (rate-limit resilient)
 */

import React, { useRef, useState } from "react";
import HCaptcha from "@hcaptcha/react-hcaptcha";
import { supabase } from "@/integrations/supabase/client";
import { Mail, KeyRound, RotateCcw, ShieldQuestion } from "lucide-react";
import payLogo from "@/assets/idia-pay-logo.jpg";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { LiquidOSErrorBoundary } from "@/lib/error-boundary";
import { logPlanck } from "@/lib/error-capture";

interface AuthGateProps {
  onUnprovisionDevice?: () => void;
}

const HCAPTCHA_SITE_KEY = import.meta.env.VITE_HCAPTCHA_SITE_KEY as string | undefined;

function isRateLimitError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { status?: number; code?: string; message?: string };
  if (e.status === 429) return true;
  if (e.code === "over_email_send_rate_limit") return true;
  if (typeof e.message === "string" && /rate limit/i.test(e.message)) return true;
  return false;
}

function AuthGateCore({ onUnprovisionDevice }: AuthGateProps) {
  const [step, setStep] = useState<"email" | "otp">("email");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [attemptCount, setAttemptCount] = useState(0);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const captchaRef = useRef<HCaptcha>(null);

  const requireCaptcha = attemptCount >= 1 && !!HCAPTCHA_SITE_KEY;

  const handleRequestOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    logPlanck("START", "AUTH_REQUEST", `Requesting OTP for: ${email}`);

    if (!email.trim() || !email.includes("@")) {
      logPlanck("STALL", "VALIDATION_FAIL", "Invalid email format.");
      toast.error("Please enter a valid IDIA Life email address.");
      return;
    }

    if (requireCaptcha && !captchaToken) {
      toast.error("Please complete the captcha challenge.");
      return;
    }

    setIsProcessing(true);
    setAttemptCount((n) => n + 1);

    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: captchaToken ? { captchaToken } : undefined,
      });

      if (error) {
        if (isRateLimitError(error)) {
          logPlanck("STALL", "AUTH_RATE_LIMIT", "Server rate limit hit. Advancing to OTP entry.", error);
          toast.warning("Rate limit hit — if a previous code arrived, enter it below.");
          setStep("otp");
          return;
        }
        throw error;
      }

      logPlanck("END", "AUTH_REQUEST_SUCCESS", "OTP dispatched to email.");
      setStep("otp");
      toast.success("Security code sent. Check your email.");
    } catch (err: unknown) {
      logPlanck("STALL", "AUTH_REQUEST", "Failed to dispatch OTP.", err);
      const message = err instanceof Error ? err.message : "Failed to send security code.";
      toast.error(message);
    } finally {
      captchaRef.current?.resetCaptcha();
      setCaptchaToken(null);
      setIsProcessing(false);
    }
  };

  const handleSkipToOtp = () => {
    if (!email.trim() || !email.includes("@")) {
      toast.error("Enter the email a previous code was sent to first.");
      return;
    }
    logPlanck("TRIGGER", "AUTH_SKIP_TO_OTP", "User has existing code, advancing manually.");
    setStep("otp");
  };

  const handleResetClearance = () => {
    logPlanck("TRIGGER", "AUTH_RESET", "User reset clearance form.");
    setStep("email");
    setEmail("");
    setOtp("");
    setAttemptCount(0);
    setCaptchaToken(null);
    captchaRef.current?.resetCaptcha();
    toast.info("Form cleared. Server cooldown may still apply (~60s).");
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    logPlanck("START", "AUTH_VERIFY", "Submitting OTP for verification.");

    if (otp.length < 6) return;
    setIsProcessing(true);

    try {
      const { error } = await supabase.auth.verifyOtp({
        email: email.trim(),
        token: otp,
        type: "email",
      });
      if (error) throw error;
      // Success triggers onAuthStateChange in TenancyProvider.
    } catch (err: unknown) {
      logPlanck("STALL", "AUTH_VERIFY", "Verification failed.", err);
      const message = err instanceof Error ? err.message : "Authentication sequence failed.";
      toast.error(message);
      setOtp("");
      setIsProcessing(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md rounded-3xl shadow-2xl border-none">
        <CardContent className="p-8 space-y-8">
          <div className="text-center space-y-2">
            <div className="w-20 h-20 mx-auto rounded-2xl overflow-hidden shadow-lg bg-background">
              <img src={payLogo} alt="IDIA Pay" className="w-full h-full object-cover" />
            </div>
            <h1 className="text-3xl font-black text-foreground">IDIA Pay</h1>
            <p className="text-sm text-muted-foreground">Terminal Access Matrix</p>
          </div>

          {step === "email" ? (
            <form onSubmit={handleRequestOtp} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="auth-email" className="text-base font-semibold flex items-center gap-2">
                  <Mail className="w-4 h-4" /> IDIA Life Identity
                </Label>
                <Input
                  id="auth-email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="h-[60px] min-h-[44px] rounded-2xl bg-background border-none text-xl font-bold shadow-sm px-6"
                  disabled={isProcessing}
                />
              </div>

              {requireCaptcha && (
                <div className="flex justify-center">
                  <HCaptcha
                    ref={captchaRef}
                    sitekey={HCAPTCHA_SITE_KEY!}
                    onVerify={(token) => setCaptchaToken(token)}
                    onExpire={() => setCaptchaToken(null)}
                  />
                </div>
              )}
              {attemptCount >= 1 && !HCAPTCHA_SITE_KEY && (
                <p className="text-xs text-muted-foreground text-center">
                  Retry without captcha — server cooldown may still apply.
                </p>
              )}

              <Button
                type="submit"
                disabled={isProcessing || (requireCaptcha && !captchaToken)}
                className="w-full min-h-[72px] text-xl font-black rounded-3xl shadow-lg active:scale-[0.98] transition-transform"
              >
                {isProcessing ? "TRANSMITTING..." : "REQUEST CLEARANCE"}
              </Button>

              <Button
                type="button"
                variant="ghost"
                onClick={handleSkipToOtp}
                disabled={isProcessing}
                className="w-full text-xs uppercase tracking-widest text-muted-foreground"
              >
                <ShieldQuestion className="w-4 h-4 mr-2" /> I Already Have A Code
              </Button>

              {onUnprovisionDevice && (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={onUnprovisionDevice}
                  disabled={isProcessing}
                  className="w-full text-xs uppercase tracking-widest text-muted-foreground"
                >
                  <RotateCcw className="w-4 h-4 mr-2" /> Detach Hardware From Fleet
                </Button>
              )}
            </form>
          ) : (
            <form onSubmit={handleVerifyOtp} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="auth-otp" className="text-base font-semibold flex items-center gap-2">
                  <KeyRound className="w-4 h-4" /> Security Code
                </Label>
                <Input
                  id="auth-otp"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="000000"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/[^0-9]/g, ""))}
                  className="h-[72px] min-h-[44px] rounded-2xl bg-background border-none text-center text-4xl font-black tracking-[0.5em] shadow-sm px-6"
                  maxLength={6}
                  disabled={isProcessing}
                />
                <p className="text-xs text-muted-foreground text-center">Sent to {email}</p>
              </div>

              <div className="space-y-2">
                <Button
                  type="submit"
                  disabled={isProcessing || otp.length < 6}
                  className="w-full min-h-[72px] text-xl font-black rounded-3xl shadow-lg active:scale-[0.98] transition-transform"
                >
                  {isProcessing ? "DECRYPTING..." : "VERIFY & DEPLOY"}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setStep("email");
                    setOtp("");
                  }}
                  disabled={isProcessing}
                  className="w-full"
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={handleResetClearance}
                  disabled={isProcessing}
                  className="w-full text-xs uppercase tracking-widest text-muted-foreground"
                >
                  <RotateCcw className="w-4 h-4 mr-2" /> Reset Form (Server Cooldown ~60s)
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function AuthGate(props: AuthGateProps) {
  return (
    <LiquidOSErrorBoundary>
      <AuthGateCore {...props} />
    </LiquidOSErrorBoundary>
  );
}
