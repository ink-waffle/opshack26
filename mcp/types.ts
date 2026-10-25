import type { z } from 'zod';

// Run context handed to every tool; read from CONTROL_* env vars set by the agent runner.
export type ToolContext = {
  runId: string | null;
  orderId: string | null;
  blockId: string | null;
};

export type ControlTool = {
  name: string;
  title?: string;
  description: string;
  inputSchema: z.ZodRawShape;
  handler: (input: any, ctx: ToolContext) => Promise<unknown>;
};

// Typed tool definition; the handler's input is inferred from the zod shape.
export function defineTool<Shape extends z.ZodRawShape>(tool: {
  name: string;
  title?: string;
  description: string;
  inputSchema: Shape;
  handler: (input: z.infer<z.ZodObject<Shape>>, ctx: ToolContext) => Promise<unknown>;
}): ControlTool {
  return tool;
}
