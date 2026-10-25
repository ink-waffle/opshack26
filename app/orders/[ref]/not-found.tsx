import { PageContainer } from '@/components/ui/AppShell';
import { ButtonLink } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';

export default function OrderNotFound() {
  return (
    <PageContainer className='pt-12'>
      <EmptyState
        icon='search'
        title='No order with this reference'
        action={
          <ButtonLink href='/orders' size='sm' icon='search'>
            Search all orders
          </ButtonLink>
        }
      >
        Order references look like CD-420299. Searched Bahn&apos;s order records by reference and
        id.
      </EmptyState>
    </PageContainer>
  );
}
