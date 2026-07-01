"use client";

/**
 * AdminLogin — the standalone sign-in box shown at `/admin` to anyone who is not
 * an allowlisted admin (the layout renders this INSTEAD of the panel; see
 * `admin-gate.ts`). It is deliberately minimal: just an email → one-time-code
 * flow on a centered card, with NO chat UI, NO admin chrome, and no navigation
 * away — the visitor stays on `/admin`.
 *
 * Two entry states, driven by the `forbiddenEmail` prop the server layout passes:
 *   - `null`  → a guest (no session): show the email → OTP sign-in form.
 *   - set     → signed in, but that email is NOT on the `ADMIN_EMAILS` allowlist:
 *               show a "not an admin account" notice + a Sign-out button so they
 *               can re-authenticate as the admin address.
 *
 * On a verified code we `window.location.reload()`: the server `admin/layout.tsx`
 * gate re-runs, and — if the just-authenticated email is allowlisted — renders
 * the panel. If it is not, the gate returns `forbidden` and this box re-appears
 * in the "not an admin" state. All network calls go through
 * `@/lib/api/auth-client` (no direct `fetch`), keeping this a jsdom-testable unit.
 *
 * Styling: the global `admin-login` BEM block in `src/app/admin/admin.css`.
 */

import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";

import {
  requestCode,
  signOut,
  verifyCode,
  type VerifyCodeResult,
} from "@/lib/api/auth-client";

export interface AdminLoginProps {
  /** When set, the visitor is signed in as this (non-allowlisted) email. */
  forbiddenEmail?: string | null;
  /**
   * Called after the session changes (a code is verified, or the visitor signs
   * out) so the server `admin/layout.tsx` gate re-evaluates. Defaults to a full
   * page reload; overridable in tests (jsdom has no navigation).
   */
  onSessionChanged?: () => void;
}

/** Resend cooldown mirror of the server's 60s `otp-throttle` cooldown. */
const RESEND_COOLDOWN_SECONDS = 60;

/** Light client-side syntactic check (server is authoritative). */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Step = "email" | "code";

type Feedback =
  | { kind: "none" }
  | { kind: "code_sent" }
  | { kind: "invalid_email" }
  | { kind: "rate_limited" }
  | { kind: "email_failed" }
  | { kind: "invalid_code"; attemptsRemaining?: number }
  | { kind: "expired" }
  | { kind: "too_many" }
  | { kind: "error" };

function mapRequestError(error: string | undefined): Feedback {
  switch (error) {
    case "invalid_email":
    case "invalid_request":
      return { kind: "invalid_email" };
    case "rate_limited":
      return { kind: "rate_limited" };
    case "email_failed":
      return { kind: "email_failed" };
    default:
      return { kind: "error" };
  }
}

function mapVerifyError(res: VerifyCodeResult): Feedback {
  switch (res.error) {
    case "invalid_code":
      return { kind: "invalid_code", attemptsRemaining: res.attemptsRemaining };
    case "invalid_or_expired":
      return { kind: "expired" };
    case "too_many_attempts":
      return { kind: "too_many" };
    case "rate_limited":
      return { kind: "rate_limited" };
    default:
      return { kind: "error" };
  }
}

function feedbackMessage(fb: Feedback, email: string): string {
  switch (fb.kind) {
    case "code_sent":
      return `We sent a 6-digit code to ${email}. Enter it below to continue.`;
    case "invalid_email":
      return "Enter a valid email address.";
    case "rate_limited":
      return "Too many requests. Please wait a moment and try again.";
    case "email_failed":
      return "We couldn't send your code right now. Please try again.";
    case "invalid_code": {
      const n = fb.attemptsRemaining;
      const tail =
        typeof n === "number"
          ? ` ${n} attempt${n === 1 ? "" : "s"} remaining.`
          : "";
      return `That code is incorrect.${tail}`;
    }
    case "expired":
      return "That code is no longer valid. Request a new one below.";
    case "too_many":
      return "Too many incorrect attempts. Request a new code below.";
    case "error":
      return "Something went wrong. Please try again.";
    case "none":
      return "";
  }
}

function isError(kind: Feedback["kind"]): boolean {
  return kind !== "none" && kind !== "code_sent";
}

/** Reload so the server admin gate re-evaluates the (new) session. */
function reloadIntoPanel(): void {
  if (typeof window !== "undefined") window.location.reload();
}

