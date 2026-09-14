import { z } from 'zod';

export const createTicketSchema = (t) =>
  z.object({
    subject: z.string()
      .min(3, t('ticket.validation.subjectMin'))
      .max(150, t('ticket.validation.subjectMax')),
    message: z.string()
      .min(5, t('ticket.validation.messageMin'))
      .max(2000, t('ticket.validation.messageMax'))
  });

export const createTicketMessageSchema = (t) =>
  z.object({
    body: z.string()
      .min(1, t('ticket.validation.messageMin'))
      .max(2000, t('ticket.validation.messageMax'))
});

export const updateTicketStatusSchema = (t) =>
  z.object({
    status: z.enum(['opened', 'pending', 'under_review', 'resolved'], {
      message: t('ticket.validation.statusInvalid')
    })
});

