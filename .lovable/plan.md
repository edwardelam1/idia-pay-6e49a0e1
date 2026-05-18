
# AuthGate Rate-Limit Recovery

Make `src/components/nanobites/system/AuthGate.tsx` survive Supabase Auth's 429 `over_email_send_rate_limit` so the user is never trapped on the email screen.

## Behavior changes

1. **Always re-enable the button on error** — already correct (`finally { setIsProcessing(false) }`), keep it.
2. **Auto-advance to OTP step on 429.** When `signInWithOtp` returns `over_email_send_rate_limit` (or any 429), still call `setStep("otp")` and show a yellow info toast: "Rate limit hit. If a previous code arrived, enter it below." The user can paste an earlier code rather than being stuck.
3. **"I already have a code" secondary link** on the email step. Visible always (not only on error). Requires a valid email in the field; then jumps to OTP step without calling Supabase.
4. **"Reset Clearance Request" action** on the OTP step. Clears local form state (`email`, `otp`, `step="email"`, `isProcessing=false`, `attemptCount=0`, captcha token). It does NOT and cannot clear Supabase's server-side rate-limit counter — that bucket is enforced per email/IP for ~60s and only time clears it. The button label and helper copy will say: "Reset form (server cooldown ~60s)" so the user isn't misled.
5. **hCaptcha on retry.** Track `attemptCount` in component state. On the **second** OTP request attempt (i.e. after the first failed/429'd send), render an hCaptcha widget and pass its token to `signInWithOtp({ email, options: { captchaToken } })`. Captcha-verified requests are exempt from the IP-level email rate limit in Supabase, which is the only legitimate way to "bypass" the 429 from the client.

## Technical details

**File:** `src/components/nanobites/system/AuthGate.tsx` only. No backend changes, no DB migrations, no edge functions.

**State additions:**
```ts
const [attemptCount, setAttemptCount] = useState(0);
const [captchaToken, setCaptchaToken] = useState<string | null>(null);
const captchaRef = useRef<HCaptcha>(null);
```

**Rate-limit detection:** check both `error.status === 429` and `error.message?.includes("rate limit")` / `error.code === "over_email_send_rate_limit"`.

**hCaptcha integration:**
- Install `@hcaptcha/react-hcaptcha` via `bun add @hcaptcha/react-hcaptcha`.
- Read site key from `import.meta.env.VITE_HCAPTCHA_SITE_KEY`. If unset, log a `STALL` Planck and skip rendering the widget (graceful degrade — second attempt simply retries without captcha and may 429 again).
- **User action required (out of scope of code):** enable CAPTCHA protection in Supabase Auth dashboard → Settings → enter the hCaptcha **secret** key. The site key goes in `.env` as `VITE_HCAPTCHA_SITE_KEY`. The plan does not add the secret automatically — Supabase Auth captcha config lives in the dashboard, not in migrations.

**handleRequestOtp pseudo-flow:**
```text
setAttemptCount(n => n + 1)
const opts = captchaToken ? { captchaToken } : undefined
const { error } = await supabase.auth.signInWithOtp({ email, options: opts })
if (error) {
  if (is429(error)) {
    toast.warning("Rate limit hit — enter previous code if you have one.")
    setStep("otp")          // advance anyway
  } else {
    toast.error(error.message)
  }
  captchaRef.current?.resetCaptcha()
  setCaptchaToken(null)
  return
}
setStep("otp")
```

**Reset Clearance handler:**
```ts
const handleResetClearance = () => {
  setStep("email"); setEmail(""); setOtp("");
  setAttemptCount(0); setCaptchaToken(null);
  captchaRef.current?.resetCaptcha();
  toast.info("Form cleared. Server cooldown may still apply (~60s).");
};
```

**UI placement:**
- Email step: primary "REQUEST CLEARANCE" → if `attemptCount >= 1` render `<HCaptcha />` above the button → secondary ghost link "I already have a code" → existing "Detach Hardware" link.
- OTP step: primary "VERIFY & DEPLOY" → existing "Cancel" → new ghost "Reset Clearance Request".

## Out of scope

- No server-side rate-limit clearing (impossible from the client; Supabase enforces this on their gateway).
- No changes to `TenancyProvider`, `TerminalProvisionGate`, or LiquidOS.
- No new Supabase email template work (token template already correct per prior turn).
- No new server functions or edge functions.

## Risks

- If the user has not added `VITE_HCAPTCHA_SITE_KEY` and enabled captcha in the Supabase dashboard, the "captcha on retry" step silently degrades to a plain retry and may 429 again — the toast will explain.
- "Reset Clearance Request" cannot truly reset the server-side 429 bucket; copy is worded carefully to avoid implying otherwise.
- hCaptcha adds an external script (`hcaptcha.com`) — if the terminal is in a locked-down network this may fail to load; the widget shows its own error UI.
