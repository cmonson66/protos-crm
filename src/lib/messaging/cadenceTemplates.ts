import { supabaseAdmin } from "@/lib/supabaseAdmin";
import type { MessageTemplate } from "./types";

export async function getCadenceMessageTemplate(args: {
  cadenceKey: string;
  step: number;
}) {
  const { data, error } = await supabaseAdmin
    .from("message_templates")
    .select("*")
    .eq("cadence_key", args.cadenceKey)
    .eq("cadence_step", args.step)
    .eq("status", "active")
    .eq("channel", "email")
    .eq("template_type", "cadence")
    .maybeSingle<MessageTemplate>();

  if (error) {
    throw new Error(error.message);
  }

  return data ?? null;
}