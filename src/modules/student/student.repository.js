const prisma = require('../../core/db')


const getAllStudents = async (skip, take, search = "") => {
  const whereCondition = search ? {
    full_name: {
      contains: search,
    }
  } : {};

  const [students, totalCount] = await Promise.all([
    prisma.booking.findMany({
      where: whereCondition,
      skip: skip,
      take: take,
      orderBy: { id: 'desc' }
    }),
    prisma.booking.count({
      where: whereCondition
    })
  ]);

  return { students, totalCount };
};

const getStudentById = async (id) => {
  const student = await prisma.booking.findUnique({
    where: { id: parseInt(id) }
  });
  return student;
};

const getStudentByEmail = async (email) => {
  const student = await prisma.booking.findFirst({
    where: { email },
    select: { id: true }
  });
  return student;
};

const createStudent = async (studentData) => {
  let avatarUrl = null;

  if (studentData.avatar_key) {
    const endpointHost = process.env.B2_ENDPOINT.replace('https://', '');
    avatarUrl = `https://${process.env.B2_BUCKET_NAME}.${endpointHost}/${studentData.avatar_key}`;
  }

  const newStudent = await prisma.booking.create({
    data: {
      full_name: studentData.name,
      phone_number: studentData.number, 
      email: studentData.email,
      address: studentData.adress,
      center_name: studentData.centre,
      grade_level: studentData.grade,
      avatar_key: studentData.avatar_key || null,
      avatar_url: avatarUrl,
    }
  });

  return newStudent;
};

const deleteStudent = async (id) => {
  const deletedStudent = await prisma.booking.delete({
    where: { id: parseInt(id) }
  });
  return deletedStudent;
};

const checkEmailForOtherStudent = async (email, id) => {
  const existingStudent = await prisma.booking.findFirst({
    where: {
      email: email,
      id: {
        not: parseInt(id)
      }
    }
  });
  
  return existingStudent !== null; 
};

const updateStudent = async (id, studentData) => {
  const updatedStudent = await prisma.booking.update({
    where: { id: parseInt(id) },
    data: {
      full_name: studentData.name, 
      email: studentData.email
    }
  });
  return updatedStudent;
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