import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fakeT } from '../../test/helpers.js';

vi.mock('./auth.repository.js', () => ({
  findUserByEmail: vi.fn(),
  findUserById: vi.fn(),
  createUser: vi.fn(),
  saveResetToken: vi.fn(),
  findUserByResetToken: vi.fn(),
  updatePasswordAndClearToken: vi.fn(),
  updatePassword: vi.fn(),
  saveVerificationToken: vi.fn(),
  findUserByVerificationToken: vi.fn(),
  markEmailAsVerified: vi.fn(),
}));

vi.mock('bcrypt', () => ({
  default: {
    genSalt: vi.fn(async () => 'salt'),
    hash: vi.fn(async (value) => `hashed:${value}`),
    compare: vi.fn(async () => true),
  },
}));

vi.mock('../../core/services/email.service.js', () => ({
  sendWelcomeEmail: vi.fn(),
  sendResetPasswordEmail: vi.fn(),
}));

vi.mock('../../core/config/redis.client.js', () => ({
  default: { keys: vi.fn(async () => []), get: vi.fn(), del: vi.fn() },
}));

vi.mock('../../core/email.queue.js', () => ({
  addWelcomeEmailJob: vi.fn(),
  addResetPasswordEmailJob: vi.fn(),
  addVerificationEmailJob: vi.fn(),
}));

const authRepo = await import('./auth.repository.js');
const bcrypt = (await import('bcrypt')).default;
const redisClient = (await import('../../core/config/redis.client.js')).default;
const emailQueue = await import('../../core/email.queue.js');
const authService = await import('./auth.service.js');

const t = fakeT;

