import { calculateETA } from './deliveries';

describe('calculateETA', () => {
  it('does not double count remaining days when status is PO_ISSUED', () => {
    const createdAt = new Date('2024-01-01T00:00:00.000Z');
    const eta = new Date(calculateETA(createdAt.toISOString(), 'PO_ISSUED'));

    const diffInDays = Math.round((eta.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24));
    expect(diffInDays).toBe(77);
  });
});
