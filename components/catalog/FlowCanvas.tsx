'use client';

import '@xyflow/react/dist/style.css';

import {
  BaseEdge,
  Controls,
  type Edge,
  EdgeLabelRenderer,
  type EdgeProps,
  Handle,
  MarkerType,
  type Node,
  type NodeProps,
  Position,
  ReactFlow,
} from '@xyflow/react';
import { useMemo } from 'react';

import type { Point, PositionedEdge, PositionedNode } from '@/components/catalog/layout';
import { Badge } from '@/components/ui/Badge';
import { cx } from '@/components/ui/cx';
import { Icon, type IconName } from '@/components/ui/Icon';
import type { Tone } from '@/components/ui/tone';

export type FlowVariant = 'rule' | 'agent' | 'wait' | 'person' | 'execute' | 'end' | 'learn';

export type FlowNodeData = {
  title: string;
  kicker: string;
  icon: IconName;
  variant: FlowVariant;
  // One plain sentence (overview nodes).
  text?: string | null;
  step?: number | null;
  badges?: { label: string; tone: Tone; icon?: IconName }[];
  direction: 'TB' | 'LR';
  selected?: boolean;
  dimmed?: boolean;
};

export type FlowNodeInput = PositionedNode & { data: Omit<FlowNodeData, 'direction'> };

export type FlowEdgeInput = PositionedEdge & { dashed?: boolean };

type EdgeData = {
  points: Point[];
  label: string | null;
  labelX: number | null;
  labelY: number | null;
  active: boolean;
  dashed: boolean;
};

const FRAME: Record<FlowVariant, string> = {
  rule: 'border border-line-strong bg-surface',
  agent: 'border border-info-line bg-surface',
  wait: 'border border-dashed border-grey-400 bg-surface',
  person: 'border-2 border-asphalt bg-surface',
  execute: 'border border-ok-line bg-surface',
  end: 'border border-line bg-tray',
  learn: 'border border-dashed border-info-line bg-surface',
};

const ICON_BOX: Record<FlowVariant, string> = {
  rule: 'bg-tray text-secondary',
  agent: 'bg-info-soft text-info-ink',
  wait: 'bg-tray text-secondary',
  person: 'bg-asphalt text-birch',
  execute: 'bg-ok-soft text-ok-ink',
  end: 'bg-surface text-muted',
  learn: 'bg-info-soft text-info-ink',
};

const KICKER: Record<FlowVariant, string> = {
  rule: 'text-muted',
  agent: 'text-info-ink',
  wait: 'text-muted',
  person: 'text-ink',
  execute: 'text-ok-ink',
  end: 'text-muted',
  learn: 'text-info-ink',
};

function FlowNode(props: NodeProps<Node<FlowNodeData>>) {
  const { data, width, height } = props;
  const vertical = data.direction === 'TB';
  return (
    <div
      style={{ width, height }}
      className={cx(
        'rounded-panel flex cursor-pointer flex-col justify-center px-3.5 py-3 transition-[box-shadow,opacity]',
        FRAME[data.variant],
        data.selected
          ? 'shadow-raised ring-asphalt/80 ring-2 ring-offset-2 ring-offset-transparent'
          : 'shadow-card hover:shadow-raised',
        data.dimmed && 'opacity-55'
      )}
    >
      <Handle
        type='target'
        position={vertical ? Position.Top : Position.Left}
        className='!size-1.5 !min-h-0 !min-w-0 !border-0 !bg-transparent'
        isConnectable={false}
      />
      <div className='flex items-center gap-2'>
        <span
          className={cx(
            'flex size-6 shrink-0 items-center justify-center rounded-md',
            ICON_BOX[data.variant]
          )}
        >
          <Icon name={data.icon} size={14} />
        </span>
        <span className={cx('min-w-0 truncate text-xs font-medium', KICKER[data.variant])}>
          {data.step ? `${data.step} · ` : ''}
          {data.kicker}
        </span>
      </div>
      <div className='font-display text-ink mt-1.5 text-[0.9375rem] leading-snug font-bold tracking-tight'>
        {data.title}
      </div>
      {data.text && <p className='text-secondary mt-1 text-sm leading-snug'>{data.text}</p>}
      {data.badges && data.badges.length > 0 && (
        <div className='mt-2 flex flex-wrap gap-1'>
          {data.badges.map((badge) => (
            <Badge key={badge.label} tone={badge.tone} icon={badge.icon}>
              {badge.label}
            </Badge>
          ))}
        </div>
      )}
      <Handle
        type='source'
        position={vertical ? Position.Bottom : Position.Right}
        className='!size-1.5 !min-h-0 !min-w-0 !border-0 !bg-transparent'
        isConnectable={false}
      />
    </div>
  );
}

