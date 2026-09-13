import * as contactRepo from './contact.repository.js';
import { addContactNotificationEmailJob } from '../../core/email.queue.js';

export const submitContactMessage = async (t, { name, email, subject, message }) => {
  try {
    await contactRepo.createContactMessage({ name, email, subject, message });

    try {
      await addContactNotificationEmailJob({ name, email, subject, message });
    } catch (queueErr) {
      console.error('فشل إضافة مهمة إيميل التواصل للطابور:', queueErr);
    }

    return {
      success: true,
      status: 201,
      message: t('contact.sendSuccess')
    };
  } catch (err) {
    console.error(err);
    return { success: false, status: 500, message: t('contact.sendError') };
  }
};