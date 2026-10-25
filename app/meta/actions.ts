'use server';

import { refresh } from 'next/cache';

import { decideAmendment } from '@/lib/meta/store';

// The chief dispatcher's buttons on /meta (no auth in the demo: the page is the chief dispatcher's).
export async function approveAmendment(formData: FormData) {
  await decideAmendment({ id: String(formData.get('id')), status: 'APPROVED' });
  refresh();
}

export async function rejectAmendment(formData: FormData) {
  await decideAmendment({ id: String(formData.get('id')), status: 'REJECTED' });
  refresh();
}