describe('auth.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('signup', () => {
    it('throws when the email is already in use, without creating a user', async () => {
      authRepo.findUserByEmail.mockResolvedValue({ id: 1, email: 'a@b.com' });

      await expect(
        authService.signup(t, { name: 'Ali', email: 'a@b.com', password: 'pw' })
      ).rejects.toThrow('auth.emailInUse');

      expect(authRepo.createUser).not.toHaveBeenCalled();
    });

    it('hashes the password, creates the user, and issues a verification email', async () => {
      authRepo.findUserByEmail.mockResolvedValue(null);
      authRepo.createUser.mockResolvedValue({ id: 5, name: 'Ali', email: 'a@b.com' });

      const result = await authService.signup(t, { name: 'Ali', email: 'a@b.com', password: 'pw' }, 'ar');

      expect(bcrypt.hash).toHaveBeenCalledWith('pw', 'salt');
      expect(authRepo.createUser).toHaveBeenCalledWith('Ali', 'a@b.com', 'hashed:pw', 'ar');
      expect(authRepo.saveVerificationToken).toHaveBeenCalledWith(5, expect.any(String), expect.any(Date));
      expect(emailQueue.addVerificationEmailJob).toHaveBeenCalledWith(
        'a@b.com',
        'Ali',
        expect.stringContaining('/verify-email?token='),
        'ar'
      );
      expect(result).toEqual({ id: 5, name: 'Ali', email: 'a@b.com' });
    });
  });

  describe('login', () => {
    it('throws a generic "invalid credentials" error when the user does not exist', async () => {
      authRepo.findUserByEmail.mockResolvedValue(null);

      await expect(authService.login(t, { email: 'a@b.com', password: 'pw' })).rejects.toThrow(
        'auth.invalidCredentials'
      );
    });

    it('throws the same generic error when the password does not match (does not leak which part is wrong)', async () => {
      authRepo.findUserByEmail.mockResolvedValue({ id: 1, password: 'hashed', is_email_verified: true });
      bcrypt.compare.mockResolvedValue(false);

      await expect(authService.login(t, { email: 'a@b.com', password: 'wrong' })).rejects.toThrow(
        'auth.invalidCredentials'
      );
    });

    it('throws a tagged EMAIL_NOT_VERIFIED error when the password is correct but the email is unverified', async () => {
      authRepo.findUserByEmail.mockResolvedValue({ id: 1, password: 'hashed', is_email_verified: false });
      bcrypt.compare.mockResolvedValue(true);

      await expect(authService.login(t, { email: 'a@b.com', password: 'pw' })).rejects.toMatchObject({
        message: 'auth.emailNotVerified',
        code: 'EMAIL_NOT_VERIFIED',
      });
    });

    it('normalizes the role to lowercase and falls back to "customer" when no role is set', async () => {
      authRepo.findUserByEmail.mockResolvedValue({
        id: 1,
        name: 'Ali',
        email: 'a@b.com',
        password: 'hashed',
        is_email_verified: true,
        role: 'ADMIN',
      });
      bcrypt.compare.mockResolvedValue(true);

      const result = await authService.login(t, { email: 'a@b.com', password: 'pw' });

      expect(result).toEqual({ id: 1, name: 'Ali', email: 'a@b.com', role: 'admin' });
    });

    it('defaults role to "customer" when the user has none', async () => {
      authRepo.findUserByEmail.mockResolvedValue({
        id: 1,
        name: 'Ali',
        email: 'a@b.com',
        password: 'hashed',
        is_email_verified: true,
        role: null,
      });
      bcrypt.compare.mockResolvedValue(true);

      const result = await authService.login(t, { email: 'a@b.com', password: 'pw' });

      expect(result.role).toBe('customer');
    });
  });

  describe('verifyEmail', () => {
    it('throws when the token does not match any user', async () => {
      authRepo.findUserByVerificationToken.mockResolvedValue(null);

      await expect(authService.verifyEmail(t, 'bad-token')).rejects.toThrow('auth.verifyTokenInvalid');
    });

    it('is idempotent: returns the user without re-sending the welcome email if already verified', async () => {
      authRepo.findUserByVerificationToken.mockResolvedValue({
        id: 1,
        name: 'Ali',
        email: 'a@b.com',
        is_email_verified: true,
      });

      const result = await authService.verifyEmail(t, 'token');

      expect(authRepo.markEmailAsVerified).not.toHaveBeenCalled();
      expect(emailQueue.addWelcomeEmailJob).not.toHaveBeenCalled();
      expect(result).toEqual({ name: 'Ali', email: 'a@b.com' });
    });

    it('marks the email verified and queues a welcome email on first verification', async () => {
      authRepo.findUserByVerificationToken.mockResolvedValue({
        id: 1,
        name: 'Ali',
        email: 'a@b.com',
        is_email_verified: false,
        preferred_lang: 'ar',
      });

      await authService.verifyEmail(t, 'token');

      expect(authRepo.markEmailAsVerified).toHaveBeenCalledWith(1);
      expect(emailQueue.addWelcomeEmailJob).toHaveBeenCalledWith('a@b.com', 'Ali', 'ar');
    });
  });

  describe('resendVerification', () => {
    it('does nothing silently when there is no such user', async () => {
      authRepo.findUserByEmail.mockResolvedValue(null);

      await authService.resendVerification('nobody@x.com');

      expect(authRepo.saveVerificationToken).not.toHaveBeenCalled();
    });

    it('does nothing silently when the user is already verified', async () => {
      authRepo.findUserByEmail.mockResolvedValue({ id: 1, is_email_verified: true });

      await authService.resendVerification('a@b.com');

      expect(authRepo.saveVerificationToken).not.toHaveBeenCalled();
    });

    it('issues a fresh verification token for an unverified user', async () => {
      authRepo.findUserByEmail.mockResolvedValue({
        id: 1,
        email: 'a@b.com',
        name: 'Ali',
        is_email_verified: false,
        preferred_lang: 'en',
      });

      await authService.resendVerification('a@b.com');

      expect(authRepo.saveVerificationToken).toHaveBeenCalledWith(1, expect.any(String), expect.any(Date));
    });
  });

  describe('forgotPassword', () => {
    it('does nothing silently when there is no such user (avoids leaking which emails are registered)', async () => {
      authRepo.findUserByEmail.mockResolvedValue(null);

      await authService.forgotPassword('nobody@x.com');

      expect(authRepo.saveResetToken).not.toHaveBeenCalled();
      expect(emailQueue.addResetPasswordEmailJob).not.toHaveBeenCalled();
    });

    it('saves a reset token and queues the reset email for an existing user', async () => {
      authRepo.findUserByEmail.mockResolvedValue({ id: 1, email: 'a@b.com', preferred_lang: 'ar' });

      await authService.forgotPassword('a@b.com');

      expect(authRepo.saveResetToken).toHaveBeenCalledWith(1, expect.any(String), expect.any(Date));
      expect(emailQueue.addResetPasswordEmailJob).toHaveBeenCalledWith(
        'a@b.com',
        expect.stringContaining('/reset-password?token='),
        'ar'
      );
    });
  });

  describe('resetPassword', () => {
    it('throws when the reset token is invalid or expired', async () => {
      authRepo.findUserByResetToken.mockResolvedValue(null);

      await expect(authService.resetPassword(t, 'bad-token', 'newpw')).rejects.toThrow(
        'auth.resetTokenInvalid'
      );
      expect(authRepo.updatePasswordAndClearToken).not.toHaveBeenCalled();
    });

    it('hashes the new password, clears the token, and destroys the user\'s sessions', async () => {
      authRepo.findUserByResetToken.mockResolvedValue({ id: 1 });
      redisClient.keys.mockResolvedValue(['sess:a']);
      redisClient.get.mockResolvedValue(JSON.stringify({ user: { id: 1 } }));

      await authService.resetPassword(t, 'good-token', 'newpw');

      expect(authRepo.updatePasswordAndClearToken).toHaveBeenCalledWith(1, 'hashed:newpw');
      expect(redisClient.del).toHaveBeenCalledWith('sess:a');
    });
  });

  describe('changePassword', () => {
    it('throws when the user does not exist', async () => {
      authRepo.findUserById.mockResolvedValue(null);

      await expect(authService.changePassword(t, 1, 'old', 'new')).rejects.toThrow('auth.userNotFound');
    });

    it('throws when the old password does not match, without updating anything', async () => {
      authRepo.findUserById.mockResolvedValue({ id: 1, password: 'hashed' });
      bcrypt.compare.mockResolvedValue(false);

      await expect(authService.changePassword(t, 1, 'wrong-old', 'new')).rejects.toThrow(
        'auth.oldPasswordInvalid'
      );
      expect(authRepo.updatePassword).not.toHaveBeenCalled();
    });

    it('updates the password and destroys sessions belonging to other users only', async () => {
      authRepo.findUserById.mockResolvedValue({ id: 1, password: 'hashed' });
      bcrypt.compare.mockResolvedValue(true);
      redisClient.keys.mockResolvedValue(['sess:a', 'sess:b']);
      redisClient.get.mockImplementation(async (key) =>
        key === 'sess:a' ? JSON.stringify({ user: { id: 1 } }) : JSON.stringify({ user: { id: 2 } })
      );

      await authService.changePassword(t, 1, 'old', 'newpw');

      expect(authRepo.updatePassword).toHaveBeenCalledWith(1, 'hashed:newpw');
      expect(redisClient.del).toHaveBeenCalledWith('sess:a');
      expect(redisClient.del).not.toHaveBeenCalledWith('sess:b');
    });
  });
});