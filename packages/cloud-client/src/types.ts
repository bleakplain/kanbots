/**
 * Response/request shapes for the Kanbots Cloud v1 API. These mirror
 * the cloud-side `@kanbots/shared/api-types` definitions but are
 * intentionally duplicated here so the desktop app doesn't need to
 * pull in the cloud's zod runtime.
 */

export interface UserMe {
  id: string;
  primary_email: string;
  display_name: string | null;
  full_name: string | null;
  avatar_url: string | null;
  username: string | null;
  locale: string | null;
  timezone: string | null;
  mfa_enabled: boolean;
  onboarding_completed_at: string | null;
  created_at: string;
}

export type OrgTier = 'free' | 'pro' | 'business' | 'enterprise';
export type OrgRole = 'org:owner' | 'org:admin' | 'org:member' | 'org:guest';

export interface OrgSummary {
  id: string;
  slug: string;
  display_name: string;
  tier: OrgTier;
  role: OrgRole;
  created_at: string;
}

export interface OrgListResponse {
  data: OrgSummary[];
  next_cursor: string | null;
}

export interface CreateOrgRequest {
  display_name: string;
  slug?: string;
}

export interface CreateOrgResponse {
  id: string;
  slug: string;
  display_name: string;
  tier: OrgTier;
  role: OrgRole;
  trial_ends_at: string | null;
  created_at: string;
}

export interface ProjectSummary {
  id: string;
  slug: string;
  display_name: string;
  description: string | null;
  github_repo: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProjectListResponse {
  data: ProjectSummary[];
}

export interface CreateProjectRequest {
  display_name: string;
  slug?: string;
  description?: string;
  github_repo?: string;
}

export type CardStatus =
  | 'inbox'
  | 'backlog'
  | 'ready'
  | 'in_progress'
  | 'review'
  | 'done'
  | 'blocked'
  | 'archived';

export interface CardSummary {
  id: string;
  number: number;
  title: string;
  body: string;
  status: CardStatus;
  position: string;
  assignee_id: string | null;
  reporter_id: string;
  parent_card_id: string | null;
  comment_count: number;
  run_count: number;
  attachment_count: number;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CardListResponse {
  data: CardSummary[];
  next_cursor: string | null;
}

export interface ListCardsQuery {
  status?: CardStatus[];
  assignee_user_id?: string;
  cursor?: string;
  limit?: number;
  include_archived?: boolean;
}

export interface CreateCardRequest {
  title: string;
  body?: string;
  status?: CardStatus;
  position?: string;
  assignee_user_id?: string;
  parent_card_id?: string;
}

export interface UpdateCardRequest {
  title?: string;
  body?: string;
  status?: CardStatus;
  position?: string;
  assignee_user_id?: string | null;
}

export interface CommentSummary {
  id: string;
  card_id: string;
  author_user_id: string;
  body: string;
  edited_at: string | null;
  created_at: string;
}

export interface CommentListResponse {
  data: CommentSummary[];
  next_cursor: string | null;
}

export interface AttachmentSummary {
  id: string;
  card_id: string;
  filename: string;
  content_type: string;
  byte_size: number;
  uploaded_by_user_id: string;
  url: string;
  created_at: string;
}

export interface AttachmentListResponse {
  data: AttachmentSummary[];
}

export type AgentRunStatus =
  | 'pending'
  | 'running'
  | 'awaiting_decision'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'timed_out';

export interface AgentRunSummary {
  id: string;
  card_id: string;
  project_id: string;
  started_by_user_id: string | null;
  cli: string;
  model: string;
  provider: string;
  worktree_path: string | null;
  branch_name: string | null;
  status: AgentRunStatus;
  total_tokens_input: number;
  total_tokens_output: number;
  cost_usd_cents: number;
  event_count: number;
  duration_ms: number | null;
  last_event_at: string | null;
  started_at: string;
  ended_at: string | null;
  stop_reason: string | null;
  resumed_from_run_id: string | null;
  autopilot_session_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface AgentRunListResponse {
  data: AgentRunSummary[];
  next_cursor: string | null;
}

export interface CreateAgentRunRequest {
  cli?: string;
  model?: string;
  provider?: string;
}

export interface ApiErrorBody {
  error: { code: string; message?: string; detail?: unknown };
}
