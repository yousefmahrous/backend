import * as ticketRepo from './ticket.repository.js';
import { getIO } from '../../core/config/socket.config.js';

const CLOSED_STATUSES = ['resolved'];

const serializeMessage = (message) => ({
  id: message.id,
  ticket_id: message.ticket_id,
  sender_type: message.sender_type,
  sender_id: message.sender_id,
  body: message.body,
  created_at: message.created_at
});

const serializeTicket = (ticket, { withMessages = false } = {}) => ({
  id: ticket.id,
  subject: ticket.subject,
  status: ticket.status,
  created_at: ticket.created_at,
  updated_at: ticket.updated_at,
  closed_at: ticket.closed_at,
  user: ticket.user
    ? { id: ticket.user.id, name: ticket.user.name, email: ticket.user.email }
    : undefined,
  last_message: ticket.messages?.[0] ? serializeMessage(ticket.messages[0]) : undefined,
  messages: withMessages ? ticket.messages?.map(serializeMessage) : undefined
});

const emitToTicket = (ticketId, event, payload) => {
  try {
    getIO().to(`ticket:${ticketId}`).emit(event, payload);
  } catch (err) {

  }
};

export const createTicket = async (t, lang, userId, subject, message) => {
  try {
    const ticket = await ticketRepo.createTicketWithFirstMessage(
      userId,
      subject.trim(),
      message.trim(),
      t('ticket.system.opened')
    );

    return {
      success: true,
      status: 201,
      message: t('ticket.createdMessage'),
      data: serializeTicket(ticket, { withMessages: true })
    };
  } catch (err) {
    console.error(err);
    return { success: false, status: 500, message: t('ticket.createError') };
  }
};

export const getMyTickets = async (t, lang, userId) => {
  try {
    const tickets = await ticketRepo.findTicketsForUser(userId);
    return { success: true, status: 200, data: { items: tickets.map((tk) => serializeTicket(tk)) } };
  } catch (err) {
    console.error(err);
    return { success: false, status: 500, message: t('ticket.loadError') };
  }
};

export const getAllTicketsAdmin = async (t, lang, page = 1, limit = 20, status) => {
  try {
    const pageNumber = Math.max(1, parseInt(page) || 1);
    const limitNumber = Math.max(1, parseInt(limit) || 20);
    const skip = (pageNumber - 1) * limitNumber;

    const { tickets, totalCount } = await ticketRepo.findAllTickets(skip, limitNumber, status);
    const totalPages = Math.ceil(totalCount / limitNumber) || 1;

    return {
      success: true,
      status: 200,
      data: {
        items: tickets.map((tk) => serializeTicket(tk)),
        pagination: {
          totalCount,
          totalPages,
          currentPage: pageNumber,
          limit: limitNumber,
          hasNextPage: pageNumber < totalPages,
          hasPreviousPage: pageNumber > 1
        }
      }
    };
  } catch (err) {
    console.error(err);
    return { success: false, status: 500, message: t('ticket.loadError') };
  }
};

export const getTicketDetail = async (t, lang, ticketId, userId, isAdmin) => {
  try {
    const ticket = await ticketRepo.findTicketById(ticketId);

    if (!ticket) {
      return { success: false, status: 404, message: t('ticket.notFound') };
    }

    if (!isAdmin && ticket.user_id !== userId) {
      return { success: false, status: 403, message: t('ticket.notAllowed') };
    }

    return { success: true, status: 200, data: serializeTicket(ticket, { withMessages: true }) };
  } catch (err) {
    console.error(err);
    return { success: false, status: 500, message: t('ticket.loadError') };
  }
};

export const sendMessage = async (t, lang, ticketId, senderId, body, isAdmin) => {
  try {
    const ticket = await ticketRepo.findTicketById(ticketId);

    if (!ticket) {
      return { success: false, status: 404, message: t('ticket.notFound') };
    }

    if (!isAdmin && ticket.user_id !== senderId) {
      return { success: false, status: 403, message: t('ticket.notAllowed') };
    }

    if (CLOSED_STATUSES.includes(ticket.status)) {
      return { success: false, status: 400, message: t('ticket.isClosed') };
    }

    const senderType = isAdmin ? 'admin' : 'user';
    const message = await ticketRepo.addMessage(ticketId, senderType, senderId, body.trim());

    if (senderType === 'user' && ticket.status !== 'pending') {
      await ticketRepo.setTicketStatus(ticketId, 'pending');
    }

    const serialized = serializeMessage(message);
    emitToTicket(ticketId, 'ticket_message', serialized);

    return { success: true, status: 201, data: serialized };
  } catch (err) {
    console.error(err);
    return { success: false, status: 500, message: t('ticket.sendError') };
  }
};

export const updateTicketStatus = async (t, lang, ticketId, status) => {
  try {
    const ticket = await ticketRepo.findTicketById(ticketId);

    if (!ticket) {
      return { success: false, status: 404, message: t('ticket.notFound') };
    }

    const updated = await ticketRepo.setTicketStatus(ticketId, status);
    const systemMessage = await ticketRepo.addMessage(
      ticketId,
      'system',
      null,
      t(`ticket.system.status.${status}`)
    );

    emitToTicket(ticketId, 'ticket_status_changed', { status: updated.status });
    emitToTicket(ticketId, 'ticket_message', serializeMessage(systemMessage));

    return {
      success: true,
      status: 200,
      message: t('ticket.statusUpdatedMessage'),
      data: serializeTicket(updated)
    };
  } catch (err) {
    console.error(err);
    return { success: false, status: 500, message: t('ticket.statusUpdateError') };
  }
};