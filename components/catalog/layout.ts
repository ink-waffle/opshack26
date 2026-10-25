// Dagre layout for read-only diagrams: node boxes, edge routes and label spots, computed once on the server.

import { Graph, layout } from '@dagrejs/dagre';

export type Point = { x: number; y: number };

export type LayoutInputNode = { id: string; width: number; height: number };

export type LayoutInputEdge = { id: string; source: string; target: string; label?: string };

export type PositionedNode = { id: string; x: number; y: number; width: number; height: number };

export type PositionedEdge = {
  id: string;
  source: string;
  target: string;
  label: string | null;
  points: Point[];
  labelX: number | null;
  labelY: number | null;
};

export type GraphLayout = {
  nodes: PositionedNode[];
  edges: PositionedEdge[];
  width: number;
  height: number;
};

const LABEL_MAX_WIDTH = 176;
const CHAR_WIDTH = 6.4;

/** Room an edge label needs at 12px, wrapped at LABEL_MAX_WIDTH. */
export function labelSize(label: string): { width: number; height: number } {
  const raw = label.length * CHAR_WIDTH + 20;
  const lines = Math.ceil(raw / LABEL_MAX_WIDTH);
  return { width: Math.min(LABEL_MAX_WIDTH, raw), height: lines * 16 + 8 };
}

export function layoutGraph(args: {
  nodes: LayoutInputNode[];
  edges: LayoutInputEdge[];
  direction?: 'TB' | 'LR';
  nodesep?: number;
  ranksep?: number;
  edgesep?: number;
}): GraphLayout {
  const { nodes, edges, direction = 'TB', nodesep = 40, ranksep = 48, edgesep = 24 } = args;
  const graph = new Graph({ multigraph: true });
  graph.setGraph({ rankdir: direction, nodesep, ranksep, edgesep, marginx: 16, marginy: 16 });
  graph.setDefaultEdgeLabel(() => ({}));
  for (const node of nodes) graph.setNode(node.id, { width: node.width, height: node.height });
  for (const edge of edges)
    graph.setEdge(
      edge.source,
      edge.target,
      edge.label ? { ...labelSize(edge.label), labelpos: 'c' } : {},
      edge.id
    );
  layout(graph);
  const label = graph.graph() as { width?: number; height?: number };
  return {
    nodes: nodes.map((node) => {
      const placed = graph.node(node.id) as { x: number; y: number };
      return {
        id: node.id,
        width: node.width,
        height: node.height,
        x: placed.x - node.width / 2,
        y: placed.y - node.height / 2,
      };
    }),
    edges: edges.map((edge) => {
      const placed = graph.edge({ v: edge.source, w: edge.target, name: edge.id }) as {
        points?: Point[];
        x?: number;
        y?: number;
      };
      return {
        id: edge.id,
        source: edge.source,
        target: edge.target,
        label: edge.label ?? null,
        points: placed.points ?? [],
        labelX: edge.label ? (placed.x ?? null) : null,
        labelY: edge.label ? (placed.y ?? null) : null,
      };
    }),
    width: label.width ?? 0,
    height: label.height ?? 0,
  };
}
