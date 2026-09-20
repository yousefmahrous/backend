import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../core/db.js', () => ({
  default: {
    vendor: { findFirst: vi.fn() },
  },
}));

const prisma = (await import('../../core/db.js')).default;
const vendorRepo = await import('./vendor.repository.js');

describe('vendor.repository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vendorRepo.__resetPlatformVendorCache();
  });

  describe('getPlatformVendorId', () => {
    it("returns the id of the store's own vendor", async () => {
      prisma.vendor.findFirst.mockResolvedValue({ id: 7 });

      const id = await vendorRepo.getPlatformVendorId();

      expect(id).toBe(7);
      expect(prisma.vendor.findFirst).toHaveBeenCalledWith({
        where: { is_platform: true },
        select: { id: true },
      });
    });

    it('caches the id so the database is only hit once', async () => {
      prisma.vendor.findFirst.mockResolvedValue({ id: 7 });

      await vendorRepo.getPlatformVendorId();
      await vendorRepo.getPlatformVendorId();
      await vendorRepo.getPlatformVendorId();

      expect(prisma.vendor.findFirst).toHaveBeenCalledTimes(1);
    });

    it('throws when the platform vendor row is missing (migration not applied)', async () => {
      prisma.vendor.findFirst.mockResolvedValue(null);

      await expect(vendorRepo.getPlatformVendorId()).rejects.toThrow('PLATFORM_VENDOR_MISSING');
    });

    it('does not cache a failed lookup', async () => {
      prisma.vendor.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 3 });

      await expect(vendorRepo.getPlatformVendorId()).rejects.toThrow();
      await expect(vendorRepo.getPlatformVendorId()).resolves.toBe(3);
    });
  });
});