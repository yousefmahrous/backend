const express = require('express');
const router = express.Router();
const studentService = require('./student.service');
const { validateAdd, validateEdit } = require('../../core/middlewares/validation');
const authMiddleware = require('../../core/middlewares/auth.middleware');
const requireAdmin = require('../../core/middlewares/admin.middleware');

router.use(authMiddleware);

router.get('/users', async (req, res) => {
  const { status, ...response } = await studentService.getAllStudents();
  res.status(status).json(response);
});

router.post('/add', requireAdmin, validateAdd, async (req, res) => {
  const { status, ...response } = await studentService.addStudent(req.body);
  res.status(status).json(response);
});

router.get('/user/:id', async (req, res) => {
  const { status, ...response } = await studentService.getStudentById(req.params.id);
  res.status(status).json(response);
});

router.delete('/delete/:id', requireAdmin, async (req, res) => {
  const { status, ...response } = await studentService.deleteStudent(req.params.id);
  res.status(status).json(response);
});

router.put('/edit/:id', requireAdmin, validateEdit, async (req, res) => {
  const { status, ...response } = await studentService.editStudent(req.params.id, req.body);
  res.status(status).json(response);
});

module.exports = router;