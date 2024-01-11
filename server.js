require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const bodyParser = require("body-parser");
const cors = require("cors");
const multer = require("multer");
const fs = require("fs");
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "uploads/");
  },
  filename: function (req, file, cb) {
    {
      cb(null, file.originalname);
    }
  },
});

const upload = multer({ storage });

const app = express();
const PORT = process.env.PORT || 5000;

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

app.use(bodyParser.json());
app.use("/uploads", express.static("uploads"));
const corsOptions = {
  origin: function (origin, callback) {
    // Check if the origin is allowed or if it's a same-origin request
    const allowedOrigins = [
      "https://react-kanban-board-tanzil.netlify.app",
      "http://localhost:5173/",
    ];

    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  optionsSuccessStatus: 200, // some legacy browsers (IE11, various SmartTVs) choke on 204
};
app.use(cors(corsOptions));

// create columns start

const columnSchema = new mongoose.Schema({
  name: String,
  color: String,
});

const Column = mongoose.model("Column", columnSchema);

app.post("/api/columns", cors(corsOptions), async (req, res) => {
  try {
    const { name, color } = req.body;
    if (!name) {
      return res.status(400).json({ error: "Name is required for a column" });
    }
    const newColumn = new Column({ name, color });
    await newColumn.save();
    res
      .status(201)
      .json({ message: "Column created successfully", column: newColumn });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/api/columns", cors(corsOptions), async (req, res) => {
  try {
    const allColumns = await Column.find({}, "_id name color");
    const formattedColumns = allColumns.map((column) => ({
      id: column._id.toString(),
      name: column.name,
      color: column.color,
    }));
    res.status(200).json(formattedColumns);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal server error" });
  }
});
// create columns end

// tasks start
const fileSchema = new mongoose.Schema({
  path: String,
  type: String,
  size: Number,
  id: String,
  name: String,
});

const taskSchema = new mongoose.Schema({
  column: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Column",
    required: true,
  },
  content: {
    type: String,
    required: true,
  },
  client_photo: String,
  client_name: String,
  assignee_photo: String,
  assignee_name: String,
  created_at: {
    type: Date,
    default: Date.now,
  },
  files: [fileSchema],
});

const Task = mongoose.model("Task", taskSchema);

app.post("/api/tasks", cors(corsOptions), async (req, res) => {
  try {
    const {
      column,
      content,
      client_photo,
      client_name,
      assignee_photo,
      assignee_name,
      files,
    } = req.body;

    // Check if the column ID is valid
    if (!mongoose.Types.ObjectId.isValid(column)) {
      return res.status(400).json({ error: "Invalid column ID" });
    }

    // Check if the column exists
    const existingColumn = await Column.findById(column);
    if (!existingColumn) {
      return res.status(404).json({ error: "Column not found" });
    }

    const newTask = new Task({
      column,
      content,
      client_photo,
      client_name,
      assignee_photo,
      assignee_name,
      files,
    });

    await newTask.save();

    res
      .status(201)
      .json({ message: "Task created successfully", task: newTask });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/api/tasks", cors(corsOptions), async (req, res) => {
  try {
    const allTasks = await Task.find(
      {},
      "_id column content client_photo client_name assignee_photo assignee_name created_at files"
    );
    const formattedTasks = allTasks.map((task) => ({
      id: task._id.toString(),
      column: task.column,
      content: task.content,
      client_photo: task.client_photo,
      client_name: task.client_name,
      assignee_photo: task.assignee_photo,
      assignee_name: task.assignee_name,
      created_at: task.created_at.toLocaleDateString("en-US"),
      files: task.files,
    }));
    res.status(200).json(formattedTasks);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/api/tasks/:taskId", cors(corsOptions), async (req, res) => {
  try {
    const taskId = req.params.taskId;

    // Check if the task ID is valid
    if (!mongoose.Types.ObjectId.isValid(taskId)) {
      return res.status(400).json({ error: "Invalid task ID" });
    }

    // Find the task by ID
    const task = await Task.findById(taskId);

    // Check if the task exists
    if (!task) {
      return res.status(404).json({ error: "Task not found" });
    }

    res.json({ task });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.put(
  "/api/tasks/:taskId/column/:columnId",
  cors(corsOptions),
  async (req, res) => {
    try {
      const taskId = req.params.taskId;
      const columnId = req.params.columnId;

      // Check if both IDs are valid
      if (
        !mongoose.Types.ObjectId.isValid(taskId) ||
        !mongoose.Types.ObjectId.isValid(columnId)
      ) {
        return res.status(400).json({ error: "Invalid task or column ID" });
      }

      // Check if the task exists
      const task = await Task.findById(taskId);
      if (!task) {
        return res.status(404).json({ error: "Task not found" });
      }

      // Update the task's column
      task.column = columnId;

      // Save the updated task
      await task.save();

      res.json({ message: "Task column updated successfully", task });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// task end

// file upload start
app.post(
  "/api/tasks/:taskId/upload",
  cors(corsOptions),
  upload.array("files"),
  async (req, res) => {
    try {
      const taskId = req.params.taskId;

      if (!mongoose.Types.ObjectId.isValid(taskId)) {
        return res.status(400).json({ error: "Invalid task ID" });
      }

      const existingTask = await Task.findById(taskId);
      if (!existingTask) {
        return res.status(404).json({ error: "Task not found" });
      }
      const filesToUpdate = req.files.map((file) => ({
        path: file.path,
        type: file.mimetype,
        size: file.size,
        id: taskId,
        name: file.originalname,
      }));
      const updatedTask = await Task.findByIdAndUpdate(
        taskId,
        {
          $push: {
            files: { $each: filesToUpdate },
          },
        },
        { new: true }
      );

      res.json({ message: "Files uploaded successfully", task: updatedTask });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

app.delete(
  "/api/tasks/:taskId/file/:fileId/:fileName",
  cors(corsOptions),
  async (req, res) => {
    try {
      const { taskId, fileId, fileName } = req.params;

      if (!mongoose.Types.ObjectId.isValid(taskId)) {
        return res.status(400).json({ error: "Invalid task ID" });
      }

      const existingTask = await Task.findById(taskId);
      if (!existingTask) {
        return res.status(404).json({ error: "Task not found" });
      }
      fs.unlink(`uploads/${fileName}`, async (err) => {
        if (err) throw err;
        else {
          const updatedTask = await Task.findByIdAndUpdate(
            taskId,
            {
              $pull: {
                files: { _id: fileId },
              },
            },
            { new: true }
          );
          res.json({ message: "File deleted successfully", task: updatedTask });
        }
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
