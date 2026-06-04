import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

export function isSupabaseConfigured() {
  return (
    url.length > 0 &&
    key.length > 0 &&
    !url.includes("YOUR_PROJECT") &&
    !key.includes("YOUR_SUPABASE")
  );
}

export function createSupabaseClient() {
  if (!isSupabaseConfigured()) return null;
  return createClient(url, key);
}
