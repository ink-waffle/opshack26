// Triggers a task in the dev env and follows it: `pnpm spike:trigger [taskId] [payloadJson] [--no-wait]`.

import { runs, tasks } from '@trigger.dev/sdk';

const TERMINAL = new Set([
  'COMPLETED',
  'CANCELED',
  'FAILED',
  'CRASHED',
  'SYSTEM_FAILURE',
  'EXPIRED',
  'TIMED_OUT',
]);

async function main() {
  const positional = process.argv.slice(2).filter((arg) => !arg.startsWith('--'));
  const noWait = process.argv.includes('--no-wait');
  const taskId = positional[0] ?? 'spike-roundtrip';
  const payload = positional[1] ? JSON.parse(positional[1]) : {};

  const handle = await tasks.trigger(taskId, payload);
  console.log(`triggered ${taskId}: run ${handle.id}`);
  if (noWait) return;

  let lastStatus = '';
  let printedToken = false;
  const deadline = Date.now() + 15 * 60_000;
  while (Date.now() < deadline) {
    const run = await runs.retrieve(handle.id);
    if (run.status !== lastStatus) {
      console.log(`status: ${run.status}`);
      lastStatus = run.status;
    }
    const tokenId = run.metadata?.tokenId;
    if (tokenId && !printedToken) {
      console.log(`waitpoint token: ${tokenId}`);
      console.log(`complete it with: pnpm spike:complete ${tokenId} '{"decision":"approve"}'`);
      printedToken = true;
    }
    if (TERMINAL.has(run.status)) {
      console.log(JSON.stringify({ output: run.output, error: run.error }, null, 2));
      process.exit(run.status === 'COMPLETED' ? 0 : 1);
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  console.error('gave up waiting after 15 minutes');
  process.exit(1);
}

main();
