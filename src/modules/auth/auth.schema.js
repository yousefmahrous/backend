import { z } from 'zod';

export const signupSchema = z.object({
  name: z.string().min(3, "الاسم لازم يكون 3 حروف على الأقل"),
  email: z.string().email("صيغة الإيميل غير صحيحة"),
  password: z.string().min(6, "كلمة المرور لازم تكون 6 حروف على الأقل")
});

export const loginSchema = z.object({
  email: z.string().email("صيغة الإيميل غير صحيحة"),
  password: z.string().min(6, "كلمة المرور لازم تكون 6 حروف على الأقل")
});
