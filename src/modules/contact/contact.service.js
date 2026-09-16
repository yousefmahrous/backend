import * as contactRepo from './contact.repository.js';
import { addContactNotificationEmailJob } from '../../core/email.queue.js';
import logger from '../../core/logger.js';

export const submitContactMessage = async (t, { name, email, subject, message }) => {
  try {
    await contactRepo.createContactMessage({ name, email, subject, message });

    try {
      await addContactNotificationEmailJob({ name, email, subject, message });
    } catch (queueErr) {
      logger.error({ err: queueErr }, 'فشل إضافة مهمة إيميل التواصل للطابور');
    }

    return {
      success: true,
      status: 201,
      message: t('contact.sendSuccess')
    };
  } catch (err) {
    logger.error({ err: err }, 'Unhandled error');
    return { success: false, status: 500, message: t('contact.sendError') };
  }
};