import { bookSchema, editBookSchema } from '../../modules/book/book.schema.js';

export const validateAdd = (req, res, next) => {
  const result = bookSchema.safeParse(req.body);
  if (!result.success) {
    const fieldErrors = result.error.flatten().fieldErrors;
    return res.status(400).json({ success: false, errors: fieldErrors });
  }
  req.body = result.data;
  next();
};

export const validateEdit = (req, res, next) => {
  const result = editBookSchema.safeParse(req.body);
  if (!result.success) {
    const fieldErrors = result.error.flatten().fieldErrors;
    const errorMessage = Object.values(fieldErrors).flat().join(" - ");
    return res.status(400).json({ success: false, message: errorMessage });
  }
  req.body = result.data;
  next();
};
