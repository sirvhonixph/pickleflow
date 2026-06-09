"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createSupabaseClient, isSupabaseConfigured } from "@/lib/supabase";
import { getCurrentUser, saveCurrentUser } from "@/lib/session";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    if (isSupabaseConfigured()) {
      const supabase = createSupabaseClient();
      const { error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (authError) {
        setError(authError.message);
        setLoading(false);
        return;
      }
    } else {
      if (!email.trim()) {
        setError("Enter your email");
        setLoading(false);
        return;
      }
      const existing = getCurrentUser();
      saveCurrentUser({
        email: email.trim(),
        name:
          existing?.email === email.trim() && existing?.name
            ? existing.name
            : "",
        category: existing?.email === email.trim() ? existing.category : "",
        mode: "demo",
      });
    }

    setLoading(false);
    router.push("/dashboard");
  };

  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-950 text-white px-4">
      <form
        onSubmit={handleLogin}
        className="w-full max-w-md bg-slate-900 p-8 rounded-2xl border border-slate-800"
      >
        <h1 className="text-3xl font-bold text-center mb-2">Login</h1>
        <p className="text-center text-slate-400 text-sm mb-8">
          {isSupabaseConfigured()
            ? "Sign in with your account"
            : "Demo mode — local app, email only"}
        </p>

        {error && (
          <p className="mb-4 rounded-lg bg-red-500/20 px-3 py-2 text-sm text-red-300">
            {error}
          </p>
        )}

        <input
          type="email"
          placeholder="Email"
          required
          className="w-full p-3 rounded-lg bg-slate-800 border border-slate-700 mb-4"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        {isSupabaseConfigured() && (
          <input
            type="password"
            placeholder="Password"
            required
            className="w-full p-3 rounded-lg bg-slate-800 border border-slate-700 mb-6"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full p-3 bg-cyan-500 text-black font-bold rounded-lg disabled:opacity-50"
        >
          {loading ? "Signing in…" : "Login"}
        </button>

        <p className="text-center mt-5 text-slate-400">
          No account?
          <Link href="/register" className="text-cyan-400 ml-2 hover:underline">
            Register
          </Link>
        </p>

        <p className="text-center mt-4 text-slate-500 text-sm">
          <Link href="/" className="hover:text-cyan-400">
            ← Back to home
          </Link>
        </p>
      </form>
    </main>
  );
}
