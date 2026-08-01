const pool = require('../../core/db'); 

const getAllStudents = async () => {
  const query = "SELECT * FROM bookings";
  const result = await pool.query(query);
  return result.rows;
};

const getStudentById = async (id) => {
  const query = "SELECT * FROM bookings WHERE id = $1";
  const result = await pool.query(query, [id]);
  return result.rows[0]; 
};

const getStudentByEmail = async (email) => {
  const query = "SELECT id from bookings WHERE email = $1";
  const result = await pool.query(query, [email]);
  return result.rows[0];
};

const createStudent = async (data) => {
  const { name, number, email, adress, centre, grade } = data;
  const query = "INSERT INTO bookings (full_name, phone_number, email, address, center_name, grade_level) VALUES ($1, $2, $3, $4, $5, $6)";
  const values = [name, number, email, adress, centre, grade];
  const result = await pool.query(query, values);
  return result;
};

const deleteStudent = async (id) => {
  const query = "DELETE FROM bookings WHERE id = $1";
  const result = await pool.query(query, [id]);
  return result;
};

const checkEmailForOtherStudent = async (email, id) => {
  const query = "SELECT id FROM bookings WHERE email = $1 AND id != $2";
  const result = await pool.query(query, [email, id]);
  return result.rows[0];
};

const updateStudent = async (id, data) => {
  const { name, email } = data;
  const query = 'UPDATE bookings SET full_name = COALESCE($1, full_name), email = COALESCE($2, email) WHERE id = $3';
  const result = await pool.query(query, [name, email, id]);
  return result;
};

module.exports = {
  getAllStudents,
  getStudentById,
  getStudentByEmail,
  createStudent,
  deleteStudent,
  checkEmailForOtherStudent,
  updateStudent
};