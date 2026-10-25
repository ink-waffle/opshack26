import { defineConfig } from '@trigger.dev/sdk';

export default defineConfig({
  project: process.env.TRIGGER_PROJECT_REF ?? 'proj_huebjwukwrrablzkilur',
  dirs: ['./trigger', './playbooks'],
  runtime: 'node-22',
  // Compute seconds per run; waits on tokens / wait.for are checkpointed and do not count.
  maxDuration: 3600,
  retries: {
    enabledInDev: false,
    default: {
      maxAttempts: 2,
      minTimeoutInMs: 1000,
      maxTimeoutInMs: 10000,
      factor: 2,
      randomize: true,
    },
  },
});
