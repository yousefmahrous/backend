import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export const sendWelcomeEmail = async (userEmail, userName) => {
  try {
    const cleanEmail = userEmail.trim().toLowerCase();

    await resend.emails.send({
      from: 'متجر الكتب <onboarding@resend.dev>',
      to: cleanEmail,
      subject: '🎉 أهلاً بك في متجر الكتب',
      html: `
        <div style="font-family: Arial, sans-serif; direction: rtl; text-align: right; padding: 20px; border: 1px solid #e0e0e0; border-radius: 10px; max-width: 500px; margin: 0 auto;">
          <h2 style="color: #4CAF50; margin-bottom: 10px;">أهلاً بك يا ${userName} 👋</h2>
          <p style="font-size: 16px; color: #333; line-height: 1.6;">
            تم إنشاء حسابك بنجاح في متجر الكتب ببريدك الإلكتروني: <strong>${cleanEmail}</strong>.
          </p>
          <p style="font-size: 15px; color: #555;">
            يمكنك الآن تسجيل الدخول وتصفح الكتب والاستفادة من كل عروضنا بكل سهولة!
          </p>
        </div>
      `
    });

  } catch (error) {
    console.error('[Resend API Error]:', error);
  }
};

export const sendResetPasswordEmail = async (email, resetLink) => {
  try {
    await resend.emails.send({
      from: 'onboarding@resend.dev',
      to: [email],
      subject: 'إعادة تعيين كلمة المرور',
      html: `
        <div style="direction: rtl; text-align: right; font-family: sans-serif;">
          <h2>طلب إعادة تعيين كلمة المرور</h2>
          <p>وصلنا طلب لإعادة تعيين كلمة المرور الخاصة بحسابك.</p>
          <p>اضغط على الرابط التالي لإعادة التعيين (الرابط صالحة لمدة ساعة واحدة فقط):</p>
          <a href="${resetLink}" style="background-color: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">إعادة تعيين كلمة المرور</a>
          <p>إذا لم تطلب هذا التغيير، يمكنك تجاهل هذا الإيميل بآمان.</p>
        </div>
      `
    });
  } catch (error) {
    console.error('فشل إرسال إيميل إعادة التعيين:', error);
  }
};
