import { Queue } from 'bullmq';
import queueConnection from './config/queue.config.js';

export const emailQueue = new Queue('email-queue', {
  connection: queueConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000
    },
    removeOnComplete: true,
    removeOnFail: false
  }
});

export const addWelcomeEmailJob = async (email, name) => {
  await emailQueue.add('welcome-email', { email, name });
};

export const addVerificationEmailJob = async (email, name, verifyLink) => {
  await emailQueue.add('verification-email', { email, name, verifyLink });
};

export const addResetPasswordEmailJob = async (email, resetLink) => {
  await emailQueue.add('reset-password-email', { email, resetLink });
};

export const addContactNotificationEmailJob = async ({ name, email, subject, message }) => {
  await emailQueue.add('contact-notification-email', { name, email, subject, message });
};

export const addPaymentSuccessEmailJob = async (email, name, order) => {
  await emailQueue.add('payment-success-email', { email, name, order });
};

export const addPaymentFailedEmailJob = async (email, name, order) => {
  await emailQueue.add('payment-failed-email', { email, name, order });
};

export const addRefundStatusEmailJob = async (email, name, request) => {
  await emailQueue.add('refund-status-email', { email, name, request });
};