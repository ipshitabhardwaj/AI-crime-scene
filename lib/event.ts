import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { EventRow } from "@/lib/types";

/** The single event row, cached per request. */
export const getEvent = cache(async (): Promise<EventRow | null> => {
  const supabase = await createClient();
  const { data } = await supabase.from("event").select("*").eq("id", 1).maybeSingle<EventRow>();
  return data;
});
