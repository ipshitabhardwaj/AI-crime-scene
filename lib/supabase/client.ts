"use client";

import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Browser client for PUBLIC reads only (the event row and the server clock,
 * which the projector can read without logging in). It deliberately carries
 * no login session: session refresh happens in exactly one place, the server
 * proxy (proxy.ts). A second refresher in the browser could reuse the same
 * refresh token at the same moment as the server and end the session of a
 * team that shares one login across several laptops.
 * All team writes go through server actions, never through this client.
 */
let client: SupabaseClient | null = null;

export function createClient(): SupabaseClient {
  client ??= createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return client;
}