export default function AdminLogin({
  forbiddenEmail = null,
  onSessionChanged = reloadIntoPanel,
}: AdminLoginProps) {
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>({ kind: "none" });
  const [cooldown, setCooldown] = useState(0);

  const emailRef = useRef<HTMLInputElement>(null);
  const codeRef = useRef<HTMLInputElement>(null);

  const cooldownActive = cooldown > 0;
  useEffect(() => {
    if (!cooldownActive) return;
    const id = setInterval(() => {
      setCooldown((c) => (c <= 1 ? 0 : c - 1));
    }, 1000);
    return () => clearInterval(id);
  }, [cooldownActive]);

  // Focus the active field for keyboard users (guests only; the forbidden state
  // shows no form).
  useEffect(() => {
    if (forbiddenEmail) return;
    if (step === "email") emailRef.current?.focus();
    else codeRef.current?.focus();
  }, [step, forbiddenEmail]);

  async function submitEmail(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting) return;
    const trimmed = email.trim();
    if (!EMAIL_RE.test(trimmed)) {
      setFeedback({ kind: "invalid_email" });
      return;
    }
    setSubmitting(true);
    const res = await requestCode(trimmed);
    setSubmitting(false);
    if (res.ok) {
      setEmail(trimmed);
      setCode("");
      setStep("code");
      setFeedback({ kind: "code_sent" });
      setCooldown(RESEND_COOLDOWN_SECONDS);
      return;
    }
    setFeedback(mapRequestError(res.error));
  }

  async function submitCode(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting) return;
    const trimmed = code.trim();
    if (trimmed.length === 0) return;
    setSubmitting(true);
    const res = await verifyCode(email, trimmed);
    if (res.ok) {
      // Session cookie is now set; re-run the server gate.
      onSessionChanged();
      return;
    }
    setSubmitting(false);
    setFeedback(mapVerifyError(res));
  }

  async function resend() {
    if (submitting || cooldown > 0) return;
    setSubmitting(true);
    const res = await requestCode(email);
    setSubmitting(false);
    if (res.ok) {
      setCode("");
      setFeedback({ kind: "code_sent" });
      setCooldown(RESEND_COOLDOWN_SECONDS);
      return;
    }
    setFeedback(mapRequestError(res.error));
  }

  function changeEmail() {
    setStep("email");
    setCode("");
    setCooldown(0);
    setFeedback({ kind: "none" });
  }

  async function handleSignOut() {
    if (signingOut) return;
    setSigningOut(true);
    await signOut();
    onSessionChanged();
  }

  const message = feedbackMessage(feedback, email);

  return (
    <div className="admin-login" data-testid="admin-login">
      <div className="admin-login__card" role="dialog" aria-labelledby="admin-login-title">
        <div className="admin-login__brand" aria-hidden="true">
          <span className="admin-login__logo" />
          <span className="admin-login__wordmark">Oak</span>
        </div>
        <h1 id="admin-login-title" className="admin-login__title">
          Admin sign-in
        </h1>

        {forbiddenEmail ? (
          // Signed in, but not on the allowlist.
          <div data-testid="admin-login-forbidden">
            <p className="admin-login__notice" role="alert">
              You&apos;re signed in as <strong>{forbiddenEmail}</strong>, which is
              not an authorized admin account.
            </p>
            <button
              type="button"
              data-testid="admin-login-signout"
              onClick={handleSignOut}
              disabled={signingOut}
              className="admin-login__submit"
            >
              {signingOut ? "Signing out…" : "Sign out"}
            </button>
            <p className="admin-login__hint">
              Sign out, then sign in with an admin email.
            </p>
          </div>
        ) : (
          <>
            {message && (
              <p
                data-testid="admin-login-feedback"
                data-kind={feedback.kind}
                data-error={isError(feedback.kind)}
                role={isError(feedback.kind) ? "alert" : "status"}
                className="admin-login__feedback"
              >
                {message}
              </p>
            )}

            {step === "email" ? (
              <form
                data-testid="admin-login-email-step"
                onSubmit={submitEmail}
                className="admin-login__form"
              >
                <p className="admin-login__intro">
                  Enter your admin email and we&apos;ll send a one-time code.
                </p>
                <label className="admin-login__label">
                  Email
                  <input
                    ref={emailRef}
                    data-testid="admin-login-email-input"
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    aria-label="Email address"
                    className="admin-login__input"
                  />
                </label>
                <button
                  type="submit"
                  data-testid="admin-login-send-code"
                  disabled={submitting || email.trim().length === 0}
                  className="admin-login__submit"
                >
                  {submitting ? "Sending…" : "Send code"}
                </button>
              </form>
            ) : (
              <form
                data-testid="admin-login-code-step"
                onSubmit={submitCode}
                className="admin-login__form"
              >
                <label className="admin-login__label">
                  6-digit code
                  <input
                    ref={codeRef}
                    data-testid="admin-login-code-input"
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    value={code}
                    onChange={(e) =>
                      setCode(e.target.value.replace(/\D/g, "").slice(0, 6))
                    }
                    placeholder="123456"
                    aria-label="One-time code"
                    className="admin-login__input admin-login__input--code"
                  />
                </label>
                <button
                  type="submit"
                  data-testid="admin-login-verify"
                  disabled={submitting || code.trim().length === 0}
                  className="admin-login__submit"
                >
                  {submitting ? "Verifying…" : "Verify"}
                </button>

                <div className="admin-login__resend-row">
                  <button
                    type="button"
                    data-testid="admin-login-resend"
                    onClick={resend}
                    disabled={submitting || cooldown > 0}
                    className="admin-login__link"
                  >
                    Resend code
                  </button>
                  {cooldown > 0 && (
                    <span
                      data-testid="admin-login-countdown"
                      aria-live="polite"
                      className="admin-login__countdown"
                    >
                      Resend in {cooldown}s
                    </span>
                  )}
                </div>

                <button
                  type="button"
                  data-testid="admin-login-change-email"
                  onClick={changeEmail}
                  className="admin-login__link admin-login__link--inline"
                >
                  Use a different email
                </button>
              </form>
            )}
          </>
        )}
      </div>
    </div>
  );
}
