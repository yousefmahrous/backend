import express from 'express';
import * as ticketService from '../../modules/ticket/ticket.service.js';
import {
  createTicketSchema,
  createTicketMessageSchema,
  updateTicketStatusSchema
} from '../../modules/ticket/ticket.schema.js';
import authMiddleware from '../../core/middlewares/auth.middleware.js';
import requireAdmin from '../../core/middlewares/admin.middleware.js';
import { doubleCsrfProtection } from '../../core/config/csrf.config.js';

const router = express.Router();

router.use(authMiddleware);

router.post('/', doubleCsrfProtection, async (req, res) => {
  const result = createTicketSchema(req.t).safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({ success: false, errors: result.error.flatten().fieldErrors });
  }

  const { subject, message } = result.data;
  const { status, ...response } = await ticketService.createTicket(req.t, req.lang, req.user.id, subject, message);
  res.status(status).json(response);
});

router.get('/mine', async (req, res) => {
  const { status, ...response } = await ticketService.getMyTickets(req.t, req.lang, req.user.id);
  res.status(status).json(response);
});

router.get('/admin/all', requireAdmin, async (req, res) => {
  const { page, limit, status: ticketStatus } = req.query;
  const { status, ...response } = await ticketService.getAllTicketsAdmin(
    req.t,
    req.lang,
    page,
    limit,
    ticketStatus
  );
  res.status(status).json(response);
});

router.get('/:id', async (req, res) => {
  const ticketId = parseInt(req.params.id);
  if (Number.isNaN(ticketId)) {
    return res.status(400).json({ success: false, message: req.t('ticket.invalidId') });
  }

  const isAdmin = req.user.role === 'admin';
  const { status, ...response } = await ticketService.getTicketDetail(req.t, req.lang, ticketId, req.user.id, isAdmin);
  res.status(status).json(response);
});

router.post('/:id/messages', doubleCsrfProtection, async (req, res) => {
  const ticketId = parseInt(req.params.id);
  if (Number.isNaN(ticketId)) {
    return res.status(400).json({ success: false, message: req.t('ticket.invalidId') });
  }

  const result = createTicketMessageSchema(req.t).safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({ success: false, errors: result.error.flatten().fieldErrors });
  }

  const isAdmin = req.user.role === 'admin';
  const { status, ...response } = await ticketService.sendMessage(
    req.t,
    req.lang,
    ticketId,
    req.user.id,
    result.data.body,
    isAdmin
  );
  res.status(status).json(response);
});

router.patch('/admin/:id/status', requireAdmin, doubleCsrfProtection, async (req, res) => {
  const ticketId = parseInt(req.params.id);
  if (Number.isNaN(ticketId)) {
    return res.status(400).json({ success: false, message: req.t('ticket.invalidId') });
  }

  const result = updateTicketStatusSchema(req.t).safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({ success: false, errors: result.error.flatten().fieldErrors });
  }

  const { status, ...response } = await ticketService.updateTicketStatus(req.t, req.lang, ticketId, result.data.status);
  res.status(status).json(response);
});

export default router;