import { getIO } from '../../core/config/socket.config.js';
import sessionMiddleware from '../../core/config/session.config.js';
import prisma from '../../core/db.js';

const wrapMiddlewareForSocket = (socket, next) => {
  sessionMiddleware(socket.request, {}, next);
};

export const registerTicketSocketHandlers = () => {
  const io = getIO();
  
  io.use(wrapMiddlewareForSocket);

  io.on('connection', (socket) => {
    socket.on('join_ticket', async (ticketId, callback) => {
      const ack = typeof callback === 'function' ? callback : () => {};
      const sessionUser = socket.request.session?.user;

      if (!sessionUser) {
        return ack({ success: false, message: 'unauthorized' });
      }

      const id = parseInt(ticketId);
      if (Number.isNaN(id)) {
        return ack({ success: false, message: 'invalid_ticket_id' });
      }

      const ticket = await prisma.ticket.findUnique({ where: { id } });
      if (!ticket) {
        return ack({ success: false, message: 'not_found' });
      }

      const isAdmin = sessionUser.role === 'admin';
      if (!isAdmin && ticket.user_id !== sessionUser.id) {
        return ack({ success: false, message: 'forbidden' });
      }

      socket.join(`ticket:${id}`);
      ack({ success: true });
    });

    socket.on('leave_ticket', (ticketId) => {
      const id = parseInt(ticketId);
      if (!Number.isNaN(id)) {
        socket.leave(`ticket:${id}`);
      }
    });
  });
};