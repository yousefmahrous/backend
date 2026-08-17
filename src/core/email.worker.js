import { Worker } from 'bullmq';
import queueConnection from './config/queue.config.js';
import { sendWelcomeEmail, sendResetPasswordEmail, sendContactNotificationEmail } from './services/email.service.js';

const emailWorker = new Worker('email-queue', async (job) => {
  if (job.name === 'welcome-email') {
    const { email, name } = job.data;
    await sendWelcomeEmail(email, name);
  }
  else if (job.name === 'reset-password-email') {
    const { email, resetLink } = job.data;
    await sendResetPasswordEmail(email, resetLink);
  }
  else if (job.name === 'contact-notification-email') {
    await sendContactNotificationEmail(job.data);
  }

}, {
  connection: queueConnection
});

export default emailWorker;
