-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "bahn";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "control";

-- CreateEnum
CREATE TYPE "control"."EvidenceLevel" AS ENUM ('REQUESTED', 'STATED', 'QUOTED', 'PLANNED', 'BOOKED', 'OBSERVED', 'VERIFIED');

-- CreateEnum
CREATE TYPE "control"."FactSourceType" AS ENUM ('BAHN_RECORD', 'TOOL', 'OPERATOR', 'AGENT_INTERPRETATION');

-- CreateEnum
CREATE TYPE "control"."RunStatus" AS ENUM ('DETECTED', 'GATHERING', 'OPTIONS_READY', 'AWAITING_DECISION', 'EXECUTING', 'CLOSED', 'ESCALATED', 'FAILED');

-- CreateEnum
CREATE TYPE "control"."BlockKind" AS ENUM ('deterministic', 'agent', 'wait', 'human', 'execute');

-- CreateEnum
CREATE TYPE "control"."BlockRunStatus" AS ENUM ('RUNNING', 'WAITING', 'COMPLETED', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "control"."CardKind" AS ENUM ('DECISION', 'TRIAGE');

-- CreateEnum
CREATE TYPE "control"."CardStatus" AS ENUM ('OPEN', 'APPROVED', 'EDITED', 'REJECTED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "control"."AmendmentKind" AS ENUM ('INSTRUCTION', 'PARAMETER');

-- CreateEnum
CREATE TYPE "control"."AmendmentStatus" AS ENUM ('PROPOSED', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "control"."facts" (
    "id" TEXT NOT NULL DEFAULT (gen_random_uuid())::text,
    "order_id" TEXT,
    "run_id" TEXT,
    "kind" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "statement" TEXT NOT NULL,
    "value" JSONB,
    "level" "control"."EvidenceLevel" NOT NULL,
    "source_type" "control"."FactSourceType" NOT NULL,
    "source_ref" TEXT NOT NULL,
    "dedupe_key" TEXT,
    "observed_at" TIMESTAMPTZ(3) NOT NULL,
    "recorded_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "facts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "control"."signals" (
    "id" TEXT NOT NULL DEFAULT (gen_random_uuid())::text,
    "order_id" TEXT,
    "source" TEXT NOT NULL,
    "source_ref" TEXT,
    "trigger_type" TEXT,
    "probability" DOUBLE PRECISION,
    "state" JSONB,
    "answers" JSONB,
    "routing" JSONB,
    "run_id" TEXT,
    "sim_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "signals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "control"."playbook_runs" (
    "id" TEXT NOT NULL DEFAULT (gen_random_uuid())::text,
    "playbook_id" TEXT NOT NULL,
    "order_id" TEXT,
    "trigger_type" TEXT,
    "signal_id" TEXT,
    "status" "control"."RunStatus" NOT NULL DEFAULT 'DETECTED',
    "trigger_run_id" TEXT,
    "current_block_id" TEXT,
    "context" JSONB,
    "result" JSONB,
    "error" TEXT,
    "sim_started_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closed_at" TIMESTAMPTZ(3),

    CONSTRAINT "playbook_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "control"."block_runs" (
    "id" TEXT NOT NULL DEFAULT (gen_random_uuid())::text,
    "run_id" TEXT NOT NULL,
    "block_id" TEXT NOT NULL,
    "kind" "control"."BlockKind" NOT NULL,
    "status" "control"."BlockRunStatus" NOT NULL DEFAULT 'RUNNING',
    "input" JSONB,
    "output" JSONB,
    "error" TEXT,
    "model" TEXT,
    "cost_usd" DOUBLE PRECISION,
    "duration_ms" INTEGER,
    "transcript" JSONB,
    "started_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMPTZ(3),

    CONSTRAINT "block_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "control"."cards" (
    "id" TEXT NOT NULL DEFAULT (gen_random_uuid())::text,
    "run_id" TEXT,
    "order_id" TEXT,
    "playbook_id" TEXT,
    "block_id" TEXT,
    "kind" "control"."CardKind" NOT NULL DEFAULT 'DECISION',
    "status" "control"."CardStatus" NOT NULL DEFAULT 'OPEN',
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "agent_actions" JSONB,
    "fact_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "options" JSONB,
    "decide_by" TIMESTAMPTZ(3),
    "decide_by_reason" TEXT,
    "decision" JSONB,
    "decided_by" TEXT,
    "decided_at" TIMESTAMPTZ(3),
    "waitpoint_token_id" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "control"."amendments" (
    "id" TEXT NOT NULL DEFAULT (gen_random_uuid())::text,
    "playbook_id" TEXT NOT NULL,
    "block_id" TEXT,
    "kind" "control"."AmendmentKind" NOT NULL,
    "text" TEXT NOT NULL,
    "parameters" JSONB,
    "rationale" TEXT,
    "source_card_id" TEXT,
    "backtest" JSONB,
    "status" "control"."AmendmentStatus" NOT NULL DEFAULT 'PROPOSED',
    "proposed_by" TEXT,
    "decided_by" TEXT,
    "decided_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "amendments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "control"."sim_clock" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "anchor_sim" TIMESTAMPTZ(3) NOT NULL,
    "anchor_real" TIMESTAMPTZ(3) NOT NULL,
    "speed" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sim_clock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bahn"."addresses" (
    "id" TEXT NOT NULL,
    "access_note" TEXT,
    "address_line1" TEXT,
    "boundary" TEXT,
    "city" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "managed_site_id" TEXT,
    "name" TEXT NOT NULL,
    "opening_hours" JSONB,
    "order_id" TEXT,
    "raw_input" TEXT NOT NULL,
    "timezone" TEXT NOT NULL,
    "raw" JSONB NOT NULL,

    CONSTRAINT "addresses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bahn"."agent_proposals" (
    "id" TEXT NOT NULL,
    "alert_id" TEXT,
    "command" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL,
    "dependency" JSONB,
    "evidence_refs" JSONB,
    "execution" JSONB,
    "order_id" TEXT NOT NULL,
    "proposed_by_agent_id" TEXT NOT NULL,
    "proposed_payload" JSONB,
    "rationale" TEXT NOT NULL,
    "review" JSONB,
    "status" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "superseded_at" TIMESTAMPTZ(3),
    "superseded_by_proposal_id" TEXT,
    "target_id" TEXT NOT NULL,
    "target_type" TEXT NOT NULL,
    "raw" JSONB NOT NULL,

    CONSTRAINT "agent_proposals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bahn"."agents" (
    "id" TEXT NOT NULL,
    "kind" TEXT,
    "scope" TEXT,
    "title" TEXT,
    "raw" JSONB NOT NULL,

    CONSTRAINT "agents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bahn"."alerts" (
    "id" TEXT NOT NULL,
    "acknowledged_at" TIMESTAMPTZ(3),
    "acknowledgement_reason" TEXT,
    "assignment_id" TEXT,
    "conversation_id" TEXT,
    "decision_evidence_refs" JSONB,
    "driver_report_message_id" TEXT,
    "driver_reported_earliest_departure_at" TIMESTAMPTZ(3),
    "evidence_refs" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "latest_site_conversation_id" TEXT,
    "next_action" TEXT,
    "order_id" TEXT NOT NULL,
    "owner" TEXT,
    "prior_duty_assignment_id" TEXT,
    "prior_duty_observation_id" TEXT,
    "related_work_item_id" TEXT,
    "resolution_evidence_refs" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "resolution_message_id" TEXT,
    "resolution_reason" TEXT,
    "resolved_at" TIMESTAMPTZ(3),
    "severity" TEXT NOT NULL,
    "signal" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "triage_basis_message_id" TEXT,
    "triggered_at" TIMESTAMPTZ(3) NOT NULL,
    "work_owner" TEXT,
    "raw" JSONB NOT NULL,

    CONSTRAINT "alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bahn"."assignment_steps" (
    "id" TEXT NOT NULL,
    "assignment_id" TEXT NOT NULL,
    "cancelled_at" TIMESTAMPTZ(3),
    "completed_at" TIMESTAMPTZ(3),
    "endpoint_detail_id" TEXT,
    "evidence_id" TEXT,
    "evidence_type" TEXT,
    "from_city" TEXT,
    "kind" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "related_document_id" TEXT,
    "reservation_id" TEXT,
    "scheduled_end_at" TIMESTAMPTZ(3),
    "scheduled_start_at" TIMESTAMPTZ(3),
    "sequence" INTEGER NOT NULL,
    "source_option_id" TEXT,
    "source_site_id" TEXT,
    "status" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "to_city" TEXT,
    "transport_point_id" TEXT,
    "raw" JSONB NOT NULL,

    CONSTRAINT "assignment_steps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bahn"."conversations" (
    "id" TEXT NOT NULL,
    "assignment_id" TEXT,
    "assignment_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "category" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "counterparty_id" TEXT,
    "counterparty_name_snapshot" TEXT,
    "counterparty_type" TEXT,
    "follows_conversation_id" TEXT,
    "next_check_at" TIMESTAMPTZ(3),
    "offer_id" TEXT,
    "order_id" TEXT NOT NULL,
    "owner" TEXT,
    "related_order_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "sample_tier" TEXT,
    "started_at" TIMESTAMPTZ(3) NOT NULL,
    "status" TEXT NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "waiting_on" TEXT,
    "raw" JSONB NOT NULL,

    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bahn"."custody_asset_events" (
    "id" TEXT NOT NULL,
    "asset_id" TEXT,
    "kind" TEXT,
    "note" TEXT,
    "occurred_at" TIMESTAMPTZ(3),
    "order_id" TEXT,
    "source_refs" JSONB,
    "verification_status" TEXT,
    "raw" JSONB NOT NULL,

    CONSTRAINT "custody_asset_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bahn"."custody_assets" (
    "id" TEXT NOT NULL,
    "assignment_id" TEXT,
    "current_source_refs" JSONB,
    "followup_due_at" TIMESTAMPTZ(3),
    "followup_owner" TEXT,
    "holder_basis" TEXT,
    "holder_id" TEXT,
    "holder_role" TEXT,
    "kind" TEXT,
    "label" TEXT,
    "next_action" TEXT,
    "order_id" TEXT,
    "order_item_id" TEXT,
    "physical_handover_verified_at" TIMESTAMPTZ(3),
    "related_order_id" TEXT,
    "site_id" TEXT,
    "status" TEXT,
    "vehicle_id" TEXT,
    "raw" JSONB NOT NULL,

    CONSTRAINT "custody_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bahn"."custody_reports" (
    "id" TEXT NOT NULL,
    "assignment_id" TEXT,
    "continuity_evidence_status" TEXT,
    "delivery_event_id" TEXT,
    "driver_id" TEXT,
    "location_evidence_status" TEXT,
    "order_id" TEXT,
    "pickup_event_id" TEXT,
    "reported_at" TIMESTAMPTZ(3),
    "reported_security" TEXT,
    "segment_id" TEXT,
    "source_message_id" TEXT,
    "vehicle_id" TEXT,
    "raw" JSONB NOT NULL,

    CONSTRAINT "custody_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bahn"."customers" (
    "id" TEXT NOT NULL,
    "account_tier" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "raw" JSONB NOT NULL,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bahn"."documents" (
    "id" TEXT NOT NULL,
    "file_count" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "medium" TEXT,
    "order_id" TEXT NOT NULL,
    "point_id" TEXT,
    "required" BOOLEAN NOT NULL,
    "signature_scope" TEXT,
    "status" TEXT NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "raw" JSONB NOT NULL,

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bahn"."drivers" (
    "id" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL,
    "display_name" TEXT NOT NULL,
    "home_city" TEXT NOT NULL,
    "home_country" TEXT NOT NULL,
    "raw" JSONB NOT NULL,

    CONSTRAINT "drivers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bahn"."endpoint_claims" (
    "id" TEXT NOT NULL,
    "claim" TEXT,
    "confidence" TEXT,
    "endpoint_detail_id" TEXT,
    "field" TEXT,
    "order_id" TEXT,
    "recorded_at" TIMESTAMPTZ(3),
    "resolution_basis_message_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "resolution_status" TEXT,
    "resolved_at" TIMESTAMPTZ(3),
    "selected_claim_id" TEXT,
    "source_id" TEXT,
    "source_type" TEXT,
    "raw" JSONB NOT NULL,

    CONSTRAINT "endpoint_claims_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bahn"."expenses" (
    "id" TEXT NOT NULL,
    "amount_cents" INTEGER NOT NULL,
    "assignment_id" TEXT NOT NULL,
    "booking_reference" TEXT,
    "cost_country" TEXT,
    "currency" TEXT NOT NULL,
    "driver_id" TEXT,
    "kind" TEXT NOT NULL,
    "merchant" TEXT,
    "order_id" TEXT NOT NULL,
    "payer" TEXT NOT NULL,
    "provider_basis" TEXT,
    "receipt_count" INTEGER NOT NULL,
    "receipt_fingerprint" TEXT,
    "receipt_state" TEXT,
    "reimbursable_to_driver" BOOLEAN NOT NULL,
    "reservation_id" TEXT,
    "review_note" TEXT,
    "reviewed_at" TIMESTAMPTZ(3),
    "service_at" TIMESTAMPTZ(3),
    "status" TEXT NOT NULL,
    "submission_source" TEXT NOT NULL,
    "submitted_at" TIMESTAMPTZ(3) NOT NULL,
    "superseded_at" TIMESTAMPTZ(3),
    "superseded_by_expense_id" TEXT,
    "supersedes_expense_id" TEXT,
    "raw" JSONB NOT NULL,

    CONSTRAINT "expenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bahn"."ferry_terminal_events" (
    "id" TEXT NOT NULL,
    "assignment_id" TEXT,
    "evidence_note" TEXT,
    "kind" TEXT,
    "occurred_at" TIMESTAMPTZ(3),
    "order_id" TEXT,
    "reason" TEXT,
    "receipt_reference" TEXT,
    "recorded_at" TIMESTAMPTZ(3),
    "reservation_id" TEXT,
    "source" TEXT,
    "terminal_id" TEXT,
    "vehicle_id" TEXT,
    "raw" JSONB NOT NULL,

    CONSTRAINT "ferry_terminal_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bahn"."ferry_terminals" (
    "id" TEXT NOT NULL,
    "city" TEXT,
    "country" TEXT,
    "is_fictional" BOOLEAN,
    "location_precision" TEXT,
    "name" TEXT,
    "note" TEXT,
    "timezone" TEXT,
    "raw" JSONB NOT NULL,

    CONSTRAINT "ferry_terminals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bahn"."incidents" (
    "id" TEXT NOT NULL,
    "assignment_id" TEXT,
    "kind" TEXT,
    "location_verified" BOOLEAN,
    "opened_at" TIMESTAMPTZ(3),
    "order_id" TEXT,
    "owner" TEXT,
    "recovery_decision" TEXT,
    "related_record_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "reported_stop_text" TEXT,
    "reported_symptom" TEXT,
    "resolved_at" TIMESTAMPTZ(3),
    "status" TEXT,
    "warning_photo_status" TEXT,
    "raw" JSONB NOT NULL,

    CONSTRAINT "incidents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bahn"."internal_notifications" (
    "id" TEXT NOT NULL,
    "activity" TEXT,
    "actor_id" TEXT,
    "alert_id" TEXT,
    "delivery_state" TEXT,
    "destination" TEXT,
    "evidence_refs" JSONB,
    "occurred_at" TIMESTAMPTZ(3),
    "order_id" TEXT,
    "preview" TEXT,
    "proposal_id" TEXT,
    "source_triggered_at" TIMESTAMPTZ(3),
    "thread_id" TEXT,
    "raw" JSONB NOT NULL,

    CONSTRAINT "internal_notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bahn"."market_offer_demand_signals" (
    "id" TEXT NOT NULL,
    "driver_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "observed_at" TIMESTAMPTZ(3) NOT NULL,
    "offer_id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "sample_tier" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "raw" JSONB NOT NULL,

    CONSTRAINT "market_offer_demand_signals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bahn"."market_offer_demand_windows" (
    "id" TEXT NOT NULL,
    "activity_regime" TEXT NOT NULL,
    "age_band" TEXT NOT NULL,
    "burst_profile" TEXT NOT NULL,
    "coverage_note" TEXT NOT NULL,
    "offer_id" TEXT NOT NULL,
    "offer_status_at_snapshot" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "pass_count" INTEGER NOT NULL,
    "route_kind" TEXT NOT NULL,
    "sample_tier" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "view_count" INTEGER NOT NULL,
    "window_end_at" TIMESTAMPTZ(3) NOT NULL,
    "window_start_at" TIMESTAMPTZ(3) NOT NULL,
    "raw" JSONB NOT NULL,

    CONSTRAINT "market_offer_demand_windows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bahn"."market_offer_exposures" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3),
    "decided_at" TIMESTAMPTZ(3),
    "driver_id" TEXT,
    "expires_at" TIMESTAMPTZ(3),
    "notified_at" TIMESTAMPTZ(3),
    "offer_id" TEXT,
    "order_id" TEXT,
    "reason" TEXT,
    "shown_at" TIMESTAMPTZ(3),
    "status" TEXT,
    "viewed_at" TIMESTAMPTZ(3),
    "raw" JSONB NOT NULL,

    CONSTRAINT "market_offer_exposures_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bahn"."market_offer_reach_checks" (
    "id" TEXT NOT NULL,
    "attributed_message_id" TEXT,
    "audience_matched_count" INTEGER,
    "checked_at" TIMESTAMPTZ(3),
    "feed_accessible_count" INTEGER,
    "interpretation_note" TEXT,
    "offer_id" TEXT,
    "order_id" TEXT,
    "provisionally_pickup_suitable_count" INTEGER,
    "sample_tier" TEXT,
    "screened_driver_count" INTEGER,
    "source" TEXT,
    "window_end_at" TIMESTAMPTZ(3),
    "window_start_at" TIMESTAMPTZ(3),
    "raw" JSONB NOT NULL,

    CONSTRAINT "market_offer_reach_checks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bahn"."market_offers" (
    "id" TEXT NOT NULL,
    "accepted_at" TIMESTAMPTZ(3),
    "currency" TEXT NOT NULL,
    "execution_assumptions" JSONB,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "fee_cents" INTEGER NOT NULL,
    "lines" JSONB,
    "order_id" TEXT NOT NULL,
    "order_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "pricing_note" TEXT,
    "published_at" TIMESTAMPTZ(3) NOT NULL,
    "segment_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "visibility" TEXT NOT NULL,
    "withdrawn_at" TIMESTAMPTZ(3),
    "raw" JSONB NOT NULL,

    CONSTRAINT "market_offers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bahn"."messages" (
    "id" TEXT NOT NULL,
    "author_id" TEXT NOT NULL,
    "author_name_snapshot" TEXT,
    "author_type" TEXT NOT NULL,
    "authored_at" TIMESTAMPTZ(3) NOT NULL,
    "body" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "evidence_refs" JSONB,
    "language" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "recipient_id" TEXT NOT NULL,
    "recipient_type" TEXT NOT NULL,
    "visibility" TEXT NOT NULL,
    "raw" JSONB NOT NULL,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bahn"."operational_events" (
    "id" TEXT NOT NULL,
    "actor_id" TEXT,
    "actor_type" TEXT NOT NULL,
    "changes" JSONB,
    "command" TEXT NOT NULL,
    "from_state" TEXT,
    "order_id" TEXT NOT NULL,
    "recorded_at" TIMESTAMPTZ(3) NOT NULL,
    "source" TEXT NOT NULL,
    "target_id" TEXT NOT NULL,
    "target_type" TEXT NOT NULL,
    "to_state" TEXT,
    "raw" JSONB NOT NULL,

    CONSTRAINT "operational_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bahn"."operators" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "raw" JSONB NOT NULL,

    CONSTRAINT "operators_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bahn"."order_endpoint_details" (
    "id" TEXT NOT NULL,
    "access_instruction" TEXT NOT NULL,
    "access_status" TEXT NOT NULL,
    "address_id" TEXT NOT NULL,
    "boundary" TEXT NOT NULL,
    "contact_handle" TEXT,
    "contact_name" TEXT,
    "contact_role" TEXT NOT NULL,
    "contact_status" TEXT NOT NULL,
    "last_confirmed_at" TIMESTAMPTZ(3),
    "last_confirmed_source" TEXT,
    "order_id" TEXT NOT NULL,
    "point_id" TEXT NOT NULL,
    "site_id" TEXT,
    "stated_at" TIMESTAMPTZ(3) NOT NULL,
    "stated_by" TEXT NOT NULL,
    "raw" JSONB NOT NULL,

    CONSTRAINT "order_endpoint_details_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bahn"."order_items" (
    "id" TEXT NOT NULL,
    "cmr_mode" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "vehicle_id" TEXT NOT NULL,
    "raw" JSONB NOT NULL,

    CONSTRAINT "order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bahn"."order_notes" (
    "id" TEXT NOT NULL,
    "author_id" TEXT,
    "author_type" TEXT,
    "authored_at" TIMESTAMPTZ(3),
    "body" TEXT,
    "order_id" TEXT,
    "purpose" TEXT,
    "related_record_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "visibility" TEXT,
    "raw" JSONB NOT NULL,

    CONSTRAINT "order_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bahn"."orders" (
    "id" TEXT NOT NULL,
    "active_plan_id" TEXT,
    "cancellation_reason" TEXT,
    "cancelled_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL,
    "customer_id" TEXT NOT NULL,
    "customer_reference" TEXT NOT NULL,
    "delivery_address_id" TEXT NOT NULL,
    "delivery_site_id" TEXT,
    "display_lane" TEXT NOT NULL,
    "pickup_address_id" TEXT NOT NULL,
    "pickup_site_id" TEXT,
    "readiness_status" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "route_kind" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "raw" JSONB NOT NULL,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bahn"."proofs" (
    "id" TEXT NOT NULL,
    "assignment_step_id" TEXT,
    "capture_recipe" JSONB,
    "file_count" INTEGER NOT NULL,
    "instructions" TEXT,
    "kind" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "point_id" TEXT NOT NULL,
    "required" BOOLEAN NOT NULL,
    "required_by" TIMESTAMPTZ(3),
    "review_note" TEXT,
    "reviewed_at" TIMESTAMPTZ(3),
    "source" TEXT,
    "status" TEXT NOT NULL,
    "submitted_at" TIMESTAMPTZ(3),
    "raw" JSONB NOT NULL,

    CONSTRAINT "proofs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bahn"."site_visits" (
    "id" TEXT NOT NULL,
    "arrived_at" TIMESTAMPTZ(3),
    "assignment_id" TEXT,
    "left_at" TIMESTAMPTZ(3),
    "order_id" TEXT,
    "outcome" TEXT,
    "site_id" TEXT,
    "verified_by_site" BOOLEAN,
    "raw" JSONB NOT NULL,

    CONSTRAINT "site_visits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bahn"."sites" (
    "id" TEXT NOT NULL,
    "access_note" TEXT NOT NULL,
    "address_id" TEXT NOT NULL,
    "address_line1" TEXT NOT NULL,
    "advance_notice_minutes" INTEGER NOT NULL,
    "city" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "customer_id" TEXT,
    "delivery_access_note" TEXT NOT NULL,
    "handover_mode" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "opening_hours" JSONB,
    "pickup_access_note" TEXT NOT NULL,
    "pickup_contact_email" TEXT NOT NULL,
    "release_document_rule" TEXT NOT NULL,
    "requires_signed_release" BOOLEAN NOT NULL,
    "timezone" TEXT NOT NULL,
    "raw" JSONB NOT NULL,

    CONSTRAINT "sites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bahn"."support_inbox_messages" (
    "id" TEXT NOT NULL,
    "author_id" TEXT NOT NULL,
    "author_type" TEXT NOT NULL,
    "authored_at" TIMESTAMPTZ(3) NOT NULL,
    "body" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "recipient_id" TEXT NOT NULL,
    "recipient_type" TEXT NOT NULL,
    "thread_id" TEXT NOT NULL,
    "visibility" TEXT NOT NULL,
    "raw" JSONB NOT NULL,

    CONSTRAINT "support_inbox_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bahn"."support_inbox_threads" (
    "id" TEXT NOT NULL,
    "candidate_basis" TEXT,
    "candidate_basis_message_id" TEXT,
    "candidate_order_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "category" TEXT,
    "channel" TEXT,
    "counterparty_id" TEXT,
    "counterparty_type" TEXT,
    "link_state" TEXT,
    "linked_order_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "opened_at" TIMESTAMPTZ(3),
    "owner" TEXT,
    "resolution" JSONB,
    "status" TEXT,
    "updated_at" TIMESTAMPTZ(3),
    "waiting_on" TEXT,
    "raw" JSONB NOT NULL,

    CONSTRAINT "support_inbox_threads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bahn"."terminal_road_estimates" (
    "id" TEXT NOT NULL,
    "approximate_road_distance_km" INTEGER NOT NULL,
    "coverage" TEXT NOT NULL,
    "drive_minutes_high" INTEGER NOT NULL,
    "drive_minutes_low" INTEGER NOT NULL,
    "excludes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "from_city" TEXT NOT NULL,
    "from_country" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "to_terminal_id" TEXT NOT NULL,
    "raw" JSONB NOT NULL,

    CONSTRAINT "terminal_road_estimates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bahn"."time_windows" (
    "id" TEXT NOT NULL,
    "commitment_deadline_at" TIMESTAMPTZ(3),
    "deadline_source" TEXT,
    "deadline_stated_at" TIMESTAMPTZ(3),
    "end_at" TIMESTAMPTZ(3) NOT NULL,
    "is_selected" BOOLEAN NOT NULL,
    "order_id" TEXT NOT NULL,
    "point_id" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "start_at" TIMESTAMPTZ(3) NOT NULL,
    "stated_at" TIMESTAMPTZ(3),
    "timezone" TEXT NOT NULL,
    "raw" JSONB NOT NULL,

    CONSTRAINT "time_windows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bahn"."tracking_observations" (
    "id" TEXT NOT NULL,
    "assignment_id" TEXT NOT NULL,
    "confidence" TEXT,
    "context_note" TEXT,
    "distance_remaining_km" INTEGER NOT NULL,
    "estimated_delivery_at" TIMESTAMPTZ(3) NOT NULL,
    "location_quality" TEXT NOT NULL,
    "observation_kind" TEXT,
    "observed_at" TIMESTAMPTZ(3) NOT NULL,
    "order_id" TEXT NOT NULL,
    "progress_fraction" DOUBLE PRECISION NOT NULL,
    "received_at" TIMESTAMPTZ(3) NOT NULL,
    "reservation_id" TEXT,
    "segment_id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "upload_batch_id" TEXT,
    "raw" JSONB NOT NULL,

    CONSTRAINT "tracking_observations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bahn"."transport_plans" (
    "id" TEXT NOT NULL,
    "activated_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL,
    "order_id" TEXT NOT NULL,
    "replaced_at" TIMESTAMPTZ(3),
    "source" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "raw" JSONB NOT NULL,

    CONSTRAINT "transport_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bahn"."transport_points" (
    "id" TEXT NOT NULL,
    "address_id" TEXT NOT NULL,
    "order_boundary" TEXT,
    "plan_id" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "site_id" TEXT,
    "raw" JSONB NOT NULL,

    CONSTRAINT "transport_points_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bahn"."transport_segments" (
    "id" TEXT NOT NULL,
    "distance_km" INTEGER NOT NULL,
    "from_point_id" TEXT NOT NULL,
    "order_item_id" TEXT NOT NULL,
    "plan_id" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "to_point_id" TEXT NOT NULL,
    "transport_mode" TEXT NOT NULL,
    "raw" JSONB NOT NULL,

    CONSTRAINT "transport_segments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bahn"."travel_confirmations" (
    "id" TEXT NOT NULL,
    "assignment_id" TEXT,
    "kind" TEXT,
    "order_id" TEXT,
    "report" TEXT,
    "reported_at" TIMESTAMPTZ(3),
    "reporter_driver_id" TEXT,
    "reservation_id" TEXT,
    "raw" JSONB NOT NULL,

    CONSTRAINT "travel_confirmations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bahn"."travel_options" (
    "id" TEXT NOT NULL,
    "arrival_at" TIMESTAMPTZ(3) NOT NULL,
    "assignment_id" TEXT,
    "capacity_note" TEXT NOT NULL,
    "check_in_cutoff_at" TIMESTAMPTZ(3),
    "checked_at" TIMESTAMPTZ(3) NOT NULL,
    "connection_count" INTEGER,
    "currency" TEXT NOT NULL,
    "data_origin" TEXT,
    "departure_at" TIMESTAMPTZ(3) NOT NULL,
    "from_city" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "local_transfer_hours" DOUBLE PRECISION,
    "order_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "quote_cents" INTEGER,
    "road_time_to_terminal_hours" INTEGER,
    "status" TEXT NOT NULL,
    "to_city" TEXT NOT NULL,
    "raw" JSONB NOT NULL,

    CONSTRAINT "travel_options_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bahn"."travel_reservations" (
    "id" TEXT NOT NULL,
    "amendment_request" JSONB,
    "arrival_confirmation" TEXT,
    "assignment_id" TEXT NOT NULL,
    "boarding_confirmation" TEXT,
    "booked_at" TIMESTAMPTZ(3) NOT NULL,
    "booking_basis" TEXT,
    "booking_reference" TEXT NOT NULL,
    "cancelled_at" TIMESTAMPTZ(3),
    "check_in_at" TIMESTAMPTZ(3),
    "check_in_confirmation" TEXT,
    "check_in_cutoff_at" TIMESTAMPTZ(3),
    "check_out_at" TIMESTAMPTZ(3),
    "city" TEXT,
    "currency" TEXT,
    "data_origin" TEXT,
    "departure_at" TIMESTAMPTZ(3) NOT NULL,
    "destination_terminal" TEXT,
    "destination_terminal_arrival_confirmation" TEXT,
    "destination_terminal_id" TEXT,
    "expected_arrival_at" TIMESTAMPTZ(3) NOT NULL,
    "fare_cents" INTEGER,
    "from_city" TEXT,
    "itinerary_group_id" TEXT,
    "journey_state" TEXT,
    "journey_state_basis" JSONB,
    "kind" TEXT NOT NULL,
    "leg_sequence" INTEGER,
    "local_transfer_hours" DOUBLE PRECISION,
    "order_id" TEXT NOT NULL,
    "origin_terminal" TEXT,
    "origin_terminal_id" TEXT,
    "provider" TEXT,
    "replacement_evidence_id" TEXT,
    "replacement_reason" TEXT,
    "replacement_reservation_id" TEXT,
    "replaces_reservation_id" TEXT,
    "route_label" TEXT NOT NULL,
    "schedule_basis" JSONB,
    "snapshot_journey_state" TEXT,
    "source_option_id" TEXT,
    "status" TEXT NOT NULL,
    "terminal_road_estimate_id" TEXT,
    "to_city" TEXT,
    "verified_milestones" JSONB,
    "raw" JSONB NOT NULL,

    CONSTRAINT "travel_reservations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bahn"."vehicles" (
    "id" TEXT NOT NULL,
    "fuel" TEXT NOT NULL,
    "make" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "model_year" INTEGER NOT NULL,
    "registration" TEXT,
    "synthetic_vin" TEXT,
    "raw" JSONB NOT NULL,

    CONSTRAINT "vehicles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bahn"."work_assignments" (
    "id" TEXT NOT NULL,
    "accepted_at" TIMESTAMPTZ(3) NOT NULL,
    "cancellation_payout_decision" TEXT,
    "cancellation_reason" TEXT,
    "cancelled_at" TIMESTAMPTZ(3),
    "completed_at" TIMESTAMPTZ(3),
    "currency" TEXT NOT NULL,
    "driver_history" JSONB,
    "driver_id" TEXT NOT NULL,
    "fee_cents" INTEGER NOT NULL,
    "order_id" TEXT NOT NULL,
    "positioning" JSONB,
    "segment_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "source_offer_id" TEXT NOT NULL,
    "started_at" TIMESTAMPTZ(3),
    "status" TEXT NOT NULL,
    "raw" JSONB NOT NULL,

    CONSTRAINT "work_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bahn"."work_items" (
    "id" TEXT NOT NULL,
    "closed_at" TIMESTAMPTZ(3),
    "created_by" TEXT NOT NULL,
    "due_at" TIMESTAMPTZ(3) NOT NULL,
    "kind" TEXT NOT NULL,
    "next_action" TEXT NOT NULL,
    "opened_at" TIMESTAMPTZ(3) NOT NULL,
    "order_id" TEXT NOT NULL,
    "owner" TEXT NOT NULL,
    "priority" TEXT NOT NULL,
    "related_order_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "source_refs" JSONB,
    "status" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "raw" JSONB NOT NULL,

    CONSTRAINT "work_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "facts_dedupe_key_key" ON "control"."facts"("dedupe_key");

-- CreateIndex
CREATE INDEX "facts_order_id_kind_idx" ON "control"."facts"("order_id", "kind");

-- CreateIndex
CREATE INDEX "facts_run_id_idx" ON "control"."facts"("run_id");

-- CreateIndex
CREATE INDEX "facts_subject_idx" ON "control"."facts"("subject");

-- CreateIndex
CREATE INDEX "signals_order_id_sim_at_idx" ON "control"."signals"("order_id", "sim_at");

-- CreateIndex
CREATE INDEX "signals_trigger_type_idx" ON "control"."signals"("trigger_type");

-- CreateIndex
CREATE INDEX "playbook_runs_order_id_idx" ON "control"."playbook_runs"("order_id");

-- CreateIndex
CREATE INDEX "playbook_runs_status_idx" ON "control"."playbook_runs"("status");

-- CreateIndex
CREATE INDEX "playbook_runs_playbook_id_created_at_idx" ON "control"."playbook_runs"("playbook_id", "created_at");

-- CreateIndex
CREATE INDEX "block_runs_run_id_started_at_idx" ON "control"."block_runs"("run_id", "started_at");

-- CreateIndex
CREATE INDEX "cards_status_decide_by_idx" ON "control"."cards"("status", "decide_by");

-- CreateIndex
CREATE INDEX "cards_order_id_idx" ON "control"."cards"("order_id");

-- CreateIndex
CREATE INDEX "cards_run_id_idx" ON "control"."cards"("run_id");

-- CreateIndex
CREATE INDEX "amendments_playbook_id_status_idx" ON "control"."amendments"("playbook_id", "status");

-- CreateIndex
CREATE INDEX "amendments_source_card_id_idx" ON "control"."amendments"("source_card_id");

-- CreateIndex
CREATE INDEX "addresses_order_id_idx" ON "bahn"."addresses"("order_id");

-- CreateIndex
CREATE INDEX "agent_proposals_order_id_idx" ON "bahn"."agent_proposals"("order_id");

-- CreateIndex
CREATE INDEX "alerts_order_id_idx" ON "bahn"."alerts"("order_id");

-- CreateIndex
CREATE INDEX "alerts_status_idx" ON "bahn"."alerts"("status");

-- CreateIndex
CREATE INDEX "assignment_steps_order_id_idx" ON "bahn"."assignment_steps"("order_id");

-- CreateIndex
CREATE INDEX "assignment_steps_assignment_id_sequence_idx" ON "bahn"."assignment_steps"("assignment_id", "sequence");

-- CreateIndex
CREATE INDEX "conversations_order_id_idx" ON "bahn"."conversations"("order_id");

-- CreateIndex
CREATE INDEX "conversations_status_idx" ON "bahn"."conversations"("status");

-- CreateIndex
CREATE INDEX "custody_asset_events_order_id_idx" ON "bahn"."custody_asset_events"("order_id");

-- CreateIndex
CREATE INDEX "custody_asset_events_asset_id_idx" ON "bahn"."custody_asset_events"("asset_id");

-- CreateIndex
CREATE INDEX "custody_assets_order_id_idx" ON "bahn"."custody_assets"("order_id");

-- CreateIndex
CREATE INDEX "custody_reports_order_id_idx" ON "bahn"."custody_reports"("order_id");

-- CreateIndex
CREATE INDEX "documents_order_id_idx" ON "bahn"."documents"("order_id");

-- CreateIndex
CREATE INDEX "endpoint_claims_order_id_idx" ON "bahn"."endpoint_claims"("order_id");

-- CreateIndex
CREATE INDEX "endpoint_claims_endpoint_detail_id_idx" ON "bahn"."endpoint_claims"("endpoint_detail_id");

-- CreateIndex
CREATE INDEX "expenses_order_id_idx" ON "bahn"."expenses"("order_id");

-- CreateIndex
CREATE INDEX "expenses_assignment_id_idx" ON "bahn"."expenses"("assignment_id");

-- CreateIndex
CREATE INDEX "ferry_terminal_events_order_id_idx" ON "bahn"."ferry_terminal_events"("order_id");

-- CreateIndex
CREATE INDEX "incidents_order_id_idx" ON "bahn"."incidents"("order_id");

-- CreateIndex
CREATE INDEX "internal_notifications_order_id_idx" ON "bahn"."internal_notifications"("order_id");

-- CreateIndex
CREATE INDEX "market_offer_demand_signals_order_id_idx" ON "bahn"."market_offer_demand_signals"("order_id");

-- CreateIndex
CREATE INDEX "market_offer_demand_signals_offer_id_idx" ON "bahn"."market_offer_demand_signals"("offer_id");

-- CreateIndex
CREATE INDEX "market_offer_demand_windows_order_id_idx" ON "bahn"."market_offer_demand_windows"("order_id");

-- CreateIndex
CREATE INDEX "market_offer_exposures_order_id_idx" ON "bahn"."market_offer_exposures"("order_id");

-- CreateIndex
CREATE INDEX "market_offer_reach_checks_order_id_idx" ON "bahn"."market_offer_reach_checks"("order_id");

-- CreateIndex
CREATE INDEX "market_offers_order_id_idx" ON "bahn"."market_offers"("order_id");

-- CreateIndex
CREATE INDEX "messages_order_id_idx" ON "bahn"."messages"("order_id");

-- CreateIndex
CREATE INDEX "messages_conversation_id_authored_at_idx" ON "bahn"."messages"("conversation_id", "authored_at");

-- CreateIndex
CREATE INDEX "operational_events_order_id_recorded_at_idx" ON "bahn"."operational_events"("order_id", "recorded_at");

-- CreateIndex
CREATE INDEX "operational_events_target_type_target_id_idx" ON "bahn"."operational_events"("target_type", "target_id");

-- CreateIndex
CREATE INDEX "order_endpoint_details_order_id_idx" ON "bahn"."order_endpoint_details"("order_id");

-- CreateIndex
CREATE INDEX "order_endpoint_details_point_id_idx" ON "bahn"."order_endpoint_details"("point_id");

-- CreateIndex
CREATE INDEX "order_items_order_id_idx" ON "bahn"."order_items"("order_id");

-- CreateIndex
CREATE INDEX "order_notes_order_id_idx" ON "bahn"."order_notes"("order_id");

-- CreateIndex
CREATE UNIQUE INDEX "orders_reference_key" ON "bahn"."orders"("reference");

-- CreateIndex
CREATE INDEX "orders_status_idx" ON "bahn"."orders"("status");

-- CreateIndex
CREATE INDEX "proofs_order_id_idx" ON "bahn"."proofs"("order_id");

-- CreateIndex
CREATE INDEX "site_visits_order_id_idx" ON "bahn"."site_visits"("order_id");

-- CreateIndex
CREATE INDEX "support_inbox_messages_thread_id_idx" ON "bahn"."support_inbox_messages"("thread_id");

-- CreateIndex
CREATE INDEX "time_windows_order_id_idx" ON "bahn"."time_windows"("order_id");

-- CreateIndex
CREATE INDEX "time_windows_point_id_idx" ON "bahn"."time_windows"("point_id");

-- CreateIndex
CREATE INDEX "tracking_observations_order_id_idx" ON "bahn"."tracking_observations"("order_id");

-- CreateIndex
CREATE INDEX "tracking_observations_assignment_id_observed_at_idx" ON "bahn"."tracking_observations"("assignment_id", "observed_at");

-- CreateIndex
CREATE INDEX "transport_plans_order_id_idx" ON "bahn"."transport_plans"("order_id");

-- CreateIndex
CREATE INDEX "transport_points_plan_id_sequence_idx" ON "bahn"."transport_points"("plan_id", "sequence");

-- CreateIndex
CREATE INDEX "transport_segments_plan_id_sequence_idx" ON "bahn"."transport_segments"("plan_id", "sequence");

-- CreateIndex
CREATE INDEX "travel_confirmations_order_id_idx" ON "bahn"."travel_confirmations"("order_id");

-- CreateIndex
CREATE INDEX "travel_options_order_id_idx" ON "bahn"."travel_options"("order_id");

-- CreateIndex
CREATE INDEX "travel_options_assignment_id_idx" ON "bahn"."travel_options"("assignment_id");

-- CreateIndex
CREATE INDEX "travel_reservations_order_id_idx" ON "bahn"."travel_reservations"("order_id");

-- CreateIndex
CREATE INDEX "travel_reservations_assignment_id_idx" ON "bahn"."travel_reservations"("assignment_id");

-- CreateIndex
CREATE INDEX "work_assignments_order_id_idx" ON "bahn"."work_assignments"("order_id");

-- CreateIndex
CREATE INDEX "work_assignments_driver_id_idx" ON "bahn"."work_assignments"("driver_id");

-- CreateIndex
CREATE INDEX "work_items_order_id_idx" ON "bahn"."work_items"("order_id");

-- CreateIndex
CREATE INDEX "work_items_status_idx" ON "bahn"."work_items"("status");

-- AddForeignKey
ALTER TABLE "control"."block_runs" ADD CONSTRAINT "block_runs_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "control"."playbook_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "control"."cards" ADD CONSTRAINT "cards_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "control"."playbook_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
