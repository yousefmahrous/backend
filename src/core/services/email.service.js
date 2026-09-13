import { Resend } from 'resend';
import { pickLocalized } from '../i18n/localized.js';
import { DEFAULT_LANG, isSupportedLang } from '../i18n/i18n.js';

const resend = new Resend(process.env.RESEND_API_KEY);

const resolveLang = (lang) => (isSupportedLang(lang) ? lang : DEFAULT_LANG);

const DIR = {
  ar: { dir: 'rtl', align: 'right' },
  en: { dir: 'ltr', align: 'left' }
};

const STORE_NAME = { ar: 'متجر الكتب', en: 'Book Store' };

const WELCOME_CONTENT = {
  ar: {
    subject: '🎉 أهلاً بك في متجر الكتب',
    heading: (name) => `أهلاً بك يا ${name} 👋`,
    body: (email) => `تم إنشاء حسابك بنجاح في متجر الكتب ببريدك الإلكتروني: <strong>${email}</strong>.`,
    sub: 'يمكنك الآن تسجيل الدخول وتصفح الكتب والاستفادة من كل عروضنا بكل سهولة!'
  },
  en: {
    subject: '🎉 Welcome to the Book Store',
    heading: (name) => `Welcome, ${name} 👋`,
    body: (email) => `Your account has been created successfully with the email: <strong>${email}</strong>.`,
    sub: 'You can now log in, browse our books, and enjoy all our offers with ease!'
  }
};

export const sendWelcomeEmail = async (userEmail, userName, lang) => {
  const safeLang = resolveLang(lang);
  const c = WELCOME_CONTENT[safeLang];
  const { dir, align } = DIR[safeLang];

  try {
    const cleanEmail = userEmail.trim().toLowerCase();

    await resend.emails.send({
      from: `${STORE_NAME[safeLang]} <onboarding@resend.dev>`,
      to: cleanEmail,
      subject: c.subject,
      html: `
        <div style="font-family: Arial, sans-serif; direction: ${dir}; text-align: ${align}; padding: 20px; border: 1px solid #e0e0e0; border-radius: 10px; max-width: 500px; margin: 0 auto;">
          <h2 style="color: #4CAF50; margin-bottom: 10px;">${c.heading(userName)}</h2>
          <p style="font-size: 16px; color: #333; line-height: 1.6;">${c.body(cleanEmail)}</p>
          <p style="font-size: 15px; color: #555;">${c.sub}</p>
        </div>
      `
    });

  } catch (error) {
    console.error('[Resend API Error]:', error);
  }
};

const VERIFICATION_CONTENT = {
  ar: {
    subject: '📩 تأكيد بريدك الإلكتروني - متجر الكتب',
    heading: (name) => `أهلاً بك يا ${name} 👋`,
    body: 'شكرًا لتسجيلك في متجر الكتب. خطوة واحدة بس فاضلة عشان تفعّل حسابك وتبدأ تتصفح الكتب.',
    cta: 'اضغط على الزرار ده لتأكيد بريدك الإلكتروني (الرابط صالح لمدة 24 ساعة):',
    button: 'تأكيد البريد الإلكتروني',
    footer: 'لو مسجلتش في متجر الكتب، ممكن تتجاهل الإيميل ده بأمان.'
  },
  en: {
    subject: '📩 Confirm your email - Book Store',
    heading: (name) => `Welcome, ${name} 👋`,
    body: 'Thanks for signing up with the Book Store. Just one more step to activate your account and start browsing.',
    cta: 'Click the button below to confirm your email (valid for 24 hours):',
    button: 'Confirm Email',
    footer: "If you didn't sign up for the Book Store, you can safely ignore this email."
  }
};

