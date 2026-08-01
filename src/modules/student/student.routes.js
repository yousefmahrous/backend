const express = require('express');
const router = express.Router();
const studentService = require('./student.service');

const { validateAdd, validateEdit } = require('../../core/middlewares/validation');

router.get('/api/users', async (req, res) => {
  const { status, ...response } = await studentService.getAllStudents();
  res.status(status).json(response);
});

router.post('/api/add', validateAdd, async (req, res) => {
  const { status, ...response } = await studentService.addStudent(req.body);
  res.status(status).json(response);
});

router.get('/api/user/:id', async (req, res) => {
  const { status, ...response } = await studentService.getStudentById(req.params.id);
  res.status(status).json(response);
});

router.delete('/api/delete/:id', async (req, res) => {
  const { status, ...response } = await studentService.deleteStudent(req.params.id);
  res.status(status).json(response);
});

router.put('/api/edit/:id', validateEdit, async (req, res) => {
  const { status, ...response } = await studentService.editStudent(req.params.id, req.body);
  res.status(status).json(response);
});

module.exports = router;