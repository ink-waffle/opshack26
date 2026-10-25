import {
  FlowCanvas,
  type FlowEdgeInput,
  type FlowNodeInput,
} from '@/components/catalog/FlowCanvas';
import { layoutGraph } from '@/components/catalog/layout';

const W = 204;
const H = 172;

type OverviewNode = Omit<FlowNodeInput, 'x' | 'y' | 'width' | 'height'>;

// The seven parts of the system, one sentence each, in the order a message travels.
const STEPS: OverviewNode[] = [
  {
    id: 'watchman',
    data: {
      step: 1,
      kicker: 'Watchman',
      title: 'Notices',
      icon: 'search',
      variant: 'agent',
      text: 'Jev reads every new message and record; clocks check every order each minute for slots and cutoffs that pass in silence.',
    },
  },
  {
    id: 'router',
    data: {
      step: 2,
      kicker: 'Router',
      title: 'Picks a playbook',
      icon: 'flow',
      variant: 'rule',
      text: 'A fixed table sends each trigger from a closed list to its playbook. Nothing matches: a person gets a triage card.',
    },
  },
  {
    id: 'playbook',
    data: {
      step: 3,
      kicker: 'Playbook',
      title: 'Works the case',
      icon: 'document',
      variant: 'rule',
      text: 'A fixed diagram of steps: rules in code, AI agents with tools, deadline-aware waits and a person’s decision.',
    },
  },
  {
    id: 'facts',
    data: {
      step: 4,
      kicker: 'Facts and guardrails',
      title: 'Checks every claim',
      icon: 'shield',
      variant: 'rule',
      text: 'Each claim cites a fact with its source and evidence level; code checks every option against the rules.',
    },
  },
  {
    id: 'card',
    data: {
      step: 5,
      kicker: 'Decision card',
      title: 'Asks a person',
      icon: 'clock',
      variant: 'rule',
      text: 'What happened, what the agent did and up to three options, sorted by a countdown to when the decision is due.',
    },
  },
  {
    id: 'operator',
    data: {
      step: 6,
      kicker: 'Operator decision',
      title: 'A person decides',
      icon: 'operator',
      variant: 'person',
      text: 'The dispatcher approves, edits or rejects. Only then is anything booked or sent.',
    },
  },
];

const TRIAGE: OverviewNode = {
  id: 'triage',
  data: {
    kicker: 'Escape hatch',
    title: 'Triage card',
    icon: 'inbox',
    variant: 'end',
    text: 'No playbook fits: a person gets the facts gathered so far.',
  },
};

const META: OverviewNode = {
  id: 'meta',
  data: {
    step: 7,
    kicker: 'Meta-system',
    title: 'Learns from corrections',
    icon: 'spark',
    variant: 'learn',
    text: 'Edits and rejections become proposed changes, tested on past cases, used once the chief dispatcher approves.',
  },
};

// Unlabelled: the sentences in the boxes say what passes along; labels would widen every gap.
const EDGES = [
  { id: 'e1', source: 'watchman', target: 'router' },
  { id: 'e2', source: 'router', target: 'playbook' },
  { id: 'e4', source: 'playbook', target: 'facts' },
  { id: 'e5', source: 'facts', target: 'card' },
  { id: 'e6', source: 'card', target: 'operator' },
];

const ROW_GAP = 64;

// How the whole system works, left to right; the escape hatch and the meta-system sit on a second row.
export function SystemOverview() {
  const layout = layoutGraph({
    nodes: STEPS.map((node) => ({ id: node.id, width: W, height: H })),
    edges: EDGES,
    direction: 'LR',
    nodesep: 40,
    ranksep: 36,
  });
  const at = (id: string) => layout.nodes.find((node) => node.id === id) ?? layout.nodes[0];
  const router = at('router');
  const playbook = at('playbook');
  const facts = at('facts');
  const card = at('card');
  const operator = at('operator');
  const rowY = router.y + H + ROW_GAP;
  const triage = { id: 'triage', x: router.x, y: rowY, width: W, height: 124 };
  const meta = {
    id: 'meta',
    x: (facts.x + card.x + card.width) / 2 - W / 2,
    y: rowY,
    width: W,
    height: 176,
  };
  const bottom = (node: { x: number; y: number; width: number; height: number }) => ({
    x: node.x + node.width / 2,
    y: node.y + node.height,
  });
  const routerBottom = bottom(router);
  const opBottom = bottom(operator);
  const pbBottom = bottom(playbook);
  const metaMidY = meta.y + meta.height / 2;
  const nodes: FlowNodeInput[] = [
    ...STEPS.map((node) => ({ ...at(node.id), data: node.data })),
    { ...triage, data: TRIAGE.data },
    { ...meta, data: META.data },
  ];
  const edges: FlowEdgeInput[] = [
    ...layout.edges,
    {
      id: 'e3',
      source: 'router',
      target: 'triage',
      label: 'no match',
      points: [routerBottom, { x: routerBottom.x, y: triage.y }],
      labelX: routerBottom.x,
      labelY: (routerBottom.y + triage.y) / 2,
    },
    {
      id: 'e7',
      source: 'operator',
      target: 'meta',
      label: 'edit or reject',
      points: [opBottom, { x: opBottom.x, y: metaMidY }, { x: meta.x + meta.width, y: metaMidY }],
      labelX: opBottom.x,
      labelY: (opBottom.y + metaMidY) / 2,
    },
    {
      id: 'e8',
      source: 'meta',
      target: 'playbook',
      label: 'approved changes',
      dashed: true,
      points: [{ x: meta.x, y: metaMidY }, { x: pbBottom.x, y: metaMidY }, pbBottom],
      labelX: pbBottom.x,
      labelY: (pbBottom.y + metaMidY) / 2,
    },
  ];
  const height = Math.max(...nodes.map((node) => node.y + node.height)) + 24;
  return (
    <FlowCanvas
      nodes={nodes}
      edges={edges}
      direction='LR'
      height={height}
      ariaLabel='How the control room works'
    />
  );
}
