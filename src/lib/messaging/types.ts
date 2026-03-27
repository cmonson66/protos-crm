export type MessageChannel = "email" | "linkedin" | "call_script" | "task";

export type TemplateType =
  | "cadence"
  | "product_followup"
  | "linkedin_outreach"
  | "call_script";

export type AudienceStage = "new" | "secured_active";
export type Vertical = "athletics" | "corporate" | "all";

export type MessageTemplate = {
  id: string;
  name: string;
  template_key: string | null;
  status: "draft" | "active" | "archived";
  channel: MessageChannel;
  template_type: TemplateType;
  template_scope: string | null;
  audience_stage: AudienceStage;
  vertical: Vertical;
  product_tree_family?: string | null;
  product_tree_category: string | null;
  product_tree_subcategory?: string | null;
  product_tree_item: string | null;
  subject_template: string | null;
  body_template: string;
  call_to_action: string | null;
  created_by?: string | null;
  updated_by?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type RenderContext = {
  contact: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    primary_email: string | null;
    phone: string | null;
    job_title_raw: string | null;
    status: string | null;
    vertical: "athletics" | "corporate";
    school_name?: string | null;
    account_name?: string | null;
    sport?: string | null;
    division?: string | null;
    conference?: string | null;
    region?: string | null;
  };
  rep: {
    id?: string | null;
    full_name: string | null;
    email: string | null;
  };
  opportunity?: {
    id: string;
    product_family?: string | null;
    product_category?: string | null;
    product_subcategory?: string | null;
    product_name?: string | null;
    custom_product_name?: string | null;
    sales_stage_key?: string | null;
  } | null;
};

export type RenderedMessage = {
  subject: string | null;
  body: string;
};