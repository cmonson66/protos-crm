export type CommunicationVertical = "athletics" | "corporate";
export type CommunicationAudienceStage = "new" | "secured_active";
export type CommunicationStatus = "draft" | "active" | "archived";
export type CommunicationChannel = "email" | "linkedin" | "sms" | "task";

export type CommunicationSequence = {
  id: string;
  key: string;
  name: string;
  vertical: CommunicationVertical;
  audience_stage: CommunicationAudienceStage;
  status: CommunicationStatus;
  description: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

export type CommunicationSequenceStep = {
  id: string;
  sequence_id: string;
  step_number: number;
  channel: CommunicationChannel;
  template_id: string | null;
  delay_days: number;
  required_contact_status: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type ContactSequenceState = {
  id: string;
  contact_id: string;
  sequence_id: string;
  current_step: number;
  status: "active" | "paused" | "completed" | "stopped";
  next_due_at: string | null;
  started_at: string;
  updated_at: string;
  completed_at: string | null;
  stopped_at: string | null;
  started_by: string | null;
};