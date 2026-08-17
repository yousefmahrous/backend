import { z } from 'zod';

export const contactSchema = z.object({
  name: z.string().min(3, 'الاسم لازم يكون 3 حروف على الأقل'),
  email: z.string().email('صيغة الإيميل غير صحيحة'),
  subject: z.string().min(3, 'الموضوع لازم يكون 3 حروف على الأقل'),
  message: z.string().min(10, 'الرسالة لازم تكون 10 حروف على الأقل').max(2000, 'الرسالة طويلة جدًا')
});