/** Smooth path through dagre's route points (quadratic joins at each bend). */
function pathThrough(points: Point[]): string {
  if (points.length < 2) return '';
  const [first, ...rest] = points;
  let d = `M ${first.x} ${first.y}`;
  for (let i = 0; i < rest.length - 1; i += 1) {
    const point = rest[i];
    const next = rest[i + 1];
    d += ` Q ${point.x} ${point.y} ${(point.x + next.x) / 2} ${(point.y + next.y) / 2}`;
  }
  const last = rest[rest.length - 1];
  return `${d} L ${last.x} ${last.y}`;
}

function RouteEdge(props: EdgeProps<Edge<EdgeData>>) {
  const { data, markerEnd } = props;
  if (!data) return null;
  return (
    <>
      <BaseEdge
        path={pathThrough(data.points)}
        markerEnd={markerEnd}
        style={{
          stroke: data.active ? 'var(--color-asphalt)' : 'var(--color-grey-400)',
          strokeWidth: data.active ? 1.75 : 1.25,
          strokeDasharray: data.dashed ? '5 4' : undefined,
        }}
      />
      {data.label && data.labelX !== null && data.labelY !== null && (
        <EdgeLabelRenderer>
          <div
            style={{
              transform: `translate(-50%, -50%) translate(${data.labelX}px, ${data.labelY}px)`,
            }}
            className={cx(
              'bg-canvas pointer-events-none absolute max-w-[176px] rounded-md px-1.5 py-0.5 text-center text-xs leading-snug',
              data.active ? 'text-ink font-medium' : 'text-muted'
            )}
          >
            {data.label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

const NODE_TYPES = { flow: FlowNode };
const EDGE_TYPES = { route: RouteEdge };

type FlowCanvasProps = {
  nodes: FlowNodeInput[];
  edges: FlowEdgeInput[];
  direction: 'TB' | 'LR';
  height: number;
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  ariaLabel: string;
};

// Read-only diagram: positions come from the server-side dagre layout; clicking a node selects it.
export function FlowCanvas(props: FlowCanvasProps) {
  const { nodes, edges, direction, height, selectedId = null, onSelect, ariaLabel } = props;
  const flowNodes = useMemo<Node<FlowNodeData>[]>(
    () =>
      nodes.map((node) => ({
        id: node.id,
        type: 'flow',
        position: { x: node.x, y: node.y },
        width: node.width,
        height: node.height,
        data: {
          ...node.data,
          direction,
          selected: node.id === selectedId,
          dimmed: false,
        },
        draggable: false,
        connectable: false,
      })),
    [nodes, direction, selectedId]
  );
  const flowEdges = useMemo<Edge<EdgeData>[]>(
    () =>
      edges.map((edge) => {
        const active = !!selectedId && (edge.source === selectedId || edge.target === selectedId);
        return {
          id: edge.id,
          source: edge.source,
          target: edge.target,
          type: 'route',
          markerEnd: {
            type: MarkerType.ArrowClosed,
            width: 14,
            height: 14,
            color: active ? '#12110e' : '#a09786',
          },
          data: {
            points: edge.points,
            label: edge.label,
            labelX: edge.labelX,
            labelY: edge.labelY,
            active,
            dashed: !!edge.dashed,
          },
        };
      }),
    [edges, selectedId]
  );
  return (
    <div style={{ height }} className='w-full' aria-label={ariaLabel}>
      <ReactFlow
        nodes={flowNodes}
        edges={flowEdges}
        nodeTypes={NODE_TYPES}
        edgeTypes={EDGE_TYPES}
        fitView
        fitViewOptions={{ padding: 0.04, maxZoom: 1 }}
        minZoom={0.3}
        maxZoom={1.5}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        zoomOnScroll={false}
        zoomOnDoubleClick={false}
        panOnScroll={false}
        preventScrolling={false}
        proOptions={{ hideAttribution: true }}
        onNodeClick={(_, node) => onSelect?.(node.id)}
      >
        <Controls showInteractive={false} position='bottom-left' />
      </ReactFlow>
    </div>
  );
}
