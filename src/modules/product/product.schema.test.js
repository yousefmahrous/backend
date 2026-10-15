import { describe, it, expect } from 'vitest';
import { fakeT } from '../../test/helpers.js';
import { createProductSchema, createEditProductSchema } from './product.schema.js';

const t = fakeT;

const baseProduct = {
  name: { ar: 'منتج', en: 'Product' },
  adress: { ar: 'وصف المنتج', en: 'Product description' },
  category: 'electronics',
  stock: 3,
  price: 10.5,
};

const fieldErrors = (result) => result.error.flatten().fieldErrors;

describe('createProductSchema product-only fields', () => {
  const schema = createProductSchema(t);

  it('accepts a product with no ISBN, publisher or publisher email at all', () => {
    const result = schema.safeParse(baseProduct);

    expect(result.success).toBe(true);
    expect(result.data.number ?? null).toBeNull();
    expect(result.data.email ?? null).toBeNull();
    expect(result.data.centre ?? null).toBeNull();
    expect(result.data.price).toBe(1050);
  });

  it('turns blank strings into null instead of failing the format checks', () => {
    const result = schema.safeParse({ ...baseProduct, number: '  ', email: '', centre: ' ' });

    expect(result.success).toBe(true);
    expect(result.data.number).toBeNull();
    expect(result.data.email).toBeNull();
    expect(result.data.centre).toBeNull();
  });

  it('accepts explicit nulls', () => {
    const result = schema.safeParse({ ...baseProduct, number: null, email: null, centre: null });

    expect(result.success).toBe(true);
    expect(result.data.number).toBeNull();
  });

  it('still accepts a valid ISBN, email and publisher and trims them', () => {
    const result = schema.safeParse({
      ...baseProduct,
      number: ' 978-0060883287 ',
      email: ' pub@example.com ',
      centre: ' Harper ',
    });

    expect(result.success).toBe(true);
    expect(result.data.number).toBe('978-0060883287');
    expect(result.data.email).toBe('pub@example.com');
    expect(result.data.centre).toBe('Harper');
  });

  it('still rejects a malformed ISBN when one is provided', () => {
    const result = schema.safeParse({ ...baseProduct, number: 'not-an-isbn' });

    expect(result.success).toBe(false);
    expect(fieldErrors(result).number).toContain('product.validation.isbnInvalid');
  });

  it('still rejects a malformed publisher email when one is provided', () => {
    const result = schema.safeParse({ ...baseProduct, email: 'nope' });

    expect(result.success).toBe(false);
    expect(fieldErrors(result).email).toContain('product.validation.emailInvalid');
  });

  it('still rejects a one-character publisher name when one is provided', () => {
    const result = schema.safeParse({ ...baseProduct, centre: 'x' });

    expect(result.success).toBe(false);
    expect(fieldErrors(result).centre).toContain('product.validation.publisherMin');
  });

  it('keeps the required fields required', () => {
    const result = schema.safeParse({});

    expect(result.success).toBe(false);
    const errors = fieldErrors(result);
    expect(errors.name).toBeDefined();
    expect(errors.adress).toBeDefined();
    expect(errors.category).toBeDefined();
  });
});

describe('createEditProductSchema publisher email', () => {
  const schema = createEditProductSchema(t);
  const editData = { name: baseProduct.name, adress: baseProduct.adress, stock: 1, price: 2 };

  it('accepts an edit without a publisher email and leaves it undefined (so the stored value is untouched)', () => {
    const result = schema.safeParse(editData);

    expect(result.success).toBe(true);
    expect(result.data.email).toBeUndefined();
  });

  it('turns a blank publisher email into null (clears it)', () => {
    const result = schema.safeParse({ ...editData, email: '' });

    expect(result.success).toBe(true);
    expect(result.data.email).toBeNull();
  });

  it('still rejects a malformed publisher email', () => {
    const result = schema.safeParse({ ...editData, email: 'nope' });

    expect(result.success).toBe(false);
    expect(fieldErrors(result).email).toContain('product.validation.emailInvalid');
  });
});