export const sendVerificationEmail = async (userEmail, userName, verifyLink, lang) => {
  const safeLang = resolveLang(lang);
  const c = VERIFICATION_CONTENT[safeLang];
  const { dir, align } = DIR[safeLang];

  try {
    const cleanEmail = userEmail.trim().toLowerCase();

    await resend.emails.send({
      from: `${STORE_NAME[safeLang]} <onboarding@resend.dev>`,
      to: cleanEmail,
      subject: c.subject,
      html: `
        <div style="font-family: Arial, sans-serif; direction: ${dir}; text-align: ${align}; padding: 20px; border: 1px solid #e0e0e0; border-radius: 10px; max-width: 500px; margin: 0 auto;">
          <h2 style="color: #4CAF50; margin-bottom: 10px;">${c.heading(userName)}</h2>
          <p style="font-size: 16px; color: #333; line-height: 1.6;">${c.body}</p>
          <p style="font-size: 15px; color: #555;">${c.cta}</p>
          <a href="${verifyLink}" style="background-color: #4CAF50; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">${c.button}</a>
          <p style="font-size: 13px; color: #888; margin-top: 16px;">${c.footer}</p>
        </div>
      `
    });
  } catch (error) {
    console.error('[Resend API Error]:', error);
  }
};

const RESET_PASSWORD_CONTENT = {
  ar: {
    subject: 'إعادة تعيين كلمة المرور',
    heading: 'طلب إعادة تعيين كلمة المرور',
    body: 'وصلنا طلب لإعادة تعيين كلمة المرور الخاصة بحسابك.',
    cta: 'اضغط على الرابط التالي لإعادة التعيين (الرابط صالحة لمدة ساعة واحدة فقط):',
    button: 'إعادة تعيين كلمة المرور',
    footer: 'إذا لم تطلب هذا التغيير، يمكنك تجاهل هذا الإيميل بآمان.'
  },
  en: {
    subject: 'Reset your password',
    heading: 'Password reset request',
    body: 'We received a request to reset the password for your account.',
    cta: 'Click the link below to reset it (valid for one hour only):',
    button: 'Reset Password',
    footer: "If you didn't request this change, you can safely ignore this email."
  }
};

