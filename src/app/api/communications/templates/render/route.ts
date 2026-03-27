import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireUser, getRole, isPrivileged } from "@/lib/apiAuth";
import { renderMessageTemplate } from "@/lib/messaging/render";

export const runtime = "nodejs";

type ContactRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  primary_email: string | null;
  phone: string | null;
  job_title_raw: string | null;
  vertical: string | null;
  status: string | null;
  assigned_to_user_id: string | null;
  owner_user_id: string | null;
  schools?: { name: string | null } | null;
  accounts?: { name: string | null } | null;
};

type TemplateRow = {
  id: string;
  name: string;
  template_key: string | null;
  status: "draft" | "active" | "archived";
  channel: "email" | "linkedin" | "call_script" | "task";
  template_type:
    | "cadence"
    | "product_followup"
    | "linkedin_outreach"
    | "call_script";
  template_scope: string | null;
  audience_stage: "new" | "secured_active";
  vertical: "athletics" | "corporate" | "all";
  subject_template: string | null;
  body_template: string;
  call_to_action: string | null;
};

export async function GET(req: Request) {
  try {
    const auth = await requireUser(req);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const me = auth.user.id;
    const { role, is_active } = await getRole(me);

    if (!is_active) {
      return NextResponse.json({ error: "User inactive" }, { status: 403 });
    }

    const url = new URL(req.url);
    const contact_id = (url.searchParams.get("contact_id") || "").trim();
    const template_id = (url.searchParams.get("template_id") || "").trim();

    if (!contact_id) {
      return NextResponse.json({ error: "contact_id is required" }, { status: 400 });
    }

    if (!template_id) {
      return NextResponse.json({ error: "template_id is required" }, { status: 400 });
    }

    const { data: contact, error: contactErr } = await supabaseAdmin
      .from("contacts")
      .select(`
        id,
        first_name,
        last_name,
        primary_email,
        phone,
        job_title_raw,
        vertical,
        status,
        assigned_to_user_id,
        owner_user_id,
        schools(name),
        accounts!contacts_account_id_fkey(name)
      `)
      .eq("id", contact_id)
      .maybeSingle<ContactRow>();

    if (contactErr) {
      return NextResponse.json({ error: contactErr.message }, { status: 500 });
    }

    if (!contact) {
      return NextResponse.json({ error: "Contact not found" }, { status: 404 });
    }

    if (!isPrivileged(role) && contact.assigned_to_user_id !== me && contact.owner_user_id !== me) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { data: template, error: templateErr } = await supabaseAdmin
      .from("message_templates")
      .select(`
        id,
        name,
        template_key,
        status,
        channel,
        template_type,
        template_scope,
        audience_stage,
        vertical,
        subject_template,
        body_template,
        call_to_action
      `)
      .eq("id", template_id)
      .eq("status", "active")
      .maybeSingle<TemplateRow>();

    if (templateErr) {
      return NextResponse.json({ error: templateErr.message }, { status: 500 });
    }

    if (!template) {
      return NextResponse.json({ error: "Template not found" }, { status: 404 });
    }

    const normalizedContactVertical =
      contact.vertical === "corporate" ? "corporate" : "athletics";

    const contactAudienceStage =
      contact.status === "Secured/Active" ? "secured_active" : "new";

    const verticalMatch =
      template.vertical === "all" || template.vertical === normalizedContactVertical;

    if (!verticalMatch) {
      return NextResponse.json(
        { error: `Template is ${template.vertical} and cannot be used for ${normalizedContactVertical} contacts.` },
        { status: 400 }
      );
    }

    if (template.audience_stage !== contactAudienceStage) {
      return NextResponse.json(
        {
          error: `Template audience_stage is ${template.audience_stage} but contact is ${contactAudienceStage}.`,
        },
        { status: 400 }
      );
    }

    const rendered = renderMessageTemplate(
      {
        ...template,
        product_tree_category: null,
        product_tree_item: null,
      } as any,
      {
        contact: {
          id: contact.id,
          first_name: contact.first_name ?? null,
          last_name: contact.last_name ?? null,
          primary_email: contact.primary_email ?? null,
          phone: contact.phone ?? null,
          job_title_raw: contact.job_title_raw ?? null,
          status: contact.status ?? null,
          vertical: normalizedContactVertical,
          school_name: contact.schools?.name ?? null,
          account_name: contact.accounts?.name ?? null,
        },
        rep: {
          full_name: null,
          email: null,
        },
        opportunity: null,
      }
    );

    return NextResponse.json({
      ok: true,
      id: template.id,
      name: template.name,
      template_key: template.template_key,
      channel: template.channel,
      template_type: template.template_type,
      audience_stage: template.audience_stage,
      vertical: template.vertical,
      subject: rendered.subject ?? "",
      body: rendered.body,
      call_to_action: template.call_to_action ?? null,
      to_email: contact.primary_email ?? null,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Server error" },
      { status: 500 }
    );
  }
}