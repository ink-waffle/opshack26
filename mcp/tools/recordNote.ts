import { z } from 'zod';

import { defineTool } from '@/mcp/types';

export const recordNote = defineTool({
  name: 'record_note',
  title: 'Record a working note',
  description:
    'Records a short working note for the operator about what you checked or concluded. Notes are not facts and cannot be cited as evidence.',
  inputSchema: { note: z.string().min(1).max(1000).describe('One or two plain sentences.') },
  handler: async (input, ctx) => {
    console.error(
      `[control] note run=${ctx.runId ?? '-'} order=${ctx.orderId ?? '-'}: ${input.note}`
    );
    return { recorded: true, note: input.note };
  },
});
