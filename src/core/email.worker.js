// src/core/jobs/email.worker.js
const { Worker } = require('bullmq');
const queueConnection = require('../core/config/queue.config');
const { sendWelcomeEmail, sendResetPasswordEmail } = require('../core/services/email.service'); 

const emailWorker = new Worker('email-queue', async (job) => {
  if (job.name === 'welcome-email') {
    const { email, name } = job.data;
    await sendWelcomeEmail(email, name);
  } 
  else if (job.name === 'reset-password-email') {
    const { email, resetLink } = job.data;
    await sendResetPasswordEmail(email, resetLink);
  }

}, {
  connection: queueConnection
});

module.exports = emailWorker;