import { z } from 'zod';

export const createContactSchema = (t) =>
  z.object({
    name: z.string().min(3, t('contact.validation.nameMin')),
    email: z.string().email(t('contact.validation.emailInvalid')),
    subject: z.string().min(3, t('contact.validation.subjectMin')),
    message: z.string()
      .min(10, t('contact.validation.messageMin'))
      .max(2000, t('contact.validation.messageMax'))
  });