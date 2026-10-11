import { describe, it, expect } from 'vitest';
import { fakeT } from '../../test/helpers.js';
import { createPayoutSchema } from './payout.schema.js';

const parse = (body) => createPayoutSchema(fakeT).safeParse(body);

describe('payout.schema createPayoutSchema', () => {
  it('accepts a reference with an optional note', () => {
    expect(parse({ reference: ' TRX-1 ', note: 'bank' }).data).toEqual({ reference: 'TRX-1', note: 'bank' });
  });

  it('treats a blank note as missing', () => {
    expect(parse({ reference: 'TRX-1', note: '   ' }).data.note).toBeUndefined();
  });

  it.each([{}, { reference: '' }, { reference: '   ' }])('requires a reference: %j', (body) => {
    const result = parse(body);
    expect(result.success).toBe(false);
    expect(result.error.flatten().fieldErrors.reference).toEqual(['payout.validation.referenceRequired']);
  });

  it('rejects over-long reference and note', () => {
    expect(parse({ reference: 'x'.repeat(101) }).error.flatten().fieldErrors.reference).toEqual([
      'payout.validation.referenceMax',
    ]);
    expect(parse({ reference: 'R', note: 'x'.repeat(301) }).error.flatten().fieldErrors.note).toEqual([
      'payout.validation.noteMax',
    ]);
  });
});