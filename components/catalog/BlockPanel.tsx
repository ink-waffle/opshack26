import Link from 'next/link';

import { KIND_META, MODEL_TEXT, toolText } from '@/components/catalog/kinds';
import { Markdown } from '@/components/catalog/Markdown';
import { outputSummary, templateSteps, waitPolicy } from '@/components/catalog/view';
import { Badge } from '@/components/ui/Badge';
import { Card, CardSection, Panel } from '@/components/ui/Card';
import { Icon } from '@/components/ui/Icon';
import { KeyValue, KeyValueList } from '@/components/ui/KeyValue';
import { formatDuration } from '@/components/ui/time';
import type { Amendment } from '@/lib/generated/prisma/client';
import type { BlockStats } from '@/lib/meta/stats';
import type { BlockDefinition, PlaybookDefinition } from '@/lib/playbooks/types';

const KIND_TONE = {
  agent: 'info',
  human: 'neutral',
  execute: 'ok',
  wait: 'neutral',
  deterministic: 'neutral',
} as const;

type BlockPanelProps = {
  definition: PlaybookDefinition;
  block: BlockDefinition;
  instructions: string | null;
  amendments: Amendment[];
  stats: BlockStats | null;
  params: Record<string, unknown>;
};

// Everything about one step, for someone who does not read code.
export function BlockPanel(props: BlockPanelProps) {
  const { definition, block, instructions, amendments, stats, params } = props;
  const meta = KIND_META[block.kind];
  const policy = waitPolicy({ block, params });
  const titleOf = (id: string) => definition.blocks.find((b) => b.id === id)?.title ?? id;
  return (
    <Card as='article'>
      <div className='flex flex-wrap items-center gap-2'>
        <Badge tone={KIND_TONE[block.kind]} icon={meta.icon}>
          {meta.label}
        </Badge>
        {block.id === definition.start && <Badge>First step</Badge>}
        {amendments.length > 0 && (
          <Badge tone='ok' icon='spark'>
            {amendments.length} approved change{amendments.length > 1 ? 's' : ''}
          </Badge>
        )}
      </div>
      <h3 className='font-display text-ink mt-3 text-xl leading-tight font-bold tracking-tight'>
        {block.title}
      </h3>
      <p className='text-body mt-2 text-base leading-relaxed'>{block.description}</p>
      <Panel className='mt-4'>
        <p className='text-secondary text-sm leading-relaxed'>{meta.plain}</p>
      </Panel>

      {block.kind === 'agent' && (
        <CardSection title='Tools it may use' aside={MODEL_TEXT[block.model ?? 'sonnet']}>
          <ul className='grid gap-1.5'>
            {(block.tools ?? []).map((tool) => (
              <li key={tool} className='text-body flex items-start gap-2 text-base'>
                <Icon name='check' size={14} className='text-info-ink mt-1 shrink-0' />
                {toolText(tool)}
              </li>
            ))}
          </ul>
          <p className='text-muted mt-2 text-sm'>Nothing else: no web, no files, no booking.</p>
        </CardSection>
      )}

      {policy && (
        <CardSection title='How long it waits'>
          <p className='text-body text-base leading-relaxed'>{policy.text}</p>
          {policy.changed && (
            <p className='text-ok-ink mt-1 text-sm'>Timing changed by an approved amendment.</p>
          )}
        </CardSection>
      )}

      {amendments.length > 0 && (
        <CardSection title='Approved changes (chief dispatcher)'>
          <ul className='grid gap-2'>
            {amendments.map((amendment) => (
              <li
                key={amendment.id}
                className='bg-ok-soft border-ok-line rounded-panel border px-3.5 py-2.5'
              >
                <p className='text-ink text-base leading-relaxed'>{amendment.text}</p>
                <p className='text-ok-ink mt-1 text-sm'>
                  Approved by the chief dispatcher
                  {amendment.sourceCardId && (
                    <>
                      {' · '}
                      <Link href={`/meta#${amendment.id}`} className='underline underline-offset-2'>
                        learned from a dispatcher’s correction
                      </Link>
                    </>
                  )}
                </p>
              </li>
            ))}
          </ul>
        </CardSection>
      )}

      {block.templates && (
        <CardSection title='The options it may offer' aside='Closed list'>
          <p className='text-secondary mb-3 text-sm leading-relaxed'>
            The agent picks from these options only and fills in their quotes, candidates and exact
            messages. The steps, their order and who must agree are fixed here.
          </p>
          <ul className='grid gap-2.5'>
            {block.templates.map((template) => (
              <li key={template.id}>
                <Panel>
                  <p className='text-ink text-base font-semibold'>{template.title}</p>
                  <p className='text-body mt-1 text-sm leading-relaxed'>{template.description}</p>
                  <p className='text-secondary mt-1.5 text-sm leading-relaxed'>
                    <span className='text-muted'>When: </span>
                    {template.when}
                  </p>
                  <ol className='marker:text-faint mt-2 list-decimal space-y-1 pl-5'>
                    {templateSteps(template).map((step) => (
                      <li key={step.title} className='text-body text-sm'>
                        {step.title}
                        <span className='text-muted'> — {step.agrees}</span>
                      </li>
                    ))}
                  </ol>
                </Panel>
              </li>
            ))}
          </ul>
        </CardSection>
      )}

      {block.kind === 'agent' && instructions && (
        <CardSection title='Instructions the agent receives'>
          <Markdown>{instructions}</Markdown>
          <p className='text-muted mt-3 text-sm'>
            It also receives the rules every agent follows, this playbook’s rules, the order’s facts
            {block.templates ? ' and the option list above' : ''}.
          </p>
        </CardSection>
      )}

      <CardSection title='What it hands on'>
        <ul className='marker:text-faint list-disc space-y-1 pl-5'>
          {outputSummary(block).map((line) => (
            <li key={line} className='text-body text-base'>
              {line}
            </li>
          ))}
        </ul>
      </CardSection>

      <CardSection title='Where it goes next'>
        {block.next.length ? (
          <ul className='grid gap-1.5'>
            {block.next.map((edge) => (
              <li key={`${edge.to}-${edge.label}`} className='flex items-start gap-2 text-base'>
                <Icon name='arrow' size={14} className='text-muted mt-1 shrink-0' />
                <span>
                  <span className='text-ink font-medium'>{titleOf(edge.to)}</span>
                  {(block.next.length > 1 || edge.when) && (
                    <span className='text-muted'> — {edge.label.toLowerCase()}</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className='text-body text-base'>
            {block.status === 'ESCALATED'
              ? 'The run ends here and a person takes over.'
              : 'The run ends here.'}
          </p>
        )}
      </CardSection>

      <CardSection title='Recent runs'>
        {stats && stats.runs > 0 ? (
          <KeyValueList>
            <KeyValue label='Runs'>
              <span className='tabular-nums'>
                {stats.runs}
                {stats.failed ? ` (${stats.failed} failed)` : ''}
              </span>
            </KeyValue>
            {stats.avgCostUsd !== null && (
              <KeyValue label='Average cost'>
                <span className='tabular-nums'>
                  ${stats.avgCostUsd.toFixed(stats.avgCostUsd < 0.01 ? 4 : 2)}
                </span>
              </KeyValue>
            )}
            {stats.avgDurationMs !== null && (
              <KeyValue label={block.kind === 'human' ? 'Average time to decide' : 'Average time'}>
                <span className='tabular-nums'>{formatDuration(stats.avgDurationMs)}</span>
              </KeyValue>
            )}
          </KeyValueList>
        ) : (
          <p className='text-muted text-sm'>This step has not run yet.</p>
        )}
      </CardSection>
    </Card>
  );
}