export const sendResetPasswordEmail = async (email, resetLink, lang) => {
  const safeLang = resolveLang(lang);
  const c = RESET_PASSWORD_CONTENT[safeLang];
  const { dir, align } = DIR[safeLang];

  try {
    await resend.emails.send({
      from: 'onboarding@resend.dev',
      to: [email],
      subject: c.subject,
      html: `
        <div style="direction: ${dir}; text-align: ${align}; font-family: sans-serif;">
          <h2>${c.heading}</h2>
          <p>${c.body}</p>
          <p>${c.cta}</p>
          <a href="${resetLink}" style="background-color: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">${c.button}</a>
          <p>${c.footer}</p>
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

const formatPrice = (amountInPiastres, lang) => {
  const amount = (amountInPiastres / 100).toFixed(2);
  return lang === 'en' ? `EGP ${amount}` : `${amount} ج.م`;
};

const TABLE_LABELS = {
  ar: { book: 'الكتاب', qty: 'الكمية', price: 'السعر', total: 'الإجمالي', orderNo: 'رقم الأوردر' },
  en: { book: 'Book', qty: 'Qty', price: 'Price', total: 'Total', orderNo: 'Order #' }
};

const renderOrderItemsRows = (items = [], lang) =>
  items
    .map(
      (item) => `
        <tr>
          <td style="padding: 8px 0; border-bottom: 1px solid #eee;">${pickLocalized(item.title ?? item.book?.title, lang)}</td>
          <td style="padding: 8px 0; border-bottom: 1px solid #eee; text-align: center;">${item.quantity}</td>
          <td style="padding: 8px 0; border-bottom: 1px solid #eee; text-align: ${lang === 'en' ? 'right' : 'left'};" dir="ltr">${formatPrice(item.unit_price * item.quantity, lang)}</td>
        </tr>`
    )
    .join('');

const orderEmailWrapper = ({ lang, title, titleColor, intro, order, footer }) => {
  const { dir, align } = DIR[lang];
  const t = TABLE_LABELS[lang];

  return `
  <div style="font-family: Arial, sans-serif; direction: ${dir}; text-align: ${align}; padding: 20px; border: 1px solid #e0e0e0; border-radius: 10px; max-width: 560px; margin: 0 auto;">
    <h2 style="color: ${titleColor}; margin-bottom: 10px;">${title}</h2>
    <p style="font-size: 15px; color: #333; line-height: 1.6;">${intro}</p>
    <p style="font-size: 14px; color: #555;">${t.orderNo}: <strong>#${order.id}</strong></p>
    <table style="width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 14px;">
      <thead>
        <tr>
          <th style="text-align: ${align}; padding: 8px 0; border-bottom: 2px solid #ddd;">${t.book}</th>
          <th style="text-align: center; padding: 8px 0; border-bottom: 2px solid #ddd;">${t.qty}</th>
          <th style="text-align: ${lang === 'en' ? 'right' : 'left'}; padding: 8px 0; border-bottom: 2px solid #ddd;">${t.price}</th>
        </tr>
      </thead>
      <tbody>${renderOrderItemsRows(order.items, lang)}</tbody>
    </table>
    <p style="font-size: 15px; color: #333;"><strong>${t.total}:</strong> <span dir="ltr">${formatPrice(order.total_amount, lang)}</span></p>
    ${footer ?? ''}
  </div>
`;
};

const PAYMENT_SUCCESS_CONTENT = {
  ar: {
    subjectPrefix: '✅ تم تأكيد الدفع',
    title: (name) => `تم الدفع بنجاح يا ${name} 🎉`,
    intro: 'استلمنا الدفع بتاعك وأوردرك بقى في مرحلة التجهيز.'
  },
  en: {
    subjectPrefix: '✅ Payment confirmed',
    title: (name) => `Payment successful, ${name} 🎉`,
    intro: 'We received your payment and your order is now being prepared.'
  }
};

export const sendPaymentSuccessEmail = async (userEmail, userName, order, lang) => {
  const safeLang = resolveLang(lang);
  const c = PAYMENT_SUCCESS_CONTENT[safeLang];

  try {
    await resend.emails.send({
      from: `${STORE_NAME[safeLang]} <onboarding@resend.dev>`,
      to: userEmail.trim().toLowerCase(),
      subject: `${c.subjectPrefix} - #${order.id}`,
      html: orderEmailWrapper({
        lang: safeLang,
        title: c.title(userName),
        titleColor: '#4CAF50',
        intro: c.intro,
        order
      })
    });
  } catch (error) {
    console.error('[Resend API Error] فشل إرسال إيميل تأكيد الدفع:', error);
  }
};

const PAYMENT_FAILED_CONTENT = {
  ar: {
    subjectPrefix: '❌ فشلت عملية الدفع',
    title: (name) => `للأسف الدفع مانجحش يا ${name}`,
    intro: 'حصلت مشكلة أثناء إتمام عملية الدفع وأوردرك اتلغى. تقدر تجرب تاني في أي وقت.',
    footer: 'لو الفلوس اتخصمت من حسابك، مش هتتحصّل وهترجعلك تلقائيًا خلال أيام قليلة حسب البنك بتاعك.'
  },
  en: {
    subjectPrefix: '❌ Payment failed',
    title: (name) => `Unfortunately, the payment failed, ${name}`,
    intro: 'A problem occurred while completing the payment and your order was cancelled. You can try again anytime.',
    footer: 'If any amount was deducted from your account, it will not be charged and will be automatically refunded within a few days depending on your bank.'
  }
};

export const sendPaymentFailedEmail = async (userEmail, userName, order, lang) => {
  const safeLang = resolveLang(lang);
  const c = PAYMENT_FAILED_CONTENT[safeLang];

  try {
    await resend.emails.send({
      from: `${STORE_NAME[safeLang]} <onboarding@resend.dev>`,
      to: userEmail.trim().toLowerCase(),
      subject: `${c.subjectPrefix} - #${order.id}`,
      html: orderEmailWrapper({
        lang: safeLang,
        title: c.title(userName),
        titleColor: '#e53935',
        intro: c.intro,
        order,
        footer: `<p style="font-size: 13px; color: #888; margin-top: 12px;">${c.footer}</p>`
      })
    });
  } catch (error) {
    console.error('[Resend API Error] فشل إرسال إيميل فشل الدفع:', error);
  }
};

