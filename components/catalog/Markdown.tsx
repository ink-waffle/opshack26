import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';

import { toolText } from '@/components/catalog/kinds';
import { cx } from '@/components/ui/cx';

const words = (value: string) =>
  value
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/_/g, ' ')
    .toLowerCase();

/** Code-ish terms in instructions as plain words: FERRY_QUOTE → ferry quote, earlierBlocks.gather → the gather step. */
export function plainTerm(term: string): string {
  if (/^f_[0-9a-f]{6,}$/.test(term)) return `fact ${term}`;
  const earlier = /^earlierBlocks\.(\w+)(?:\.(\w+))?$/.exec(term);
  if (earlier)
    return earlier[2]
      ? `${words(earlier[2])} (from the ${words(earlier[1])} step)`
      : `the ${words(earlier[1])} step’s result`;
  const field = /^(\w+)\.(\w+)$/.exec(term);
  if (field) return `${words(field[2])} (from the ${words(field[1])} step)`;
  if (/^[A-Z][A-Z_]+$/.test(term)) return words(term);
  if (/^[a-z]+(_[a-z]+)+$/.test(term)) return toolText(term).toLowerCase();
  if (/^[a-z]+[A-Z]\w*$/.test(term)) return words(term);
  return term;
}

const COMPONENTS: Components = {
  h1: ({ children }) => (
    <h3 className='font-display text-ink text-md mt-5 mb-2 font-bold tracking-tight first:mt-0'>
      {children}
    </h3>
  ),
  h2: ({ children }) => (
    <h4 className='text-ink mt-5 mb-1.5 text-base font-semibold first:mt-0'>{children}</h4>
  ),
  h3: ({ children }) => (
    <h5 className='text-secondary mt-4 mb-1 text-sm font-semibold first:mt-0'>{children}</h5>
  ),
  p: ({ children }) => <p className='text-body my-2 leading-relaxed'>{children}</p>,
  ul: ({ children }) => (
    <ul className='marker:text-faint my-2 list-disc space-y-1 pl-5'>{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className='marker:text-muted my-2 list-decimal space-y-1.5 pl-5'>{children}</ol>
  ),
  li: ({ children }) => <li className='text-body pl-0.5 leading-relaxed'>{children}</li>,
  strong: ({ children }) => <strong className='text-ink font-semibold'>{children}</strong>,
  em: ({ children }) => <em className='text-secondary'>{children}</em>,
  code: ({ children }) => (
    <span className='bg-tray text-secondary rounded px-1 py-px text-[0.9em]'>
      {typeof children === 'string' ? plainTerm(children) : children}
    </span>
  ),
  pre: ({ children }) => <div className='my-2'>{children}</div>,
  table: ({ children }) => (
    <div className='my-3 overflow-x-auto'>
      <table className='w-full border-collapse text-sm'>{children}</table>
    </div>
  ),
  th: ({ children }) => (
    <th className='border-line text-secondary border-b px-2 py-1.5 text-left font-semibold'>
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className='border-line-soft text-body border-b px-2 py-1.5 align-top'>{children}</td>
  ),
  a: ({ children, href }) => (
    <a href={href} className='text-ink decoration-line-strong underline underline-offset-2'>
      {children}
    </a>
  ),
};

// Instructions and rules as readable text: the same markdown files the agents receive.
export function Markdown(props: { children: string; className?: string }) {
  const { children, className } = props;
  return (
    <div className={cx('text-base', className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={COMPONENTS}>
        {children}
      </ReactMarkdown>
    </div>
  );
}
