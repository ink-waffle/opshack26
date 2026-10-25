'use client';

import { type ReactNode, useState } from 'react';

import {
  FlowCanvas,
  type FlowEdgeInput,
  type FlowNodeInput,
} from '@/components/catalog/FlowCanvas';
import { Card } from '@/components/ui/Card';

type PlaybookExplorerProps = {
  nodes: FlowNodeInput[];
  edges: FlowEdgeInput[];
  height: number;
  // Server-rendered side panel per block id, plus the panel shown before any click.
  panels: Record<string, ReactNode>;
  intro: ReactNode;
  legend: ReactNode;
  initialId?: string | null;
};

// The playbook diagram on the left; the clicked step's instructions and numbers on the right.
export function PlaybookExplorer(props: PlaybookExplorerProps) {
  const { nodes, edges, height, panels, intro, legend, initialId = null } = props;
  const [selected, setSelected] = useState<string | null>(
    initialId && panels[initialId] ? initialId : null
  );
  return (
    <div className='grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(340px,440px)]'>
      <Card padding='none'>
        <FlowCanvas
          nodes={nodes}
          edges={edges}
          direction='TB'
          height={height}
          selectedId={selected}
          onSelect={(id) => setSelected((current) => (current === id ? null : id))}
          ariaLabel='Playbook diagram'
        />
        <div className='border-line-soft rounded-b-card bg-tray border-t px-5 py-3'>{legend}</div>
      </Card>
      <aside className='lg:sticky lg:top-20 lg:max-h-[calc(100dvh-6rem)] lg:overflow-y-auto'>
        {selected ? panels[selected] : intro}
      </aside>
    </div>
  );
}
