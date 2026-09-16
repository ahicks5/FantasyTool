// Supabase magic-link auth. Only active when both public env vars are set.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

let client: SupabaseClient | null = null;

export function supabaseConfigured(): boolean {
  return !!(url && anon);
}

export function supabase(): SupabaseClient | null {
  if (!supabaseConfigured()) return null;
  if (!client) client = createClient(url!, anon!);
  return client;
}

export async function getAccessToken(): Promise<string | null> {
  const sb = supabase();
  if (!sb) return null;
  const { data } = await sb.auth.getSession();
  return data.session?.access_token ?? null;
}

export async function getUserEmail(): Promise<string | null> {
  const sb = supabase();
  if (!sb) return process.env.NEXT_PUBLIC_DEV_USER ?? null;
  const { data } = await sb.auth.getUser();
  return data.user?.email ?? null;
}

export async function sendMagicLink(email: string): Promise<void> {
  const sb = supabase();
  if (!sb) throw new Error("Login is not configured.");
  const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: `${window.location.origin}/login` } });
  if (error) throw new Error(error.message);
}

export async function signOut(): Promise<void> {
  await supabase()?.auth.signOut();
}
