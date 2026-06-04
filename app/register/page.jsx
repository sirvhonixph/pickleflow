"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import Link from "next/link";
import { createSupabaseClient, isSupabaseConfigured } from "@/lib/supabase";
import { SKILL_CATEGORIES } from "@/lib/categories";
import { saveCurrentUser } from "@/lib/session";
import { registerPlayerProfile } from "@/lib/events";

export default function RegisterPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    dupr: "",
    password: "",
    category: "",
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
    if (!form.category) {
      setError("Please choose your skill category.");
      setLoading(false);
      return;
    }

    if (isSupabaseConfigured()) {
      const supabase = createSupabaseClient();
      const { data, error: authError } = await supabase.auth.signUp({
        email: form.email,
        password: form.password,
        options: {
          data: {
            first_name: form.firstName,
            last_name: form.lastName,
            phone: form.phone,
            dupr_id: form.dupr,
            category: form.category,
          },
        },
      });
      if (authError) {
        setError(authError.message);
        setLoading(false);
        return;
      }
      if (data.user) {
        const { error: profileError } = await supabase.from("profiles").upsert({
          id: data.user.id,
          first_name: form.firstName,
          last_name: form.lastName,
          email: form.email.trim().toLowerCase(),
          phone: form.phone,
          dupr_id: form.dupr,
          category: form.category,
        });
        if (profileError) {
          console.warn("Profile save:", profileError.message);
        }
      }
      const profile = {
        email: form.email.trim().toLowerCase(),
        name: `${form.firstName} ${form.lastName}`.trim(),
        category: form.category,
        dupr: form.dupr,
        mode: "supabase",
      };
      const player = await registerPlayerProfile(profile);
      saveCurrentUser({ ...profile, name: player.name ?? profile.name });
    } else {
      const profile = {
        email: form.email.trim().toLowerCase(),
        name: `${form.firstName} ${form.lastName}`.trim(),
        category: form.category,
        dupr: form.dupr,
        mode: "demo",
      };
      const player = await registerPlayerProfile(profile);
      saveCurrentUser({ ...profile, name: player.name ?? profile.name });
    }

    setLoading(false);
    router.push("/dashboard");
    } catch (err) {
      setError(err.message ?? "Registration failed");
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-950 text-white flex justify-center items-center py-10 px-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-xl bg-slate-900 p-8 rounded-2xl border border-slate-800"
      >
        <h1 className="text-3xl font-bold mb-2 text-center">
          Player Registration
        </h1>
        <p className="text-center text-slate-400 text-sm mb-6">
          {isSupabaseConfigured()
            ? "Create your PickleFlow account"
            : "Demo mode — data saved locally until Supabase is set up"}
        </p>

        {error && (
          <p className="mb-4 rounded-lg bg-red-500/20 px-3 py-2 text-sm text-red-300">
            {error}
          </p>
        )}

        <div className="grid grid-cols-2 gap-4">
          <input
            placeholder="First Name"
            required
            className="p-3 rounded-lg bg-slate-800 border border-slate-700"
            value={form.firstName}
            onChange={(e) =>
              setForm({ ...form, firstName: e.target.value })
            }
          />
          <input
            placeholder="Last Name"
            required
            className="p-3 rounded-lg bg-slate-800 border border-slate-700"
            value={form.lastName}
            onChange={(e) =>
              setForm({ ...form, lastName: e.target.value })
            }
          />
        </div>

        <input
          type="email"
          placeholder="Email"
          required
          className="w-full p-3 rounded-lg bg-slate-800 border border-slate-700 mt-4"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
        />

        <input
          placeholder="Phone Number"
          className="w-full p-3 rounded-lg bg-slate-800 border border-slate-700 mt-4"
          value={form.phone}
          onChange={(e) => setForm({ ...form, phone: e.target.value })}
        />

        <input
          placeholder="DUPR ID (optional)"
          className="w-full p-3 rounded-lg bg-slate-800 border border-slate-700 mt-4"
          value={form.dupr}
          onChange={(e) => setForm({ ...form, dupr: e.target.value })}
        />

        <div className="mt-4">
          <label className="block text-sm text-slate-400 mb-2">
            Skill category <span className="text-red-400">*</span>
          </label>
          <div className="grid grid-cols-2 gap-2">
            {SKILL_CATEGORIES.map((cat) => (
              <button
                key={cat.value}
                type="button"
                onClick={() => setForm({ ...form, category: cat.value })}
                className={`p-3 rounded-lg border text-sm font-medium transition ${
                  form.category === cat.value
                    ? "border-cyan-500 bg-cyan-500/20 text-cyan-300"
                    : "border-slate-700 hover:border-slate-600"
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </div>

        <input
          type="password"
          placeholder="Password"
          required
          minLength={6}
          className="w-full p-3 rounded-lg bg-slate-800 border border-slate-700 mt-4"
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
        />

        <button
          type="submit"
          disabled={loading}
          className="w-full p-3 mt-6 bg-gradient-to-r from-cyan-500 to-purple-500 rounded-lg font-bold disabled:opacity-50"
        >
          {loading ? "Creating account…" : "Create Account"}
        </button>

        <p className="text-center mt-5 text-slate-400">
          Already have an account?{" "}
          <Link href="/login" className="text-cyan-400 hover:underline">
            Log in
          </Link>
        </p>
      </form>
    </main>
  );
}
