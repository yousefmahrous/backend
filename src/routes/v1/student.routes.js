const express = require('express');
const router = express.Router();
const studentService = require('../../modules/student/student.service');
const { validateAdd, validateEdit } = require('../../core/middlewares/validation');
const authMiddleware = require('../../core/middlewares/auth.middleware');
const requireAdmin = require('../../core/middlewares/admin.middleware');

router.use(authMiddleware);

router.get('/', async (req, res) => {
  const { page, limit, search } = req.query;
  const { status, ...response } = await studentService.getAllStudents(page, limit, search);
  res.status(status).json(response);
});

router.post('/', requireAdmin, validateAdd, async (req, res) => {
  const { status, ...response } = await studentService.addStudent(req.body);
  res.status(status).json(response);
});

router.get('/:id', async (req, res) => {
  const { status, ...response } = await studentService.getStudentById(req.params.id);
  res.status(status).json(response);
});

router.delete('/:id', requireAdmin, async (req, res) => {
  const { status, ...response } = await studentService.deleteStudent(req.params.id);
  res.status(status).json(response);
});

router.put('/:id', requireAdmin, validateEdit, async (req, res) => {
  const { status, ...response } = await studentService.editStudent(req.params.id, req.body);
  res.status(status).json(response);
});

module.exports = router;