const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const repository = require('./auth.repository');
const { sendWelcomeEmail } = require('../../core/services/email.service');
const JWT_SECRET = process.env.JWT_SECRET; 


const signup = async (data) => {
  const existingUser = await repository.findUserByEmail(data.email);
  if (existingUser) {
    throw new Error('الإيميل ده مستخدم قبل كده');
  }

  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash(data.password, salt);

  const newUser = await repository.createUser(data.name, data.email, hashedPassword);

  sendWelcomeEmail(data.email, data.name);

  return newUser;
};

const login = async (data) => {
  const user = await repository.findUserByEmail(data.email);
  if (!user) {
    throw new Error('الإيميل أو كلمة المرور غير صحيحة');
  }

  const isMatch = await bcrypt.compare(data.password, user.password);
  if (!isMatch) {
    throw new Error('الإيميل أو كلمة المرور غير صحيحة');
  }

  const token = jwt.sign(
    { id: user.id, email: user.email, role: user.role }, 
    JWT_SECRET, 
    { expiresIn: '1h' }
  );
  
  return { 
    user: { 
      id: user.id, 
      name: user.name, 
      email: user.email, 
      role: user.role 
    }, 
    token 
  };
};

module.exports = { signup, login };