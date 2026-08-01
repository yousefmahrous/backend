const studentRepo = require('./student.repository');

const getAllStudents = async () => {
  try {
    const users = await studentRepo.getAllStudents();
    return { success: true, status: 200, data: { users } };
  } catch (err) {
    console.error(err);
    return { success: false, status: 500, message: "حدث خطأ في السيرفر" };
  }
};

const getStudentById = async (id) => {
  try {
    const user = await studentRepo.getStudentById(id);
    if (!user) {
      return { success: false, status: 404, message: "المستخدم غير موجود" };
    }
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
    return { success: true, status: 201, message: "تم تسجيل الطالب بنجاح" };
  } catch (err) {
    console.error(err);
    return { success: false, status: 500, message: "حدث خطأ أثناء الحفظ في قاعدة البيانات" };
  }
};

const deleteStudent = async (id) => {
  try {
    await studentRepo.deleteStudent(id);
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

    const result = await studentRepo.updateStudent(id, studentData);
    if (result.rowCount > 0) {
      return { success: true, status: 200, message: "تم تعديل بيانات الطالب بنجاح" };
    } else {
      return { success: false, status: 404, message: "الطالب غير موجود" };
    }
  } catch (err) {
    console.error("خطأ الباك إند:", err);
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