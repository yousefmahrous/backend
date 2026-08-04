const pool = require('../../core/db');

const findUserByEmail = async (email) => {
  const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
  return result.rows[0];
};

const createUser = async (name, email, hashedPassword) => {
  const result = await pool.query(
    'INSERT INTO users (name, email, password) VALUES ($1, $2, $3) RETURNING id, name, email',
    [name, email, hashedPassword]
  );
  return result.rows[0];
};

const saveResetToken = async (userId, token, expiresAt) => {
  await pool.query(
    'UPDATE users SET reset_password_token = $1, reset_password_expires = $2 WHERE id = $3',
    [token, expiresAt, userId]
  );
};

const findUserByResetToken = async (token) => {
  const result = await pool.query(
    'SELECT * FROM users WHERE reset_password_token = $1 AND reset_password_expires > NOW()',
    [token]
  );
  return result.rows[0];
};

const updatePasswordAndClearToken = async (userId, hashedPassword) => {
  await pool.query(
    'UPDATE users SET password = $1, reset_password_token = NULL, reset_password_expires = NULL WHERE id = $2',
    [hashedPassword, userId]
  );
};

module.exports = { findUserByEmail, createUser, saveResetToken, findUserByResetToken, updatePasswordAndClearToken };