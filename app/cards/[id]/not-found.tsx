import { PageContainer } from '@/components/ui/AppShell';
import { ButtonLink } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';

export default function CardNotFound() {
  return (
    <PageContainer className='pt-12'>
      <EmptyState
        icon='inbox'
        title='This card no longer exists'
        action={
          <ButtonLink href='/' size='sm' icon='arrow'>
            Back to the control room
          </ButtonLink>
        }
      >
        It may have been folded into a newer decision card or removed after a test run. Every open
        card is in the control room.
      </EmptyState>
    </PageContainer>
  );
}
