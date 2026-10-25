// Completes a Trigger.dev waitpoint token: `pnpm spike:complete <tokenId> '<json>'`.

import { wait } from '@trigger.dev/sdk';

async function main() {
  const [tokenId, rawOutput = '{}'] = process.argv.slice(2);
  if (!tokenId) {
    console.error(`usage: pnpm spike:complete <tokenId> '<json>'`);
    process.exit(1);
  }
  const result = await wait.completeToken(tokenId, JSON.parse(rawOutput));
  console.log(JSON.stringify({ tokenId, ...result }));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
