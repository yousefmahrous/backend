import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fakeT } from '../../test/helpers.js';

vi.mock('./favorite.repository.js', () => ({
  getFavoritesByUser: vi.fn(),
  findFavorite: vi.fn(),
  addFavorite: vi.fn(),
  removeFavorite: vi.fn(),
  getBookById: vi.fn(),
}));

const favoriteRepo = await import('./favorite.repository.js');
const favoriteService = await import('./favorite.service.js');

const t = fakeT;

const makeBook = (overrides = {}) => ({
  id: 1,
  title: 'Book',
  isbn: '123',
  category: 'fiction',
  cover_url: 'http://x/cover.jpg',
  stock: 5,
  ...overrides,
});

describe('favorite.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getFavorites', () => {
    it('serializes the favorites list with the item count', async () => {
      favoriteRepo.getFavoritesByUser.mockResolvedValue([{ id: 10, book: makeBook() }]);

      const result = await favoriteService.getFavorites(t, 5);

      expect(result).toEqual({
        success: true,
        status: 200,
        data: {
          items: [
            {
              id: 10,
              book: { id: '1', name: 'Book', number: '123', category: 'fiction', avatar_url: 'http://x/cover.jpg', stock: 5 },
            },
          ],
          itemsCount: 1,
        },
      });
    });

    it('returns a 500 when the repository throws unexpectedly', async () => {
      favoriteRepo.getFavoritesByUser.mockRejectedValue(new Error('db down'));

      const result = await favoriteService.getFavorites(t, 5);

      expect(result).toEqual({ success: false, status: 500, message: 'favorite.loadError' });
    });
  });

  describe('addFavorite', () => {
    it('returns 404 when the book does not exist', async () => {
      favoriteRepo.getBookById.mockResolvedValue(null);

      const result = await favoriteService.addFavorite(t, 5, 999);

      expect(result).toEqual({ success: false, status: 404, message: 'favorite.bookNotFound' });
      expect(favoriteRepo.addFavorite).not.toHaveBeenCalled();
    });

    it('refuses to add a book that is already favorited', async () => {
      favoriteRepo.getBookById.mockResolvedValue(makeBook());
      favoriteRepo.findFavorite.mockResolvedValue({ id: 10 });

      const result = await favoriteService.addFavorite(t, 5, 1);

      expect(result).toEqual({ success: false, status: 400, message: 'favorite.alreadyExists' });
      expect(favoriteRepo.addFavorite).not.toHaveBeenCalled();
    });

    it('adds the favorite and returns the refreshed list', async () => {
      favoriteRepo.getBookById.mockResolvedValue(makeBook());
      favoriteRepo.findFavorite.mockResolvedValue(null);
      favoriteRepo.getFavoritesByUser.mockResolvedValue([{ id: 10, book: makeBook() }]);

      const result = await favoriteService.addFavorite(t, 5, 1);

      expect(favoriteRepo.addFavorite).toHaveBeenCalledWith(5, 1);
      expect(result).toMatchObject({ success: true, status: 201, message: 'favorite.addSuccess' });
    });
  });

  describe('removeFavorite', () => {
    it('returns 404 when the book is not in the favorites list', async () => {
      favoriteRepo.findFavorite.mockResolvedValue(null);

      const result = await favoriteService.removeFavorite(t, 5, 1);

      expect(result).toEqual({ success: false, status: 404, message: 'favorite.notInFavorites' });
      expect(favoriteRepo.removeFavorite).not.toHaveBeenCalled();
    });

    it('removes the favorite and returns the refreshed list', async () => {
      favoriteRepo.findFavorite.mockResolvedValue({ id: 10 });
      favoriteRepo.getFavoritesByUser.mockResolvedValue([]);

      const result = await favoriteService.removeFavorite(t, 5, 1);

      expect(favoriteRepo.removeFavorite).toHaveBeenCalledWith(5, 1);
      expect(result).toMatchObject({ success: true, status: 200, message: 'favorite.removeSuccess' });
    });
  });
});
