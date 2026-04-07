import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export function Register() {
  const { register } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setPending(true);
    try {
      await register(email.trim(), password);
      nav("/app", { replace: true });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "";
      if (msg.includes("EMAIL_TAKEN") || msg.includes("409"))
        setErr("This email is already registered");
      else setErr(msg || "Could not create account");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mx-auto max-w-md px-5 py-24 sm:py-28">
      <div className="opacity-0-start animate-fade-up">
        <h1 className="font-display text-3xl font-semibold tracking-tight text-primary">
          Create account
        </h1>
        <p className="mt-3 text-body text-secondary font-light">
          Already registered?{" "}
          <Link
            to="/login"
            className="text-violet-300/90 underline-offset-4 transition hover:text-violet-200 hover:underline"
          >
            Log in
          </Link>
        </p>
      </div>

      <form
        onSubmit={onSubmit}
        className="glass-panel mt-12 space-y-6 p-8 opacity-0-start animate-fade-up delay-2"
      >
        <div>
          <label className="block text-xs font-medium uppercase tracking-wider text-secondary">
            Email
          </label>
          <input
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="input-dark mt-2"
            required
          />
        </div>
        <div>
          <label className="block text-xs font-medium uppercase tracking-wider text-secondary">
            Password (min. 8 characters)
          </label>
          <input
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="input-dark mt-2"
            required
            minLength={8}
          />
        </div>
        {err && (
          <p className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200/90">
            {err}
          </p>
        )}
        <button type="submit" disabled={pending} className="btn-gradient w-full py-3.5">
          {pending ? "Creating…" : "Create account"}
        </button>
      </form>
    </div>
  );
}
