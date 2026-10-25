export class AgentRunError extends Error {
  constructor(
    message: string,
    readonly details: {
      raw?: unknown;
      transcript?: unknown[];
      stderr?: string;
      exitCode?: number | null;
    }
  ) {
    super(message);
    this.name = 'AgentRunError';
  }
}
