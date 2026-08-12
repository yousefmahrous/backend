import { z } from 'zod';

export const bookSchema = z.object({
  name: z.string()
    .trim()
    .min(3, "عنوان الكتاب لازم يكون 3 حروف على الأقل"),

  number: z.string()
    .trim()
    .regex(/^(?:\d[- ]?){9,17}\d$/, "يرجى كتابة رقم ISBN صحيح"),

  email: z.string()
    .trim()
    .email("صيغة البريد الإلكتروني غير صحيحة"),

  adress: z.string()
    .trim()
    .min(5, "يرجى كتابة وصف الكتاب بالتفصيل"),

  centre: z.string()
    .trim()
    .min(2, "يرجى كتابة اسم دار النشر بشكل صحيح"),

  grade: z.enum(["روايات", "علمي", "تاريخي", "أطفال"], {
    errorMap: () => ({ message: "يرجى اختيار تصنيف الكتاب من القائمة" })
  }),

  avatar_key: z.string().trim().nullable().optional()
});

export const editBookSchema = z.object({
  name: z.string().trim().min(3, "عنوان الكتاب لازم يكون 3 حروف على الأقل"),
  email: z.string().trim().email("صيغة البريد الإلكتروني غير صحيحة"),
});
