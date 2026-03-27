import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { renderMessageTemplate } from "./render";
import type { MessageTemplate, RenderContext } from "./types";

export async function getMessageTemplateById(templateId: string) {
  const { data, error } = await supabaseAdmin
    .from("message_templates")
    .select("*")
    .eq("id", templateId)
    .single<MessageTemplate>();

  if (error) throw new Error(error.message);
  return data;
}

export async function listMessageTemplates(params: {
  channel?: "email" | "linkedin" | "call_script";
  template_type?: "cadence" | "product_followup" | "linkedin_outreach" | "call_script";
    audience_stage?: "new" | "secured_active";
  vertical?: "athletics" | "corporate" | "all";
  product_tree_category?: string | null;
  product_tree_item?: string | null;
  status?: "draft" | "active" | "archived";
}) {
  let query = supabaseAdmin.from("message_templates").select("*");

  if (params.channel) query = query.eq("channel", params.channel);
  if (params.template_type) query = query.eq("template_type", params.template_type);
  if (params.audience_stage) query = query.eq("audience_stage", params.audience_stage);
  if (params.vertical) query = query.eq("vertical", params.vertical);
  if (params.status) query = query.eq("status", params.status);
  if (params.product_tree_category) {
    query = query.eq("product_tree_category", params.product_tree_category);
  }
  if (params.product_tree_item) {
    query = query.eq("product_tree_item", params.product_tree_item);
  }

  const { data, error } = await query.order("updated_at", { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []) as MessageTemplate[];
}

export async function renderTemplateById(args: {
  templateId: string;
  context: RenderContext;
}) {
  const template = await getMessageTemplateById(args.templateId);
  return renderMessageTemplate(template, args.context);
}

export async function logContactMessage(args: {
  contact_id: string;
  opportunity_id?: string | null;
  template_id?: string | null;
  cadence_key?: string | null;
  cadence_step?: number | null;
  channel: "email" | "linkedin" | "call_script";
  subject_rendered?: string | null;
  body_rendered: string;
  delivery_status: "draft" | "copied" | "sent" | "failed" | "logged";
  sent_by?: string | null;
  external_message_id?: string | null;
}) {
  const { error } = await supabaseAdmin.from("contact_messages").insert({
    contact_id: args.contact_id,
    opportunity_id: args.opportunity_id ?? null,
    template_id: args.template_id ?? null,
    cadence_key: args.cadence_key ?? null,
    cadence_step: args.cadence_step ?? null,
    channel: args.channel,
    direction: "outbound",
    subject_rendered: args.subject_rendered ?? null,
    body_rendered: args.body_rendered,
    delivery_status: args.delivery_status,
    sent_by: args.sent_by ?? null,
    external_message_id: args.external_message_id ?? null,
    sent_at: new Date().toISOString(),
  });

  if (error) throw new Error(error.message);
}