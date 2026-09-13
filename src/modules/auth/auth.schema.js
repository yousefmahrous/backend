import { z } from 'zod';

export const createSignupSchema = (t) =>
  z.object({
    name: z.string().min(3, t('auth.validation.nameMin')),
    email: z.string().email(t('auth.validation.emailInvalid')),
    password: z.string().min(6, t('auth.validation.passwordMin'))
  });

export const createLoginSchema = (t) =>
  z.object({
    email: z.string().email(t('auth.validation.emailInvalid')),
    password: z.string().min(6, t('auth.validation.passwordMin'))
  });