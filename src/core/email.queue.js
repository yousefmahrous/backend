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

export const addResetPasswordEmailJob = async (email, resetLink) => {
  await emailQueue.add('reset-password-email', { email, resetLink });
};
