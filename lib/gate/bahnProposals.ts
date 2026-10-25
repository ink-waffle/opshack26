// Maps Bahn's recorded agent_proposals (command + payload) into the gate's proposal shape, for backtests and replays.

import { bahnRecordId, type FactLike } from '@/lib/facts/types';
import type { Proposal, ProposalAction } from '@/lib/gate/check';
import type { BahnAgentProposal } from '@/lib/generated/prisma/client';

export type BahnProposalRow = Pick<
  BahnAgentProposal,
  | 'id'
  | 'orderId'
  | 'command'
  | 'proposedPayload'
  | 'review'
  | 'evidenceRefs'
  | 'summary'
  | 'createdAt'
>;

type Payload = Record<string, unknown>;

const RECORD_ID = /^(?:[a-z]+-x[0-9a-f]{8,}|ord-\d{5}|win-x[0-9a-f]+|terminal-x[0-9a-f]+)$/;

function list(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String) : [];
}

// Command → actions; the full payload rides on every action so structural checks see it.
const COMMAND_ACTIONS: Record<string, (p: Payload) => Omit<ProposalAction, 'payload'>[]> = {
  'pickup.verify_identity': (p) => [
    ...(list(p.contact).includes('site')
      ? [{ class: 'ASK_SITE' as const, summary: 'Ask the site to reconcile the vehicle identity.' }]
      : []),
    ...(list(p.contact).includes('customer')
      ? [
          {
            class: 'CUSTOMER_MESSAGE' as const,
            summary: 'Ask the customer which site holds the VIN.',
            mode: 'draft' as const,
          },
        ]
      : []),
    ...(p.hold_collection
      ? [{ class: 'INSTRUCT_HOLD' as const, summary: 'Hold the collection.' }]
      : []),
  ],
  'assignment.review_positioning': (p) => [
    { class: 'READ', summary: 'Check replacement driver capacity.' },
    ...(p.request_customer_approval_if_window_changes
      ? [
          {
            class: 'CUSTOMER_MESSAGE' as const,
            summary: 'Approval request if the window changes.',
            mode: 'draft' as const,
          },
        ]
      : []),
  ],
  'travel.verify_booking_outcome': (p) => [
    { class: 'ASK_PROVIDER', summary: 'Verify the provider booking reference.' },
    ...(p.refresh_next_day_capacity
      ? [{ class: 'ASK_PROVIDER' as const, summary: 'Refresh next-day capacity.' }]
      : []),
  ],
  'condition.compare_evidence': (p) => [
    { class: 'READ', summary: 'Compare pickup, delivery and customer photos.' },
    ...(p.request_signed_handover
      ? [
          {
            class: 'CUSTOMER_MESSAGE' as const,
            summary: 'Ask for the signed handover.',
            mode: 'draft' as const,
          },
        ]
      : []),
  ],
  'travel.refresh_quote': (p) => [
    { class: 'ASK_PROVIDER', summary: 'Refresh capacity for the quoted option.' },
    ...(p.buy_ticket ? [{ class: 'BOOK_TRAVEL' as const, summary: 'Buy the ticket.' }] : []),
  ],
  'travel.refresh_crossing': (p) => [
    { class: 'ASK_PROVIDER', summary: 'Refresh vehicle-space availability.' },
    ...(p.buy_ticket ? [{ class: 'BOOK_TRAVEL' as const, summary: 'Buy the ticket.' }] : []),
  ],
  'travel.rebook': () => [{ class: 'BOOK_TRAVEL', summary: 'Book a replacement crossing.' }],
  'travel.book_ferry': () => [{ class: 'BOOK_TRAVEL', summary: 'Book the quoted crossing.' }],
  'travel.book_driver_positioning': () => [
    { class: 'BOOK_TRAVEL', summary: 'Book the quoted positioning train.' },
  ],
  'alert.resolve': () => [{ class: 'RECORD_ASSERTION', summary: 'Resolve the alert.' }],
  'condition.record_attribution': () => [
    { class: 'RECORD_ASSERTION', summary: 'Record the damage attribution.' },
  ],
  'assignment.prepare_backup': (p) => [
    { class: 'READ', summary: 'Search backup drivers.' },
    { class: 'ASK_DRIVER', summary: 'Ask backup candidates about availability.' },
    ...(p.cancel_current
      ? [{ class: 'CHANGE_ASSIGNMENT' as const, summary: 'Cancel the current assignment.' }]
      : []),
  ],
  'billing.check_reference': (p) => [
    { class: 'READ', summary: 'Ask billing to compare the invoice record.' },
    ...(p.tell_customer_issued
      ? [
          {
            class: 'CUSTOMER_MESSAGE' as const,
            summary: 'Tell the customer the invoice was issued.',
            mode: 'draft' as const,
          },
        ]
      : []),
  ],
  'driver.request_safe_stop_details': () => [
    { class: 'ASK_DRIVER', summary: 'Ask the driver for safe-stop details.' },
  ],
};

/** One recorded proposal as the gate sees it; `payload: 'final'` uses the reviewer's final_payload. */
export function fromBahnProposal(args: {
  proposal: BahnProposalRow;
  facts: FactLike[];
  now?: Date;
  payload?: 'proposed' | 'final';
  orderRef?: string | null;
}): Proposal {
  const { proposal, facts, now, orderRef } = args;
  const review = (proposal.review ?? null) as Record<string, unknown> | null;
  const payload = (
    args.payload === 'final' && review?.final_payload
      ? review.final_payload
      : (proposal.proposedPayload ?? {})
  ) as Payload;
  const visible = now ? facts.filter((f) => f.observedAt <= now) : facts;
  const factsFor = (recordId: string) =>
    visible.filter((f) => bahnRecordId(f) === recordId).map((f) => f.id);
  const refs = Array.isArray(proposal.evidenceRefs)
    ? (proposal.evidenceRefs as { id?: string }[])
    : [];
  const payloadIds = Object.values(payload).filter(
    (v): v is string => typeof v === 'string' && RECORD_ID.test(v)
  );
  const evidenceFactIds = [
    ...new Set([...refs.map((r) => r.id ?? ''), ...payloadIds].flatMap(factsFor)),
  ];
  const build =
    COMMAND_ACTIONS[proposal.command] ??
    (() => [{ class: 'READ' as const, summary: proposal.summary }]);
  const actions: ProposalAction[] = build(payload).map((action) => ({
    ...action,
    payload,
    evidenceFactIds,
  }));
  if (proposal.command === 'alert.resolve') {
    const trackingIds = visible
      .filter((f) => f.kind === 'TRACKING_OBSERVATION' && evidenceFactIds.includes(f.id))
      .map((f) => f.id);
    const resolution =
      typeof payload.resolution_evidence_id === 'string'
        ? factsFor(payload.resolution_evidence_id)
        : [];
    actions[0].claims = [
      { kind: 'SIGNAL_RESTORED', factIds: resolution.length ? resolution : trackingIds },
    ];
  }
  return {
    id: proposal.id,
    orderId: proposal.orderId,
    orderRef: orderRef ?? null,
    summary: proposal.summary,
    actions,
  };
}
