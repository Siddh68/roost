"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { createClient } from "../../lib/supabase/client";

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.81.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z"
      />
      <path
        fill="#FBBC05"
        d="M3.97 10.72A5.4 5.4 0 0 1 3.68 9c0-.6.1-1.18.29-1.72V4.95H.96A9 9 0 0 0 0 9c0 1.45.35 2.83.96 4.05l3.01-2.33z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.51.46 3.44 1.35l2.59-2.59C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z"
      />
    </svg>
  );
}

interface PasswordStrength {
  score: 0 | 1 | 2 | 3 | 4;
  label: string;
  color: string;
}

function passwordStrength(password: string): PasswordStrength {
  let score = 0;
  if (password.length >= 8) score++;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^a-zA-Z0-9]/.test(password)) score++;

  const levels: PasswordStrength[] = [
    { score: 0, label: "Very weak", color: "var(--danger)" },
    { score: 1, label: "Weak", color: "var(--danger)" },
    { score: 2, label: "Fair", color: "var(--warn)" },
    { score: 3, label: "Good", color: "var(--info)" },
    { score: 4, label: "Strong", color: "var(--accent)" },
  ];
  return levels[score];
}

function LoginContent() {
  const router = useRouter();
  const params = useSearchParams();
  const callbackUrl = params.get("callbackUrl") ?? "/searches";
  const oauthError = params.get("error");

  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const strength = passwordStrength(password);
  const passwordsMismatch = mode === "signup" && confirmPassword.length > 0 && password !== confirmPassword;

  async function handleGoogle() {
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(callbackUrl)}` },
    });
    if (error) setError(error.message);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setMessage(null);
    const supabase = createClient();

    if (mode === "signin") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setError(error.message);
        setSubmitting(false);
        return;
      }
      router.push(callbackUrl);
      router.refresh();
    } else {
      if (password !== confirmPassword) {
        setError("Passwords don't match.");
        setSubmitting(false);
        return;
      }
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: name },
          emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(callbackUrl)}`,
        },
      });
      if (error) {
        setError(error.message);
        setSubmitting(false);
        return;
      }
      if (data.session) {
        router.push(callbackUrl);
        router.refresh();
      } else {
        setMessage("Check your email to confirm your account, then sign in.");
        setMode("signin");
        setSubmitting(false);
      }
    }
  }

  return (
    <div className="mx-auto flex max-w-sm flex-col items-center pt-16 text-center">
      <span className="text-4xl">🪺</span>
      <h1 className="mt-4 text-2xl font-semibold tracking-tight">
        {mode === "signin" ? "Sign in to Roost" : "Create your Roost account"}
      </h1>
      <p className="mt-2 text-sm text-[var(--text-secondary)]">
        Your AI agent for finding and negotiating office space.
      </p>

      {oauthError && (
        <p className="mt-4 w-full rounded-lg border border-[var(--danger)]/40 bg-[var(--danger-dim)] px-3 py-2 text-sm text-[var(--danger)]">
          Sign-in failed — please try again.
        </p>
      )}
      {message && (
        <p className="mt-4 w-full rounded-lg border border-[var(--accent)]/40 bg-[var(--accent-dim)] px-3 py-2 text-sm text-[var(--accent)]">
          {message}
        </p>
      )}

      <form onSubmit={handleSubmit} className="mt-6 w-full space-y-3 text-left">
        {mode === "signup" && (
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">Name</label>
            <input
              type="text"
              required
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="login-input"
            />
          </div>
        )}
        <div>
          <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">Email</label>
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="login-input"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">Password</label>
          <input
            type="password"
            required
            minLength={6}
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="login-input"
          />
          {mode === "signup" && password.length > 0 && (
            <div className="mt-1.5">
              <div className="flex h-1 gap-1">
                {[0, 1, 2, 3].map((i) => (
                  <span
                    key={i}
                    className="flex-1 rounded-full transition-colors"
                    style={{
                      background: i < strength.score ? strength.color : "var(--border)",
                    }}
                  />
                ))}
              </div>
              <p className="mt-1 text-xs" style={{ color: strength.color }}>
                {strength.label}
              </p>
            </div>
          )}
        </div>
        {mode === "signup" && (
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">Confirm password</label>
            <input
              type="password"
              required
              minLength={6}
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="login-input"
            />
            {passwordsMismatch && <p className="mt-1 text-xs text-[var(--danger)]">Passwords don&apos;t match.</p>}
          </div>
        )}

        {error && <p className="text-sm text-[var(--danger)]">{error}</p>}

        <button
          type="submit"
          disabled={submitting || (mode === "signup" && passwordsMismatch)}
          className="w-full rounded-lg bg-[var(--accent)] px-4 py-2.5 text-sm font-medium text-[#06210f] transition hover:opacity-90 disabled:opacity-50"
        >
          {submitting ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}
        </button>
      </form>

      <button
        onClick={() => {
          setMode(mode === "signin" ? "signup" : "signin");
          setError(null);
          setMessage(null);
          setConfirmPassword("");
        }}
        className="mt-3 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
      >
        {mode === "signin" ? "Don't have an account? Sign up" : "Already have an account? Sign in"}
      </button>

      <div className="my-5 flex w-full items-center gap-3">
        <span className="h-px flex-1 bg-[var(--border)]" />
        <span className="text-xs text-[var(--text-secondary)]">or</span>
        <span className="h-px flex-1 bg-[var(--border)]" />
      </div>

      <button
        onClick={handleGoogle}
        className="flex w-full items-center justify-center gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-2.5 text-sm font-medium transition hover:border-[var(--accent)]/40"
      >
        <GoogleIcon />
        Sign in with Google
      </button>

      <style>{`
        .login-input {
          width: 100%;
          border-radius: 0.5rem;
          border: 1px solid var(--border);
          background: var(--surface);
          padding: 0.5rem 0.75rem;
          font-size: 0.875rem;
          color: var(--text-primary);
        }
        .login-input:focus {
          outline: 2px solid var(--accent);
          outline-offset: 1px;
        }
      `}</style>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginContent />
    </Suspense>
  );
}
