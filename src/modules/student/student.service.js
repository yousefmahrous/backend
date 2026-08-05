const studentRepo = require('./student.repository');
const redisClient = require('../../core/config/redis.client');

const getAllStudents = async (page = 1, limit = 10, search = "") => {
  try {
    const pageNumber = Math.max(1, parseInt(page) || 1);
    const limitNumber = Math.max(1, parseInt(limit) || 10);
    const skip = (pageNumber - 1) * limitNumber;
    const { students, totalCount } = await studentRepo.getAllStudents(skip, limitNumber, search);
    const totalPages = Math.ceil(totalCount / limitNumber);

    return {
      success: true,
      status: 200,
      data: {
        users: students,
        pagination: {
          totalCount,
          totalPages,
          currentPage: pageNumber,
          limit: limitNumber,
          hasNextPage: pageNumber < totalPages,
          hasPreviousPage: pageNumber > 1
        }
      }
    };
  } catch (err) {
    console.error(err);
    return { success: false, status: 500, message: "حدث خطأ في السيرفر" };
  }
};

const getStudentById = async (id) => {
  try {
    const cachedUser = await redisClient.get(`students:${id}`);
    if (cachedUser) {
      return { success: true, status: 200, data: { user: JSON.parse(cachedUser) } };
    }

    const user = await studentRepo.getStudentById(id);
    if (!user) {
      return { success: false, status: 404, message: "المستخدم غير موجود" };
    }

    await redisClient.set(`students:${id}`, JSON.stringify(user), { EX: 3600 });

    return { success: true, status: 200, data: { user } };
  } catch (err) {
    console.error(err);
    return { success: false, status: 500, message: "حدث خطأ في السيرفر" };
  }
};

const addStudent = async (studentData) => {
  try {
    const emailExists = await studentRepo.getStudentByEmail(studentData.email);
    if (emailExists) {
      return { success: false, status: 400, errors: { email: ["الايميل مكرر"] } };
    }

    await studentRepo.createStudent(studentData);
    await redisClient.del('students:all');

    return { success: true, status: 201, message: "تم تسجيل الطالب بنجاح" };
  } catch (err) {
    console.error(err);
    return { success: false, status: 500, message: "حدث خطأ أثناء الحفظ في قاعدة البيانات" };
  }
};

const deleteStudent = async (id) => {
  try {
    await studentRepo.deleteStudent(id);
    await redisClient.del(['students:all', `students:${id}`]);

    return { success: true, status: 200, message: "تم حذف الطالب بنجاح" };
  } catch (err) {
    console.error(err);
    return { success: false, status: 500, message: "خطـأ في عملية المسح" };
  }
};

const editStudent = async (id, studentData) => {
  try {
    const emailConflict = await studentRepo.checkEmailForOtherStudent(studentData.email, id);
    if (emailConflict) {
      return { success: false, status: 400, message: "هذا البريد الإلكتروني مستخدم بالفعل لطالب آخر" };
    }
    await studentRepo.updateStudent(id, studentData);
    
    try {
      if (typeof redisClient !== 'undefined') {
        await redisClient.del(['students:all', `students:${id}`]);
      }
    } catch (redisErr) {
      console.log("تخطي خطأ مسح الكاش من Redis");
    }

    return { success: true, status: 200, message: "تم تعديل بيانات الطالب بنجاح" };
    
  } catch (err) {
    console.error("خطأ الباك إند في التعديل:", err);
    
    if (err.code === 'P2025') {
      return { success: false, status: 404, message: "الطالب غير موجود" };
    }
    
    return { success: false, status: 500, message: "حدث خطأ في السيرفر أثناء التعديل" };
  }
};

module.exports = {
  getAllStudents,
  getStudentById,
  addStudent,
  deleteStudent,
  editStudent
};