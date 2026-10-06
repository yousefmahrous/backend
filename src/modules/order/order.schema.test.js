import { describe, it, expect } from 'vitest';
import { fakeT } from '../../test/helpers.js';
import { shippingAddressSchema, normalizePhone } from './order.schema.js';

const valid = {
  name: 'Ali Hassan',
  phone: '01012345678',
  address: '12 Tahrir St, Dokki',
  city: 'Giza',
};

const parse = (overrides = {}) => shippingAddressSchema(fakeT).safeParse({ ...valid, ...overrides });

describe('order.schema shippingAddressSchema', () => {
  it('accepts a valid address and turns missing notes into null', () => {
    const result = parse();
    expect(result.success).toBe(true);
    expect(result.data.notes).toBeNull();
  });

  it('trims text fields', () => {
    const result = parse({ name: '  Ali Hassan  ', city: ' Giza ' });
    expect(result.data).toMatchObject({ name: 'Ali Hassan', city: 'Giza' });
  });

  it.each([
    ['+20 101 234 5678', '01012345678'],
    ['0020-101-234-5678', '01012345678'],
    ['٠١٠١٢٣٤٥٦٧٨', '01012345678'],
    ['010 1234 5678', '01012345678'],
  ])('normalizes the phone number %s', (input, expected) => {
    expect(normalizePhone(input)).toBe(expected);
    expect(parse({ phone: input }).data.phone).toBe(expected);
  });

  it.each(['12345', '01312345678', '0101234567', 'abcdefghijk'])('rejects the invalid phone %s', (phone) => {
    const result = parse({ phone });
    expect(result.success).toBe(false);
    expect(result.error.flatten().fieldErrors.phone).toEqual(['order.validation.phoneInvalid']);
  });

  it('rejects a too-short address', () => {
    const result = parse({ address: 'short' });
    expect(result.error.flatten().fieldErrors.address).toEqual(['order.validation.addressMin']);
  });

  it('rejects missing required fields with the required message', () => {
    const result = shippingAddressSchema(fakeT).safeParse({});
    const errors = result.error.flatten().fieldErrors;
    expect(errors.name).toEqual(['order.validation.nameRequired']);
    expect(errors.phone).toEqual(['order.validation.phoneRequired']);
    expect(errors.address).toEqual(['order.validation.addressRequired']);
    expect(errors.city).toEqual(['order.validation.cityRequired']);
  });

  it('rejects notes over 300 characters', () => {
    const result = parse({ notes: 'x'.repeat(301) });
    expect(result.error.flatten().fieldErrors.notes).toEqual(['order.validation.notesMax']);
  });

  it('treats blank notes as null', () => {
    expect(parse({ notes: '   ' }).data.notes).toBeNull();
  });
});