const REFUND_STATUS_CONTENT = {
  awaiting_return: {
    ar: {
      subject: 'تمت الموافقة على طلب الاسترجاع',
      title: (name) => `تمت الموافقة على طلبك يا ${name} ✅`,
      titleColor: '#2196F3',
      intro: 'وافقنا على طلب استرجاع الأوردر بتاعك. من فضلك ابعت الكتاب زي ما هو متفق عليه، وهنبدأ في رد الفلوس بمجرد استلامه.'
    },
    en: {
      subject: 'Your refund request has been approved',
      title: (name) => `Your request has been approved, ${name} ✅`,
      titleColor: '#2196F3',
      intro: 'We approved your order refund request. Please send back the book as agreed, and we will start the refund once we receive it.'
    }
  },
  rejected: {
    ar: {
      subject: 'تم رفض طلب الاسترجاع',
      title: (name) => `للأسف طلب الاسترجاع اترفض يا ${name}`,
      titleColor: '#e53935',
      intro: 'راجعنا طلب الاسترجاع بتاعك ومعلش، اترفض. الأوردر رجع لحالته الطبيعية.'
    },
    en: {
      subject: 'Your refund request was rejected',
      title: (name) => `Unfortunately, your refund request was rejected, ${name}`,
      titleColor: '#e53935',
      intro: 'We reviewed your refund request and unfortunately it was rejected. The order has returned to its normal status.'
    }
  },
  cancelled: {
    ar: {
      subject: 'تم إلغاء طلب الاسترجاع',
      title: (name) => `طلب الاسترجاع اتلغى يا ${name}`,
      titleColor: '#e53935',
      intro: 'طلب الاسترجاع بتاعك اتلغى. الأوردر رجع لحالته الطبيعية.'
    },
    en: {
      subject: 'Your refund request was cancelled',
      title: (name) => `Your refund request has been cancelled, ${name}`,
      titleColor: '#e53935',
      intro: 'Your refund request has been cancelled. The order has returned to its normal status.'
    }
  },
  completed: {
    ar: {
      subject: 'تم تنفيذ الاسترجاع بنجاح',
      title: (name) => `استرجاع الفلوس تم بنجاح يا ${name} 💰`,
      titleColor: '#4CAF50',
      intro: 'استلمنا الكتاب وتم تنفيذ عملية استرجاع الفلوس. المبلغ هيرجع لحسابك خلال أيام قليلة حسب بنكك.'
    },
    en: {
      subject: 'Your refund has been completed',
      title: (name) => `Refund completed successfully, ${name} 💰`,
      titleColor: '#4CAF50',
      intro: 'We received the book and processed your refund. The amount will be returned to your account within a few days depending on your bank.'
    }
  }
};

const REFUND_NOTE_LABEL = { ar: 'ملاحظة من الإدارة', en: 'Note from the team' };

export const sendRefundStatusEmail = async (userEmail, userName, request, lang) => {
  const safeLang = resolveLang(lang);
  const statusContent = REFUND_STATUS_CONTENT[request.status];
  if (!statusContent) return;

  const c = statusContent[safeLang];

  try {
    await resend.emails.send({
      from: `${STORE_NAME[safeLang]} <onboarding@resend.dev>`,
      to: userEmail.trim().toLowerCase(),
      subject: `${c.subject} - #${request.order_id}`,
      html: orderEmailWrapper({
        lang: safeLang,
        title: c.title(userName),
        titleColor: c.titleColor,
        intro: c.intro,
        order: request.order,
        footer: request.admin_note
          ? `<p style="font-size: 14px; color: #555; margin-top: 12px;"><strong>${REFUND_NOTE_LABEL[safeLang]}:</strong> ${request.admin_note}</p>`
          : ''
      })
    });
  } catch (error) {
    console.error('[Resend API Error] فشل إرسال إيميل حالة الاسترجاع:', error);
  }
};