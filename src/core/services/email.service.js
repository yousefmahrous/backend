const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);

const sendWelcomeEmail = async (userEmail, userName) => {
  try {
    const cleanEmail = userEmail.trim().toLowerCase();

    const data = await resend.emails.send({
      from: 'منصة أسماء عماد <onboarding@resend.dev>',
      to: cleanEmail, 
      subject: '🎉 أهلاً بك في منصة أسماء عماد للأحياء',
      html: `
        <div style="font-family: Arial, sans-serif; direction: rtl; text-align: right; padding: 20px; border: 1px solid #e0e0e0; border-radius: 10px; max-width: 500px; margin: 0 auto;">
          <h2 style="color: #4CAF50; margin-bottom: 10px;">أهلاً بك يا ${userName} 👋</h2>
          <p style="font-size: 16px; color: #333; line-height: 1.6;">
            تم إنشاء حسابك بنجاح في المنصة ببريدك الإلكتروني: <strong>${cleanEmail}</strong>.
          </p>
          <p style="font-size: 15px; color: #555;">
            يمكنك الآن تسجيل الدخول، متابعة قائمة الأوائل، وحجز مكانك في الدروس بكل سهولة!
          </p>
        </div>
      `
    });


  } catch (error) {
    console.error('[Resend API Error]:', error);
  }
};

module.exports = { sendWelcomeEmail };