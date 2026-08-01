const { bookingSchema, editBookingSchema } = require('../../modules/student/student.schema');

const validateAdd = (req, res, next) => {
    const result = bookingSchema.safeParse(req.body);
    if (!result.success) {
        const fieldErrors = result.error.flatten().fieldErrors;
        return res.status(400).json({ success: false, errors: fieldErrors });
    }
    req.body = result.data;
    next();
}

const validateEdit = (req, res, next) => {
    const result = editBookingSchema.safeParse(req.body);
    if (!result.success) {
        const fieldErrors = result.error.flatten().fieldErrors;
        const errorMessage = Object.values(fieldErrors).flat().join(" - ");
        return res.status(400).json({ success: false, message: errorMessage });
    }
    req.body = result.data;
    next();
}

module.exports = { validateAdd, validateEdit };