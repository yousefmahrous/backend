import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fakeT } from '../../test/helpers.js';

vi.mock('./ticket.repository.js', () => ({
  createTicketWithFirstMessage: vi.fn(),
  findTicketsForUser: vi.fn(),
  findAllTickets: vi.fn(),
  findTicketById: vi.fn(),
  addMessage: vi.fn(),
  setTicketStatus: vi.fn(),
}));

vi.mock('../../core/config/socket.config.js', () => ({
  getIO: vi.fn(() => {
    throw new Error('Socket.io is not initialized!');
  }),
}));

const ticketRepo = await import('./ticket.repository.js');
const ticketService = await import('./ticket.service.js');

const t = fakeT;

describe('ticket.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createTicket', () => {
    it('trims subject/message before persisting and returns the created ticket', async () => {
      ticketRepo.createTicketWithFirstMessage.mockResolvedValue({
        id: 1,
        subject: 'Help',
        status: 'opened',
        created_at: 'a',
        updated_at: 'a',
        closed_at: null,
        user: { id: 5, name: 'Ali', email: 'ali@x.com' },
        messages: [{ id: 10, ticket_id: 1, sender_type: 'user', sender_id: 5, body: 'hi', created_at: 'a' }],
      });

      const result = await ticketService.createTicket(t, 'ar', 5, '  Help  ', '  hi  ');

      expect(ticketRepo.createTicketWithFirstMessage).toHaveBeenCalledWith(5, 'Help', 'hi', 'ticket.system.opened');
      expect(result).toMatchObject({ success: true, status: 201 });
      expect(result.data.id).toBe(1);
      expect(result.data.messages).toHaveLength(1);
    });

    it('returns a 500 when the repository throws', async () => {
      ticketRepo.createTicketWithFirstMessage.mockRejectedValue(new Error('db down'));

      const result = await ticketService.createTicket(t, 'ar', 5, 'Help', 'hi');

      expect(result).toEqual({ success: false, status: 500, message: 'ticket.createError' });
    });
  });

  describe('getTicketDetail', () => {
    it('returns 404 when the ticket does not exist', async () => {
      ticketRepo.findTicketById.mockResolvedValue(null);

      const result = await ticketService.getTicketDetail(t, 'ar', 99, 5, false);

      expect(result).toEqual({ success: false, status: 404, message: 'ticket.notFound' });
    });

    it("blocks a non-admin from viewing someone else's ticket", async () => {
      ticketRepo.findTicketById.mockResolvedValue({ id: 1, user_id: 7, messages: [] });

      const result = await ticketService.getTicketDetail(t, 'ar', 1, 5, false);

      expect(result).toEqual({ success: false, status: 403, message: 'ticket.notAllowed' });
    });

    it('allows the owner to view their own ticket', async () => {
      ticketRepo.findTicketById.mockResolvedValue({
        id: 1,
        user_id: 5,
        subject: 's',
        status: 'opened',
        created_at: 'a',
        updated_at: 'a',
        closed_at: null,
        messages: [],
      });

      const result = await ticketService.getTicketDetail(t, 'ar', 1, 5, false);

      expect(result).toMatchObject({ success: true, status: 200 });
    });

    it('allows an admin to view any ticket regardless of owner', async () => {
      ticketRepo.findTicketById.mockResolvedValue({
        id: 1,
        user_id: 7,
        subject: 's',
        status: 'opened',
        created_at: 'a',
        updated_at: 'a',
        closed_at: null,
        messages: [],
      });

      const result = await ticketService.getTicketDetail(t, 'ar', 1, 999, true);

      expect(result.success).toBe(true);
    });
  });

  describe('sendMessage', () => {
    it('returns 404 when the ticket does not exist', async () => {
      ticketRepo.findTicketById.mockResolvedValue(null);

      const result = await ticketService.sendMessage(t, 'ar', 1, 5, 'hi', false);

      expect(result).toEqual({ success: false, status: 404, message: 'ticket.notFound' });
    });

    it("blocks a user from messaging on someone else's ticket", async () => {
      ticketRepo.findTicketById.mockResolvedValue({ id: 1, user_id: 7, status: 'opened' });

      const result = await ticketService.sendMessage(t, 'ar', 1, 5, 'hi', false);

      expect(result).toEqual({ success: false, status: 403, message: 'ticket.notAllowed' });
      expect(ticketRepo.addMessage).not.toHaveBeenCalled();
    });

    it('blocks messages on a resolved (closed) ticket, even for the owner', async () => {
      ticketRepo.findTicketById.mockResolvedValue({ id: 1, user_id: 5, status: 'resolved' });

      const result = await ticketService.sendMessage(t, 'ar', 1, 5, 'hi', false);

      expect(result).toEqual({ success: false, status: 400, message: 'ticket.isClosed' });
      expect(ticketRepo.addMessage).not.toHaveBeenCalled();
    });

    it('blocks admin messages too once a ticket is resolved', async () => {
      ticketRepo.findTicketById.mockResolvedValue({ id: 1, user_id: 5, status: 'resolved' });

      const result = await ticketService.sendMessage(t, 'ar', 1, 999, 'hi', true);

      expect(result).toMatchObject({ success: false, status: 400 });
    });

    it('auto-flips the ticket to "pending" when the user replies to a non-pending ticket', async () => {
      ticketRepo.findTicketById.mockResolvedValue({ id: 1, user_id: 5, status: 'under_review' });
      ticketRepo.addMessage.mockResolvedValue({
        id: 20,
        ticket_id: 1,
        sender_type: 'user',
        sender_id: 5,
        body: 'ok',
        created_at: 'a',
      });

      const result = await ticketService.sendMessage(t, 'ar', 1, 5, '  ok  ', false);

      expect(ticketRepo.addMessage).toHaveBeenCalledWith(1, 'user', 5, 'ok');
      expect(ticketRepo.setTicketStatus).toHaveBeenCalledWith(1, 'pending');
      expect(result).toMatchObject({ success: true, status: 201 });
    });

    it('does not re-flip the status when the ticket is already "pending"', async () => {
      ticketRepo.findTicketById.mockResolvedValue({ id: 1, user_id: 5, status: 'pending' });
      ticketRepo.addMessage.mockResolvedValue({
        id: 21,
        ticket_id: 1,
        sender_type: 'user',
        sender_id: 5,
        body: 'ok',
        created_at: 'a',
      });

      await ticketService.sendMessage(t, 'ar', 1, 5, 'ok', false);

      expect(ticketRepo.setTicketStatus).not.toHaveBeenCalled();
    });

    it('never flips the status on an admin reply, regardless of current status', async () => {
      ticketRepo.findTicketById.mockResolvedValue({ id: 1, user_id: 5, status: 'opened' });
      ticketRepo.addMessage.mockResolvedValue({
        id: 22,
        ticket_id: 1,
        sender_type: 'admin',
        sender_id: 999,
        body: 'ok',
        created_at: 'a',
      });

      await ticketService.sendMessage(t, 'ar', 1, 999, 'ok', true);

      expect(ticketRepo.addMessage).toHaveBeenCalledWith(1, 'admin', 999, 'ok');
      expect(ticketRepo.setTicketStatus).not.toHaveBeenCalled();
    });
  });

  describe('updateTicketStatus', () => {
    it('returns 404 when the ticket does not exist', async () => {
      ticketRepo.findTicketById.mockResolvedValue(null);

      const result = await ticketService.updateTicketStatus(t, 'ar', 1, 'resolved');

      expect(result).toEqual({ success: false, status: 404, message: 'ticket.notFound' });
      expect(ticketRepo.setTicketStatus).not.toHaveBeenCalled();
    });

    it('updates the status and posts a system message describing the change', async () => {
      ticketRepo.findTicketById.mockResolvedValue({ id: 1, status: 'opened' });
      ticketRepo.setTicketStatus.mockResolvedValue({
        id: 1,
        status: 'resolved',
        subject: 's',
        created_at: 'a',
        updated_at: 'a',
        closed_at: 'a',
      });
      ticketRepo.addMessage.mockResolvedValue({
        id: 30,
        ticket_id: 1,
        sender_type: 'system',
        sender_id: null,
        body: 'ticket.system.status.resolved',
        created_at: 'a',
      });

      const result = await ticketService.updateTicketStatus(t, 'ar', 1, 'resolved');

      expect(ticketRepo.setTicketStatus).toHaveBeenCalledWith(1, 'resolved');
      expect(ticketRepo.addMessage).toHaveBeenCalledWith(1, 'system', null, 'ticket.system.status.resolved');
      expect(result).toMatchObject({ success: true, status: 200 });
      expect(result.data.status).toBe('resolved');
    });

    it('still succeeds even when no one is listening on the socket (emit failures are swallowed)', async () => {
      ticketRepo.findTicketById.mockResolvedValue({ id: 1, status: 'opened' });
      ticketRepo.setTicketStatus.mockResolvedValue({
        id: 1,
        status: 'pending',
        subject: 's',
        created_at: 'a',
        updated_at: 'a',
        closed_at: null,
      });
      ticketRepo.addMessage.mockResolvedValue({
        id: 31,
        ticket_id: 1,
        sender_type: 'system',
        sender_id: null,
        body: 'x',
        created_at: 'a',
      });

      await expect(ticketService.updateTicketStatus(t, 'ar', 1, 'pending')).resolves.toMatchObject({
        success: true,
      });
    });
  });
});
