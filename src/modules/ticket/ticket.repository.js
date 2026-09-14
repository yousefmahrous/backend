import prisma from '../../core/db.js';

const messageOrder = { orderBy: { created_at: 'asc' } };


export const createTicketWithFirstMessage = async (userId, subject, message, systemOpenedText) => {
  return prisma.$transaction(async (tx) => {
    const ticket = await tx.ticket.create({
      data: { user_id: userId, subject }
    });

    await tx.ticketMessage.create({
      data: {
        ticket_id: ticket.id,
        sender_type: 'user',
        sender_id: userId,
        body: message
      }
    });

    await tx.ticketMessage.create({
      data: {
        ticket_id: ticket.id,
        sender_type: 'system',
        body: systemOpenedText
      }
    });

    return tx.ticket.findUnique({
      where: { id: ticket.id },
      include: { messages: messageOrder }
    });
  });
};

export const findTicketsForUser = async (userId) => {
  return prisma.ticket.findMany({
    where: { user_id: userId },
    orderBy: { updated_at: 'desc' },
    include: {
      messages: { orderBy: { created_at: 'desc' }, take: 1 }
    }
  });
};

export const findAllTickets = async (skip, limit, status) => {
  const where = status ? { status } : {};

  const [tickets, totalCount] = await Promise.all([
    prisma.ticket.findMany({
      where,
      orderBy: { updated_at: 'desc' },
      skip,
      take: limit,
      include: {
        user: { select: { id: true, name: true, email: true } },
        messages: { orderBy: { created_at: 'desc' }, take: 1 }
      }
    }),
    prisma.ticket.count({ where })
  ]);

  return { tickets, totalCount };
};

export const findTicketById = async (id) => {
  return prisma.ticket.findUnique({
    where: { id },
    include: {
      user: { select: { id: true, name: true, email: true } },
      messages: messageOrder
    }
  });
};

export const addMessage = async (ticketId, senderType, senderId, body) => {
  return prisma.ticketMessage.create({
    data: { ticket_id: ticketId, sender_type: senderType, sender_id: senderId ?? null, body }
  });
};

export const setTicketStatus = async (ticketId, status) => {
  return prisma.ticket.update({
    where: { id: ticketId },
    data: {
      status,
      closed_at: status === 'resolved' ? new Date() : null
    }
  });
};
