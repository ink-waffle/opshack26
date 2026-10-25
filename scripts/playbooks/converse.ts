// Asks the conversation simulator once (no DB writes): `dotenv -e .env.local -- tsx scripts/playbooks/converse.ts <orderRef> <driver|site|provider> "<question>"`.

import type { ConversationParty } from '@/lib/providers';
import { getConversationProvider } from '@/lib/providers';

async function main() {
  const [orderRef, party = 'driver', ...rest] = process.argv.slice(2);
  if (!orderRef || !rest.length) {
    console.error(
      'usage: tsx scripts/playbooks/converse.ts <orderRef> <driver|site|provider> "<question>"'
    );
    process.exit(1);
  }
  const reply = await getConversationProvider().reply({
    orderRef,
    party: party as ConversationParty,
    question: rest.join(' '),
  });
  console.log(JSON.stringify(reply, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
