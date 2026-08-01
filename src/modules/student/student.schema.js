const {z} = require('zod')

const bookingSchema = z.object({
  name: z.string()
    .trim()
    .min(3, "الاسم لازم يكون 3 حروف على الأقل"),

  number: z.string()
    .trim()
    .regex(/^01[0125]\d{8}$/, "يرجى كتابة رقم تليفون مصري صحيح (مثال: 01012345678)"), 

  email: z.string()
    .trim()
    .email("صيغة البريد الإلكتروني غير صحيحة"),

  adress: z.string()
    .trim()
    .min(5, "يرجى كتابة العنوان بالتفصيل"),

  centre: z.string()
    .trim()
    .min(2, "يرجى كتابة اسم السنتر بشكل صحيح"),

  grade: z.enum(["الأول الثانوي", "الثاني الثانوي", "الثالث الثانوي"], {
    errorMap: () => ({ message: "يرجى اختيار الصف الدراسي من القائمة" })
  })
});


const editBookingSchema = z.object({
  name: z.string().trim().min(3, "الاسم لازم يكون 3 حروف على الأقل"),
  email: z.string().trim().email("صيغة البريد الإلكتروني غير صحيحة"),
});

module.exports = { bookingSchema, editBookingSchema };