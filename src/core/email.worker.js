import { Worker } from 'bullmq';
import queueConnection from './config/queue.config.js';
import {
  sendWelcomeEmail,
  sendVerificationEmail,
  sendResetPasswordEmail,
  sendContactNotificationEmail,
  sendPaymentSuccessEmail,
  sendPaymentFailedEmail,
  sendRefundStatusEmail
} from './services/email.service.js';

const emailWorker = new Worker('email-queue', async (job) => {
  if (job.name === 'welcome-email') {
    const { email, name } = job.data;
    await sendWelcomeEmail(email, name);
  }
  else if (job.name === 'verification-email') {
    const { email, name, verifyLink } = job.data;
    await sendVerificationEmail(email, name, verifyLink);
  }
  else if (job.name === 'reset-password-email') {
    const { email, resetLink } = job.data;
    await sendResetPasswordEmail(email, resetLink);
  }
  else if (job.name === 'contact-notification-email') {
    await sendContactNotificationEmail(job.data);
  }
  else if (job.name === 'payment-success-email') {
    const { email, name, order } = job.data;
    await sendPaymentSuccessEmail(email, name, order);
  }
  else if (job.name === 'payment-failed-email') {
    const { email, name, order } = job.data;
    await sendPaymentFailedEmail(email, name, order);
  }
  else if (job.name === 'refund-status-email') {
    const { email, name, request } = job.data;
    await sendRefundStatusEmail(email, name, request);
  }

}, {
  connection: queueConnection
});

export default emailWorker;