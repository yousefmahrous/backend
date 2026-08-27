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

export const sendVerificationEmail = async (userEmail, userName, verifyLink) => {
  try {
    const cleanEmail = userEmail.trim().toLowerCase();

    await resend.emails.send({
      from: 'متجر الكتب <onboarding@resend.dev>',
      to: cleanEmail,
      subject: '📩 تأكيد بريدك الإلكتروني - متجر الكتب',
      html: `
        <div style="font-family: Arial, sans-serif; direction: rtl; text-align: right; padding: 20px; border: 1px solid #e0e0e0; border-radius: 10px; max-width: 500px; margin: 0 auto;">
          <h2 style="color: #4CAF50; margin-bottom: 10px;">أهلاً بك يا ${userName} 👋</h2>
          <p style="font-size: 16px; color: #333; line-height: 1.6;">
            شكرًا لتسجيلك في متجر الكتب. خطوة واحدة بس فاضلة عشان تفعّل حسابك وتبدأ تتصفح الكتب.
          </p>
          <p style="font-size: 15px; color: #555;">
            اضغط على الزرار ده لتأكيد بريدك الإلكتروني (الرابط صالح لمدة 24 ساعة):
          </p>
          <a href="${verifyLink}" style="background-color: #4CAF50; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">تأكيد البريد الإلكتروني</a>
          <p style="font-size: 13px; color: #888; margin-top: 16px;">
            لو مسجلتش في متجر الكتب، ممكن تتجاهل الإيميل ده بأمان.
          </p>
        </div>
      `
    });
  } catch (error) {
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

export const sendContactNotificationEmail = async ({ name, email, subject, message }) => {
  try {
    const adminEmail = process.env.CONTACT_RECEIVER_EMAIL;
    if (!adminEmail) {
      console.error('CONTACT_RECEIVER_EMAIL غير معرّف في متغيرات البيئة');
      return;
    }

    await resend.emails.send({
      from: 'onboarding@resend.dev',
      to: [adminEmail],
      replyTo: email,
      subject: `[تواصل معنا] ${subject}`,
      html: `
        <div style="direction: rtl; text-align: right; font-family: sans-serif;">
          <h2>رسالة جديدة من صفحة تواصل معنا</h2>
          <p><strong>الاسم:</strong> ${name}</p>
          <p><strong>الإيميل:</strong> ${email}</p>
          <p><strong>الموضوع:</strong> ${subject}</p>
          <p><strong>الرسالة:</strong></p>
          <p style="white-space: pre-wrap;">${message}</p>
        </div>
      `
    });
  } catch (error) {
    console.error('فشل إرسال إيميل التواصل:', error);
  }
};

const formatPrice = (amountInPiastres) => (amountInPiastres / 100).toFixed(2);

const renderOrderItemsRows = (items = []) =>
  items
    .map(
      (item) => `
        <tr>
          <td style="padding: 8px 0; border-bottom: 1px solid #eee;">${item.title ?? item.book?.title ?? ''}</td>
          <td style="padding: 8px 0; border-bottom: 1px solid #eee; text-align: center;">${item.quantity}</td>
          <td style="padding: 8px 0; border-bottom: 1px solid #eee; text-align: left;" dir="ltr">${formatPrice(item.unit_price * item.quantity)} ج.م</td>
        </tr>`
    )
    .join('');

const orderEmailWrapper = ({ title, titleColor, intro, order, footer }) => `
  <div style="font-family: Arial, sans-serif; direction: rtl; text-align: right; padding: 20px; border: 1px solid #e0e0e0; border-radius: 10px; max-width: 560px; margin: 0 auto;">
    <h2 style="color: ${titleColor}; margin-bottom: 10px;">${title}</h2>
    <p style="font-size: 15px; color: #333; line-height: 1.6;">${intro}</p>
    <p style="font-size: 14px; color: #555;">رقم الأوردر: <strong>#${order.id}</strong></p>
    <table style="width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 14px;">
      <thead>
        <tr>
          <th style="text-align: right; padding: 8px 0; border-bottom: 2px solid #ddd;">الكتاب</th>
          <th style="text-align: center; padding: 8px 0; border-bottom: 2px solid #ddd;">الكمية</th>
          <th style="text-align: left; padding: 8px 0; border-bottom: 2px solid #ddd;">السعر</th>
        </tr>
      </thead>
      <tbody>${renderOrderItemsRows(order.items)}</tbody>
    </table>
    <p style="font-size: 15px; color: #333;"><strong>الإجمالي:</strong> <span dir="ltr">${formatPrice(order.total_amount)} ج.م</span></p>
    ${footer ?? ''}
  </div>
`;

export const sendPaymentSuccessEmail = async (userEmail, userName, order) => {
  try {
    await resend.emails.send({
      from: 'متجر الكتب <onboarding@resend.dev>',
      to: userEmail.trim().toLowerCase(),
      subject: `✅ تم تأكيد الدفع - أوردر #${order.id}`,
      html: orderEmailWrapper({
        title: `تم الدفع بنجاح يا ${userName} 🎉`,
        titleColor: '#4CAF50',
        intro: 'استلمنا الدفع بتاعك وأوردرك بقى في مرحلة التجهيز.',
        order
      })
    });
  } catch (error) {
    console.error('[Resend API Error] فشل إرسال إيميل تأكيد الدفع:', error);
  }
};

export const sendPaymentFailedEmail = async (userEmail, userName, order) => {
  try {
    await resend.emails.send({
      from: 'متجر الكتب <onboarding@resend.dev>',
      to: userEmail.trim().toLowerCase(),
      subject: `❌ فشلت عملية الدفع - أوردر #${order.id}`,
      html: orderEmailWrapper({
        title: `للأسف الدفع مانجحش يا ${userName}`,
        titleColor: '#e53935',
        intro: 'حصلت مشكلة أثناء إتمام عملية الدفع وأوردرك اتلغى. تقدر تجرب تاني في أي وقت.',
        order,
        footer: `<p style="font-size: 13px; color: #888; margin-top: 12px;">لو الفلوس اتخصمت من حسابك، مش هتتحصّل وهترجعلك تلقائيًا خلال أيام قليلة حسب البنك بتاعك.</p>`
      })
    });
  } catch (error) {
    console.error('[Resend API Error] فشل إرسال إيميل فشل الدفع:', error);
  }
};

const REFUND_STATUS_CONTENT = {
  awaiting_return: {
    subject: 'تمت الموافقة على طلب الاسترجاع',
    title: 'تمت الموافقة على طلبك ✅',
    titleColor: '#2196F3',
    intro: 'وافقنا على طلب استرجاع الأوردر بتاعك. من فضلك ابعت الكتاب زي ما هو متفق عليه، وهنبدأ في رد الفلوس بمجرد استلامه.'
  },
  rejected: {
    subject: 'تم رفض طلب الاسترجاع',
    title: 'للأسف طلب الاسترجاع اترفض',
    titleColor: '#e53935',
    intro: 'راجعنا طلب الاسترجاع بتاعك ومعلش، اترفض. الأوردر رجع لحالته الطبيعية.'
  },
  cancelled: {
    subject: 'تم إلغاء طلب الاسترجاع',
    title: 'طلب الاسترجاع اتلغى',
    titleColor: '#e53935',
    intro: 'طلب الاسترجاع بتاعك اتلغى. الأوردر رجع لحالته الطبيعية.'
  },
  completed: {
    subject: 'تم تنفيذ الاسترجاع بنجاح',
    title: 'استرجاع الفلوس تم بنجاح 💰',
    titleColor: '#4CAF50',
    intro: 'استلمنا الكتاب وتم تنفيذ عملية استرجاع الفلوس. المبلغ هيرجع لحسابك خلال أيام قليلة حسب بنكك.'
  }
};

export const sendRefundStatusEmail = async (userEmail, userName, request) => {
  const content = REFUND_STATUS_CONTENT[request.status];
  if (!content) return;

  try {
    await resend.emails.send({
      from: 'متجر الكتب <onboarding@resend.dev>',
      to: userEmail.trim().toLowerCase(),
      subject: `${content.subject} - أوردر #${request.order_id}`,
      html: orderEmailWrapper({
        title: `${content.title} يا ${userName}`,
        titleColor: content.titleColor,
        intro: content.intro,
        order: request.order,
        footer: request.admin_note
          ? `<p style="font-size: 14px; color: #555; margin-top: 12px;"><strong>ملاحظة من الإدارة:</strong> ${request.admin_note}</p>`
          : ''
      })
    });
  } catch (error) {
    console.error('[Resend API Error] فشل إرسال إيميل حالة الاسترجاع:', error);
  }
};