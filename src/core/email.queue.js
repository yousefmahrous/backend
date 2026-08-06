const { Queue } = require('bullmq');
const queueConnection = require('../core/config/queue.config');

const emailQueue = new Queue('email-queue', {
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

const addWelcomeEmailJob = async (email, name) => {
  await emailQueue.add('welcome-email', { email, name });
};

const addResetPasswordEmailJob = async (email, resetLink) => {
  await emailQueue.add('reset-password-email', { email, resetLink });
};

module.exports = {
  emailQueue,
  addWelcomeEmailJob,
  addResetPasswordEmailJob
};