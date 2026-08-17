import express from 'express';
import * as contactService from '../../modules/contact/contact.service.js';
import { contactSchema } from '../../modules/contact/contact.schema.js';
import { contactLimiter } from '../../core/middlewares/rateLimiter.middleware.js';

const router = express.Router();

router.post('/', contactLimiter, async (req, res) => {
  try {
    const validatedData = contactSchema.parse(req.body);
    const { status, ...response } = await contactService.submitContactMessage(validatedData);
    res.status(status).json(response);
  } catch (error) {
    if (error.name === 'ZodError') {
      return res.status(400).json({ success: false, errors: error.errors });
    }
    res.status(400).json({ success: false, message: error.message });
  }
});

export default router;