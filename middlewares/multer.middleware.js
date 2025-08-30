// In middlewares/multer.middleware.js

import multer from "multer";
import path from "path";
import os from "os"; // Using os.tmpdir() is a robust way to get the temp directory

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    // This will correctly resolve to /tmp on Vercel and the appropriate temp
    // directory on your local machine.
    cb(null, os.tmpdir());
  },
  filename: function (req, file, cb) {
    // Create a unique filename to avoid overwriting files
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, file.fieldname + "-" + uniqueSuffix + path.extname(file.originalname));
  },
});

export const upload = multer({
  storage: storage,
});