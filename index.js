const express = require("express");
const bcrypt = require("bcrypt");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const app = express();
const PORT = process.env.PORT || 3001;

app.use(express.json());
app.use(
  cors({
    origin: ["http://localhost:5173", "https://uniroll-reg-system.netlify.app"],
  })
);

app.get("/", (req, res) => {
  res.send("Hello World!");
});

const uri =
  "mongodb+srv://unirollAdmin:nVqcmwN5Qlk2XVjE@cluster0.oeipnk8.mongodb.net/";

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    const myDB = client.db("uniroll");
    const studentsCollection = myDB.collection("students");
    const adminCollection = myDB.collection("admins");
    const coursesCollection = myDB.collection("courses");
    const registrationsCollection = myDB.collection("registrations");
    const departmentsCollection = myDB.collection("departments");
    const advisorsCollection = myDB.collection("advisors");

    //user create api
    app.post("/signup", async (req, res) => {
      const userData = req.body;
      const plainPass = userData.password;

      try {
        const existingUser = await studentsCollection.findOne({
          studentId: userData.studentId,
        });
        if (existingUser) {
          return res.status(400).send({
            success: false,
            message: "Student ID already registered",
          });
        }
        const salt = bcrypt.genSaltSync(10);
        const hashedPass = bcrypt.hashSync(plainPass, salt);

        const FinalUser = {
          studentId: userData.studentId,
          studentName: userData.name,
          password: hashedPass,
          dept_name: userData.dept_name,
        };

        const result = await studentsCollection.insertOne(FinalUser);

        res.status(201).send({
          success: true,
          message: "User created successfully",
          data: result,
        });
      } catch (error) {
        console.error(error);
        res.status(500).send({ error: "Internal server error" });
      }
    });

    //student login API
    app.post("/studentLogin", async (req, res) => {
      const studentData = req.body;

      const studentId = studentData.studentId;
      const password = studentData.password;

      try {
        const studentServerData = await studentsCollection.findOne({
          studentId,
        });

        if (!studentServerData) {
          return res.status(404).send({
            message: "Id not found",
            type: "error",
          });
        }

        const storedHash = studentServerData.password;

        bcrypt.compare(password, storedHash, (err, result) => {
          if (err) {
            return res.status(500).send({
              message: "Internal server error",
              type: "error",
            });
          }

          if (result) {
            return res.status(200).send(
              {
                message: "Login successful",
                user: studentServerData,
                type: "success",
              },
              studentServerData
            );
          } else {
            return res.status(401).send({
              message: "Invalid password",
              type: "error",
            });
          }
        });
      } catch (error) {
        return res.status(500).send({
          message: "Something went wrong",
          type: "error",
          error: error.message,
        });
      }
    });

    //admin login
    app.post("/adminLogin", async (req, res) => {
      try {
        const { email, password } = req.body;
        const serverAdmin = await adminCollection.findOne({ email });

        if (!serverAdmin) {
          return res.status(404).send({ message: "No email found." });
        }

        if (serverAdmin.password === password) {
          res.send(serverAdmin);
        } else {
          res.status(401).send({ message: "Wrong password." });
        }
      } catch (error) {
        console.error(error);
        res.status(500).send({ message: "Server error" });
      }
    });

    //student post api
    app.post("/students", async (req, res) => {
      const studentsDoc = req.body;

      try {
        const result = await studentsCollection.insertOne(studentsDoc);
        res.send(result);
      } catch (error) {
        res.send(error.message);
      }
    });

    //create course api
    app.post("/addCourse", async (req, res) => {
      const courseDoc = req.body;

      try {
        const result = await coursesCollection.insertOne(courseDoc);
        res.send(result);
      } catch (error) {
        res.send(error.message);
      }
    });

    // GET courses by semester (optional)
    app.get("/courses", async (req, res) => {
      try {
        const semester = req.query.semester;

        let query = {};
        if (semester) {
          query = { offered_in: semester };
        }

        const courses = await coursesCollection.find(query).toArray();

        res.status(200).json(courses);
      } catch (error) {
        console.error("Error fetching courses:", error);
        res.status(500).json({ message: "Internal server error" });
      }
    });

    // Update course api
    app.put("/updateCourse/:id", async (req, res) => {
      const courseId = req.params.id;
      const updatedData = req.body;

      try {
        const result = await coursesCollection.updateOne(
          { _id: courseId }, // match course by _id
          { $set: updatedData } // update fields
        );

        if (result.matchedCount === 0) {
          return res.status(404).json({ message: "Course not found" });
        }

        const updatedCourse = await coursesCollection.findOne({
          _id: courseId,
        });
        res.status(200).json(updatedCourse);
      } catch (error) {
        console.error("Error updating course:", error);
        res.status(500).json({ message: "Failed to update course" });
      }
    });

    //delete course api
    app.delete("/deleteCourse/:id", async (req, res) => {
      const courseId = req.params.id;

      try {
        await registrationsCollection.updateMany(
          {},
          { $pull: { courses: { _id: courseId } } }
        );

        await coursesCollection.deleteOne({ _id: courseId });

        res.status(200).json({ message: "Course deleted successfully" });
      } catch (error) {
        console.error("Error deleting course:", error);
        res.status(500).json({ message: "Failed to delete course" });
      }
    });

    //add Registration api
    app.post("/registrations", async (req, res) => {
      try {
        const { student_id, courses, total_credit, semester } = req.body;

        if (!student_id || !courses || !semester) {
          return res.status(400).json({
            message: "student_id, courses, and semester are required",
          });
        }

        // Check if student already registered for this semester
        const existing = await registrationsCollection.findOne({
          student_id,
          semester,
        });

        if (existing) {
          return res
            .status(400)
            .json({ message: "Already registered for this semester" });
        }

        // Create new registration
        const registration = {
          student_id,
          semester,
          courses,
          total_credit,
          advisor_id: null,
          registered_at: new Date(),
        };

        const result = await registrationsCollection.insertOne(registration);

        // ✅ Update student's current semester in studentsCollection
        await studentsCollection.updateOne(
          { studentId: student_id },
          { $set: { currentSemester: semester } }
        );

        res.status(201).json({
          success: true,
          message: "Registration successful",
          data: result,
        });
      } catch (error) {
        console.error("Error adding registration:", error);
        res.status(500).json({ message: "Internal server error" });
      }
    });

    //addDept api
    app.post("/addDept", async (req, res) => {
      try {
        const { _id, name } = req.body;
        if (!_id || !name) return res.status(400).send("Missing fields");

        const existing = await departmentsCollection.findOne({ _id });
        if (existing) return res.status(409).send("Department already exists");

        const result = await departmentsCollection.insertOne({ _id, name });
        res.status(201).send({ message: "Department added", result });
      } catch (err) {
        console.error(err);
        res.status(500).send("Error adding department");
      }
    });
    // GET all departments
    app.get("/departments", async (req, res) => {
      try {
        const departments = await departmentsCollection
          .find({}, { projection: { _id: 0, name: 1 } })
          .toArray();

        const deptNames = departments.map((d) => d.name);
        res.status(200).json({ departments: deptNames });
      } catch (error) {
        console.error("Error fetching departments:", error);
        res.status(500).json({ message: "Internal server error" });
      }
    });

    //get semester api
    app.get("/semesters", async (req, res) => {
      try {
        const semesters = await coursesCollection
          .aggregate([
            { $unwind: "$offered_in" },
            { $group: { _id: "$offered_in" } },
            { $project: { _id: 0, semester: "$_id" } },
          ])
          .toArray();

        const semesterList = semesters.map((s) => s.semester);

        semesterList.sort((a, b) => {
          const yearA = parseInt(a.slice(-4));
          const yearB = parseInt(b.slice(-4));
          return yearA - yearB;
        });

        res.status(200).json({ semesters: semesterList });
      } catch (error) {
        console.error("Error fetching semesters:", error);
        res.status(500).json({ message: "Internal server error" });
      }
    });

    // Get students registered for each course
    app.get("/course-wise-students", async (req, res) => {
      try {
        const result = await registrationsCollection
          .aggregate([
            { $unwind: "$courses" },
            {
              $lookup: {
                from: "students",
                localField: "student_id",
                foreignField: "studentId",
                as: "student_info",
              },
            },
            { $unwind: "$student_info" },
            {
              $lookup: {
                from: "courses",
                localField: "courses",
                foreignField: "_id",
                as: "course_info",
              },
            },
            { $unwind: "$course_info" },

            // Group by course and collect student names
            {
              $group: {
                _id: "$course_info.name",
                course_id: { $first: "$courses" },
                semester: { $first: "$semester" },
                students: {
                  $push: {
                    studentId: "$student_info.studentId",
                    name: "$student_info.studentName",
                    dept: "$student_info.dept_name",
                  },
                },
                total_students: { $sum: 1 },
              },
            },

            // Optional sorting by course name
            { $sort: { _id: 1 } },
          ])
          .toArray();

        res.status(200).json(result);
      } catch (error) {
        console.error("Error fetching course-wise students:", error);
        res.status(500).json({ message: "Internal server error" });
      }
    });

    //get all students api
    app.get("/students", async (req, res) => {
      try {
        const { dept_name, semester } = req.query;

        // Build dynamic filter
        const filter = {};
        if (dept_name) filter.dept_name = dept_name;
        if (semester) filter.semester = semester;

        const students = await studentsCollection
          .find(filter, { projection: { password: 0 } })
          .sort({ studentId: 1 })
          .toArray();

        res.status(200).json(students);
      } catch (error) {
        console.error("Error fetching students:", error);
        res.status(500).json({ message: "Internal server error" });
      }
    });

    // Delete a student by ID
    app.delete("/students/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const _id = new ObjectId(id);
        const result = await studentsCollection.deleteOne({
          _id: _id,
        });

        if (result.deletedCount === 0) {
          return res.status(404).json({ message: "Student not found" });
        }

        res
          .status(200)
          .json({ success: true, message: "Student deleted successfully" });
      } catch (error) {
        console.error("Error deleting student:", error);
        res.status(500).json({ message: "Internal server error" });
      }
    });

    // Add new advisor
    app.post("/advisors", async (req, res) => {
      try {
        const advisor = req.body;
        const exists = await advisorsCollection.findOne({ _id: advisor._id });
        if (exists) {
          return res.status(400).json({ message: "Advisor ID already exists" });
        }
        await advisorsCollection.insertOne(advisor);
        res.status(201).json({ message: "Advisor added successfully" });
      } catch (error) {
        console.error("Error adding advisor:", error);
        res.status(500).json({ message: "Internal server error" });
      }
    });

    // GET all registrations
    app.get("/registrations", async (req, res) => {
      try {
        const registrations = await registrationsCollection
          .find()
          .sort({ registered_at: -1 })
          .toArray();
        res.status(200).json(registrations);
      } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Internal server error" });
      }
    });

    // GET all advisors
    app.get("/advisors", async (req, res) => {
      try {
        const advisors = await advisorsCollection
          .find()
          .sort({ _id: 1 })
          .toArray();
        res.status(200).json(advisors);
      } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Internal server error" });
      }
    });

    // Assign advisor to a registration
    app.patch("/registrations/:id/assign-advisor", async (req, res) => {
      try {
        const registrationId = req.params.id;
        const { advisor_id } = req.body;

        if (!advisor_id) {
          return res.status(400).json({ message: "Advisor ID is required" });
        }

        await registrationsCollection.updateOne(
          { _id: new ObjectId(registrationId) },
          { $set: { advisor_id } }
        );

        res.status(200).json({ message: "Advisor assigned successfully" });
      } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Internal server error" });
      }
    });

    // GET student profile info
    app.get("/studentProfile/:studentId", async (req, res) => {
      try {
        const studentId = req.params.studentId;

        // Find the student (excluding password)
        const student = await studentsCollection.findOne(
          { studentId },
          { projection: { password: 0 } }
        );

        if (!student) {
          return res.status(404).json({ message: "Student not found" });
        }

        // Find the student's registration
        const registration = await registrationsCollection.findOne({
          student_id: studentId,
        });

        if (!registration) {
          return res.status(200).json({
            student,
            registration: null,
            regCourse: [],
            timetable: [],
            message: "No registration found",
          });
        }

        // Fetch course details
        const courses = await coursesCollection
          .find({ _id: { $in: registration.courses } })
          .toArray();

        // Create timetable dynamically
        const timetable = courses.map((c, i) => ({
          day: ["Sun", "Mon", "Tue", "Wed", "Thu"][i % 5],
          course: c.name,
          time: `${10 + i}:00 - ${11 + i}:00 AM`,
        }));

        // ✅ Create regCourse array (courseId + name)
        const regCourse = courses.map((c) => ({
          courseId: c._id,
          name: c.name,
        }));

        // Send full response
        res.status(200).json({
          student,
          registration,
          regCourse,
          timetable,
        });
      } catch (error) {
        console.error("Error fetching student profile:", error);
        res.status(500).json({ message: "Internal server error" });
      }
    });

    // GET: Admin Stats Overview
    app.get("/admin/stats", async (req, res) => {
      try {
        const [
          studentsCount,
          coursesCount,
          deptCount,
          advisorCount,
          registrationCount,
        ] = await Promise.all([
          studentsCollection.countDocuments(),
          coursesCollection.countDocuments(),
          departmentsCollection.countDocuments(),
          advisorsCollection.countDocuments(),
          registrationsCollection.countDocuments(),
        ]);

        res.status(200).json({
          students: studentsCount,
          courses: coursesCount,
          departments: deptCount,
          advisors: advisorCount,
          registrations: registrationCount,
        });
      } catch (error) {
        console.error("Error fetching admin stats:", error);
        res.status(500).json({ message: "Internal server error" });
      }
    });

    // Connect the client to the server	(optional starting in v4.7)
    // await client.connect();
    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT} ......`);
});
