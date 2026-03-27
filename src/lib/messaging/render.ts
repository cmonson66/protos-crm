import type { MessageTemplate, RenderContext, RenderedMessage } from "./types";

function safe(value: unknown) {
  return String(value ?? "").trim();
}

function fullName(ctx: RenderContext) {
  return [safe(ctx.contact.first_name), safe(ctx.contact.last_name)]
    .filter(Boolean)
    .join(" ")
    .trim();
}

function orgName(ctx: RenderContext) {
  return safe(ctx.contact.account_name || ctx.contact.school_name);
}

function productName(ctx: RenderContext) {
  return (
    safe(ctx.opportunity?.custom_product_name) ||
    safe(ctx.opportunity?.product_name) ||
    safe(ctx.opportunity?.product_subcategory) ||
    safe(ctx.opportunity?.product_category) ||
    safe(ctx.opportunity?.product_family)
  );
}

function appendSignature(
  body: string,
  template: MessageTemplate,
  ctx: RenderContext
) {
  const trimmedBody = String(body || "").trimEnd();

  const repName = safe(ctx.rep.full_name);
  const repEmail = safe(ctx.rep.email);

  if (template.channel === "email") {
    const signatureLines = [
      "Best,",
      "",
      repName,
      repEmail,
      "",
      "Protos EQ",
      "Transforming Teams From The Inside Out",
    ].filter((line, index, arr) => {
      if (line) return true;

      const prev = arr[index - 1];
      const next = arr[index + 1];
      return Boolean(prev || next);
    });

    return `${trimmedBody}\n\n${signatureLines.join("\n")}`.trim();
  }

  if (template.channel === "linkedin") {
    const signatureLines = [
      "—",
      repName,
      "Protos EQ",
    ].filter(Boolean);

    return `${trimmedBody}\n\n${signatureLines.join("\n")}`.trim();
  }

  return trimmedBody;
}

function replaceTokens(input: string, ctx: RenderContext) {
  const tokens: Record<string, string> = {
    "{{first_name}}": safe(ctx.contact.first_name) || "there",
    "{{last_name}}": safe(ctx.contact.last_name),
    "{{full_name}}": fullName(ctx),
    "{{email}}": safe(ctx.contact.primary_email),
    "{{phone}}": safe(ctx.contact.phone),
    "{{job_title}}": safe(ctx.contact.job_title_raw),
    "{{status}}": safe(ctx.contact.status),
    "{{school_name}}": safe(ctx.contact.school_name),
    "{{account_name}}": safe(ctx.contact.account_name),
    "{{organization}}": orgName(ctx),
    "{{rep_name}}": safe(ctx.rep.full_name),
    "{{rep_email}}": safe(ctx.rep.email),
    "{{product_name}}": productName(ctx),
    "{{product_family}}": safe(ctx.opportunity?.product_family),
    "{{product_category}}": safe(ctx.opportunity?.product_category),
    "{{product_subcategory}}": safe(ctx.opportunity?.product_subcategory),
    "{{sales_stage}}": safe(ctx.opportunity?.sales_stage_key),
  };

  let out = input;
  for (const [token, value] of Object.entries(tokens)) {
    out = out.split(token).join(value);
  }
  return out;
}

export function renderMessageTemplate(
  template: MessageTemplate,
  ctx: RenderContext
): RenderedMessage {
  const subject = template.subject_template
    ? replaceTokens(template.subject_template, ctx)
    : null;

  const baseBody = replaceTokens(template.body_template, ctx);
  const finalBody = appendSignature(baseBody, template, ctx);

  return {
    subject,
    body: finalBody,
  };
}