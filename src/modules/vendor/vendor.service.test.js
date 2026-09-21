import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fakeT } from '../../test/helpers.js';

vi.mock('./vendor.repository.js', () => ({
  findVendorByOwnerId: vi.fn(),
  findVendorById: vi.fn(),
  createVendorApplication: vi.fn(),
  resubmitVendorApplication: vi.fn(),
  findAllVendors: vi.fn(),
  updateVendorStatus: vi.fn(),
}));

const vendorRepo = await import('./vendor.repository.js');
const vendorService = await import('./vendor.service.js');

const t = fakeT;

const makeVendor = (overrides = {}) => ({
  id: 5,
  owner_id: 9,
  store_name: 'Dar Ali',
  slug: 'dar-ali-9',
  status: 'pending',
  is_platform: false,
  commission_bps: null,
  created_at: 'a',
  owner: { id: 9, name: 'Ali', email: 'ali@x.com' },
  ...overrides,
});

describe('vendor.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('buildVendorSlug', () => {
    it('lowercases, replaces spaces and symbols with hyphens and appends the owner id', () => {
      expect(vendorService.buildVendorSlug('Dar El-Shorouk & Sons!', 9)).toBe('dar-el-shorouk-sons-9');
    });

    it('falls back to "store" when the name has no latin letters or digits (e.g. Arabic)', () => {
      expect(vendorService.buildVendorSlug('دار الشروق', 9)).toBe('store-9');
    });

    it('caps the readable part at 40 characters without leaving a trailing hyphen', () => {
      const slug = vendorService.buildVendorSlug('a'.repeat(39) + ' bbbbbbbb', 9);
      expect(slug).toBe('a'.repeat(39) + '-9');
    });
  });

  describe('applyAsVendor', () => {
    it('creates a pending application with a generated slug for a user with no vendor yet', async () => {
      vendorRepo.findVendorByOwnerId.mockResolvedValue(null);
      vendorRepo.createVendorApplication.mockResolvedValue(makeVendor());

      const result = await vendorService.applyAsVendor(t, 9, 'Dar Ali');

      expect(vendorRepo.createVendorApplication).toHaveBeenCalledWith(9, 'Dar Ali', 'dar-ali-9');
      expect(result.success).toBe(true);
      expect(result.status).toBe(201);
      expect(result.message).toBe('vendor.applied');
      expect(result.data).toMatchObject({ id: 5, store_name: 'Dar Ali', status: 'pending' });
    });

    it.each(['pending', 'active', 'suspended'])(
      'rejects with 409 when the user already has a %s vendor',
      async (status) => {
        vendorRepo.findVendorByOwnerId.mockResolvedValue(makeVendor({ status }));

        const result = await vendorService.applyAsVendor(t, 9, 'Dar Ali');

        expect(result).toEqual({ success: false, status: 409, message: 'vendor.alreadyExists' });
        expect(vendorRepo.createVendorApplication).not.toHaveBeenCalled();
        expect(vendorRepo.resubmitVendorApplication).not.toHaveBeenCalled();
      }
    );

    it('lets a rejected user re-apply by resubmitting the same vendor row', async () => {
      vendorRepo.findVendorByOwnerId.mockResolvedValue(makeVendor({ status: 'rejected' }));
      vendorRepo.resubmitVendorApplication.mockResolvedValue(makeVendor({ store_name: 'New Name' }));

      const result = await vendorService.applyAsVendor(t, 9, 'New Name');

      expect(vendorRepo.resubmitVendorApplication).toHaveBeenCalledWith(5, 'New Name');
      expect(vendorRepo.createVendorApplication).not.toHaveBeenCalled();
      expect(result.status).toBe(201);
    });

    it('returns 409 when two requests race and the unique owner constraint fires', async () => {
      vendorRepo.findVendorByOwnerId.mockResolvedValue(null);
      vendorRepo.createVendorApplication.mockRejectedValue(Object.assign(new Error('dup'), { code: 'P2002' }));

      const result = await vendorService.applyAsVendor(t, 9, 'Dar Ali');

      expect(result).toEqual({ success: false, status: 409, message: 'vendor.alreadyExists' });
    });

    it('returns 500 on an unexpected error', async () => {
      vendorRepo.findVendorByOwnerId.mockRejectedValue(new Error('db down'));

      const result = await vendorService.applyAsVendor(t, 9, 'Dar Ali');

      expect(result).toEqual({ success: false, status: 500, message: 'vendor.applyError' });
    });
  });

  describe('getMyVendor', () => {
    it('returns the vendor when the user has one', async () => {
      vendorRepo.findVendorByOwnerId.mockResolvedValue(makeVendor({ status: 'active' }));

      const result = await vendorService.getMyVendor(t, 9);

      expect(result.status).toBe(200);
      expect(result.data).toMatchObject({ id: 5, status: 'active' });
    });

    it('returns null data (not an error) when the user has no vendor yet', async () => {
      vendorRepo.findVendorByOwnerId.mockResolvedValue(null);

      const result = await vendorService.getMyVendor(t, 9);

      expect(result).toEqual({ success: true, status: 200, data: null });
    });
  });

  describe('getAllVendorsAdmin', () => {
    it('returns serialized vendors with owner info and pagination', async () => {
      vendorRepo.findAllVendors.mockResolvedValue({ vendors: [makeVendor()], totalCount: 45 });

      const result = await vendorService.getAllVendorsAdmin(t, 2, 20, 'pending');

      expect(vendorRepo.findAllVendors).toHaveBeenCalledWith(20, 20, 'pending');
      expect(result.data.items[0].owner).toEqual({ id: 9, name: 'Ali', email: 'ali@x.com' });
      expect(result.data.pagination).toEqual({
        totalCount: 45,
        totalPages: 3,
        currentPage: 2,
        limit: 20,
        hasNextPage: true,
        hasPreviousPage: true,
      });
    });

    it('ignores an unknown status filter instead of passing it to the query', async () => {
      vendorRepo.findAllVendors.mockResolvedValue({ vendors: [], totalCount: 0 });

      await vendorService.getAllVendorsAdmin(t, 1, 20, 'hacked');

      expect(vendorRepo.findAllVendors).toHaveBeenCalledWith(0, 20, undefined);
    });
  });

  describe('changeVendorStatus', () => {
    it('returns 404 when the vendor does not exist', async () => {
      vendorRepo.findVendorById.mockResolvedValue(null);

      const result = await vendorService.changeVendorStatus(t, 5, 'active');

      expect(result).toEqual({ success: false, status: 404, message: 'vendor.notFound' });
    });

    it("refuses to change the store's own vendor", async () => {
      vendorRepo.findVendorById.mockResolvedValue(makeVendor({ is_platform: true, status: 'active' }));

      const result = await vendorService.changeVendorStatus(t, 1, 'suspended');

      expect(result).toEqual({ success: false, status: 400, message: 'vendor.platformImmutable' });
      expect(vendorRepo.updateVendorStatus).not.toHaveBeenCalled();
    });

    it.each([
      ['pending', 'active'],
      ['pending', 'rejected'],
      ['active', 'suspended'],
      ['suspended', 'active'],
    ])('allows %s -> %s', async (from, to) => {
      vendorRepo.findVendorById.mockResolvedValue(makeVendor({ status: from }));
      vendorRepo.updateVendorStatus.mockResolvedValue(true);

      const result = await vendorService.changeVendorStatus(t, 5, to);

      expect(vendorRepo.updateVendorStatus).toHaveBeenCalledWith(5, from, to);
      expect(result.success).toBe(true);
      expect(result.status).toBe(200);
      expect(result.message).toBe('vendor.statusUpdated');
      expect(result.data.status).toBe(to);
    });

    it.each([
      ['pending', 'suspended'],
      ['active', 'rejected'],
      ['active', 'active'],
      ['rejected', 'active'],
      ['suspended', 'rejected'],
    ])('rejects %s -> %s with 400', async (from, to) => {
      vendorRepo.findVendorById.mockResolvedValue(makeVendor({ status: from }));

      const result = await vendorService.changeVendorStatus(t, 5, to);

      expect(result).toEqual({ success: false, status: 400, message: 'vendor.invalidTransition' });
      expect(vendorRepo.updateVendorStatus).not.toHaveBeenCalled();
    });

    it('returns 409 when someone else changed the status in between (compare-and-set fails)', async () => {
      vendorRepo.findVendorById.mockResolvedValue(makeVendor({ status: 'pending' }));
      vendorRepo.updateVendorStatus.mockResolvedValue(false);

      const result = await vendorService.changeVendorStatus(t, 5, 'active');

      expect(result).toEqual({ success: false, status: 409, message: 'vendor.statusConflict' });
    });

    it('returns 500 on an unexpected error', async () => {
      vendorRepo.findVendorById.mockRejectedValue(new Error('db down'));

      const result = await vendorService.changeVendorStatus(t, 5, 'active');

      expect(result).toEqual({ success: false, status: 500, message: 'vendor.updateError' });
    });
  });
});