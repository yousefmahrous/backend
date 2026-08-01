const express = require('express');
const cors = require('cors');
const app = express();
const port = process.env.PORT || 3000;
const studentRoutes = require('./modules/student/student.routes');

app.use(cors());
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(studentRoutes);

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});