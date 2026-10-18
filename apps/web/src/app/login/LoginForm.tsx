"use client";

import type { AuthResponse } from "@usap/shared";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { api, ApiRequestError } from "@/lib/api";
import { saveDisplayName } from "@/lib/preferences";
import { saveSession } from "@/lib/session";

type Mode = "login" | "signup";

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  // Only allow same-site paths, so a crafted link can't send people elsewhere after login.
  const nextParam = params.get("next");
  const next = nextParam?.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "/history";

  const [mode, setMode] = useState<Mode>(params.get("mode") === "signup" ? "signup" : "login");
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setFields({});
    try {
      const body = mode === "signup" ? form : { email: form.email, password: form.password };
      const res = await api<AuthResponse>(`/api/auth/${mode}`, { method: "POST", body });
      saveSession(res);
      saveDisplayName(res.user.name); // prefill the name when joining calls
      router.push(next);
    } catch (err) {
      if (err instanceof ApiRequestError) {
        setError(err.message);
        setFields(err.fields);
      } else {
        setError("Something went wrong. Try again.");
      }
    } finally {
      setBusy(false);
    }
  };

  const field = (key: keyof typeof form, label: string, props: React.InputHTMLAttributes<HTMLInputElement>) => (
    <div className="mt-4">
      <label htmlFor={key} className="block text-sm text-neutral-600">
        {label}
      </label>
      <input
        id={key}
        value={form[key]}
        onChange={(e) => setForm({ ...form, [key]: e.target.value })}
        aria-invalid={!!fields[key]}
        aria-describedby={fields[key] ? `${key}-error` : undefined}
        className="mt-1 w-full rounded-lg border border-neutral-300 bg-neutral-50 px-3 py-3 outline-none focus:border-neutral-900 aria-invalid:border-hanko"
        {...props}
      />
      {fields[key] && (
        <p id={`${key}-error`} className="mt-1 text-sm text-hanko">
          {fields[key]}
        </p>
      )}
    </div>
  );

  return (
    <main className="flex min-h-dvh items-center justify-center bg-white px-4 text-neutral-950">
      <form onSubmit={submit} className="w-full max-w-sm" noValidate>
        <Link href="/" className="text-sm text-neutral-500 hover:text-neutral-950">
          ← Usap
        </Link>
        <h1 className="mt-4 text-2xl font-semibold">{mode === "login" ? "Log in" : "Create an account"}</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Logged-in calls are saved with a transcript and an AI summary. You can still join calls as a guest.
        </p>

        {mode === "signup" && field("name", "Name", { autoComplete: "name", maxLength: 40 })}
        {field("email", "Email", { type: "email", autoComplete: "email" })}
        {field("password", "Password", {
          type: "password",
          autoComplete: mode === "login" ? "current-password" : "new-password",
          minLength: 8,
        })}

        {error && !Object.keys(fields).length && (
          <p role="alert" className="mt-4 text-sm text-hanko">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={busy}
          className="mt-6 w-full rounded-lg bg-neutral-950 !text-white px-4 py-3 font-medium hover:bg-neutral-800 disabled:opacity-60"
        >
          {busy ? "Please wait…" : mode === "login" ? "Log in" : "Create account"}
        </button>

        <p className="mt-4 text-center text-sm text-neutral-500">
          {mode === "login" ? "No account yet? " : "Already have an account? "}
          <button
            type="button"
            onClick={() => {
              setMode(mode === "login" ? "signup" : "login");
              setError(null);
              setFields({});
            }}
            className="text-hanko hover:underline"
          >
            {mode === "login" ? "Create one" : "Log in"}
          </button>
        </p>
      </form>
    </main>
  );
}
