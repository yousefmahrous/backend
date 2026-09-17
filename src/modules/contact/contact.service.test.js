import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fakeT } from '../../test/helpers.js';

vi.mock('./contact.repository.js', () => ({
  createContactMessage: vi.fn(),
}));

vi.mock('../../core/email.queue.js', () => ({
  addContactNotificationEmailJob: vi.fn(),
}));

const contactRepo = await import('./contact.repository.js');
const emailQueue = await import('../../core/email.queue.js');
const contactService = await import('./contact.service.js');

const t = fakeT;

const payload = { name: 'Ali', email: 'a@b.com', subject: 'Help', message: 'I need help' };

describe('contact.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('submitContactMessage', () => {
    it('saves the message and queues a notification email', async () => {
      const result = await contactService.submitContactMessage(t, payload);

      expect(contactRepo.createContactMessage).toHaveBeenCalledWith(payload);
      expect(emailQueue.addContactNotificationEmailJob).toHaveBeenCalledWith(payload);
      expect(result).toEqual({ success: true, status: 201, message: 'contact.sendSuccess' });
    });

    it('still returns success even when queuing the notification email fails', async () => {
      emailQueue.addContactNotificationEmailJob.mockRejectedValue(new Error('queue down'));

      const result = await contactService.submitContactMessage(t, payload);

      expect(result).toEqual({ success: true, status: 201, message: 'contact.sendSuccess' });
    });

    it('returns a 500 when saving the message itself fails', async () => {
      contactRepo.createContactMessage.mockRejectedValue(new Error('db down'));

      const result = await contactService.submitContactMessage(t, payload);

      expect(result).toEqual({ success: false, status: 500, message: 'contact.sendError' });
      expect(emailQueue.addContactNotificationEmailJob).not.toHaveBeenCalled();
    });
  });
});
