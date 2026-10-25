import { spawn } from 'child_process';
import { existsSync } from 'fs';
import { mkdtemp, rm, writeFile } from 'fs/promises';
import { homedir, tmpdir } from 'os';
import { delimiter, dirname, join } from 'path';

import type { AgentResult, AgentRunner, AgentToolCall } from '@/lib/agents';
import { AgentRunError } from '@/lib/agents/errors';

/** CLAUDE_BIN, else the native installer's ~/.local/bin/claude, else the first `claude` on the caller's PATH. */
function resolveClaudeBin(): string {
  if (process.env.CLAUDE_BIN) return process.env.CLAUDE_BIN;
  // Before PATH: terminal apps put wrapper shims named `claude` first on PATH, and those add their own hooks.
  const native = join(homedir(), '.local/bin/claude');
  if (existsSync(native)) return native;
  const onPath = (process.env.PATH ?? '')
    .split(delimiter)
    .filter(Boolean)
    .map((dir) => join(dir, 'claude'))
    .find((bin) => existsSync(bin));
  return onPath ?? 'claude';
}

const DEFAULT_MODEL = 'sonnet';
const DEFAULT_TIMEOUT_MS = 10 * 60_000;

// Only these parent env vars reach the CLI: enough for OAuth (keychain via HOME/USER) or an API key, nothing else.
const INHERITED_ENV = [
  'HOME',
  'USER',
  'LOGNAME',
  'LANG',
  'LC_ALL',
  'TMPDIR',
  'ANTHROPIC_API_KEY',
  'CLAUDE_CODE_OAUTH_TOKEN',
];

type StreamMessage = { type: string; subtype?: string; [key: string]: unknown };

type ContentBlock = {
  type: string;
  id?: string;
  name?: string;
  input?: unknown;
  tool_use_id?: string;
  content?: unknown;
  is_error?: boolean;
};

function buildEnv(extra: Record<string, string> = {}): Record<string, string> {
  const inherited = Object.fromEntries(
    INHERITED_ENV.flatMap((key) => (process.env[key] ? [[key, process.env[key] as string]] : []))
  );
  return {
    ...inherited,
    PATH: [
      dirname(process.execPath),
      '/opt/homebrew/bin',
      '/usr/local/bin',
      '/usr/bin',
      '/bin',
      '/usr/sbin',
      '/sbin',
    ].join(':'),
    DISABLE_AUTOUPDATER: '1',
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
    ...extra,
  };
}

function collectToolCalls(transcript: StreamMessage[]): AgentToolCall[] {
  const calls = new Map<string, AgentToolCall>();
  for (const message of transcript) {
    const content = (message.message as { content?: ContentBlock[] } | undefined)?.content;
    if (!Array.isArray(content)) continue;
    for (const block of content) {
      if (block.type === 'tool_use' && block.id && block.name) {
        calls.set(block.id, { id: block.id, name: block.name, input: block.input });
      } else if (block.type === 'tool_result' && block.tool_use_id) {
        const call = calls.get(block.tool_use_id);
        if (call) Object.assign(call, { output: block.content, isError: Boolean(block.is_error) });
      }
    }
  }
  return [...calls.values()].filter((call) => call.name !== 'StructuredOutput');
}

function spawnCli(args: {
  bin: string;
  argv: string[];
  cwd: string;
  env: Record<string, string>;
  stdin: string;
  timeoutMs: number;
}): Promise<{ stdout: string; stderr: string; exitCode: number | null; timedOut: boolean }> {
  const { bin, argv, cwd, env, stdin, timeoutMs } = args;
  return new Promise((resolve, reject) => {
    const child = spawn(bin, argv, {
      cwd,
      env: env as NodeJS.ProcessEnv,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
      setTimeout(() => child.kill('SIGKILL'), 5000).unref();
    }, timeoutMs);
    child.stdout.on('data', (chunk) => (stdout += chunk));
    child.stderr.on('data', (chunk) => (stderr += chunk));
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', (exitCode) => {
      clearTimeout(timer);
      resolve({ stdout, stderr, exitCode, timedOut });
    });
    child.stdin.end(stdin);
  });
}

const run: AgentRunner['run'] = async (args) => {
  const {
    systemPrompt,
    prompt,
    outputSchema,
    mcpServers = {},
    allowedTools,
    model = DEFAULT_MODEL,
    cwd,
    env,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    maxBudgetUsd,
  } = args;
  const workDir = await mkdtemp(join(tmpdir(), 'control-agent-'));
  try {
    const mcpConfigPath = join(workDir, 'mcp.json');
    await writeFile(mcpConfigPath, JSON.stringify({ mcpServers }, null, 2));
    const tools = allowedTools ?? Object.keys(mcpServers).map((name) => `mcp__${name}`);
    const argv = [
      '-p',
      '--output-format',
      'stream-json',
      '--verbose',
      '--no-session-persistence',
      '--model',
      model,
      '--setting-sources',
      '',
      '--strict-mcp-config',
      '--mcp-config',
      mcpConfigPath,
      '--tools',
      '',
      '--allowedTools',
      tools.join(','),
      '--permission-mode',
      'dontAsk',
      '--disable-slash-commands',
      '--system-prompt',
      systemPrompt,
      '--json-schema',
      JSON.stringify(outputSchema),
      ...(maxBudgetUsd ? ['--max-budget-usd', String(maxBudgetUsd)] : []),
    ];
    const startedAt = Date.now();
    const { stdout, stderr, exitCode, timedOut } = await spawnCli({
      bin: resolveClaudeBin(),
      argv,
      cwd: cwd ?? workDir,
      env: buildEnv(env),
      stdin: prompt,
      timeoutMs,
    });
    const transcript = stdout
      .split('\n')
      .filter((line) => line.trim().startsWith('{'))
      .map((line) => JSON.parse(line) as StreamMessage);
    const details = { transcript, stderr: stderr.slice(-4000), exitCode };
    if (timedOut) throw new AgentRunError(`Claude CLI timed out after ${timeoutMs} ms`, details);

    const init = transcript.find((m) => m.type === 'system' && m.subtype === 'init');
    const failedServers = (
      (init?.mcp_servers as { name: string; status: string }[] | undefined) ?? []
    ).filter((server) => server.status !== 'connected');
    if (failedServers.length > 0) {
      const names = failedServers.map((s) => `${s.name}:${s.status}`).join(', ');
      throw new AgentRunError(`MCP servers failed to start: ${names}`, details);
    }

    const result = transcript.findLast((m) => m.type === 'result');
    if (!result)
      throw new AgentRunError(`Claude CLI produced no result (exit ${exitCode})`, details);
    if (result.is_error || result.structured_output === undefined) {
      const reason = result.subtype === 'success' ? 'no structured_output' : result.subtype;
      throw new AgentRunError(`Claude CLI run failed: ${reason}`, { ...details, raw: result });
    }
    return {
      output: result.structured_output,
      costUsd: Number(result.total_cost_usd ?? 0),
      durationMs: Number(result.duration_ms ?? Date.now() - startedAt),
      numTurns: Number(result.num_turns ?? 0),
      sessionId: (result.session_id as string | undefined) ?? null,
      model: (init?.model as string | undefined) ?? null,
      toolCalls: collectToolCalls(transcript),
      transcript,
      raw: result,
    } satisfies AgentResult;
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
};

export const claudeCliRunner: AgentRunner = { id: 'claude-cli', run };
