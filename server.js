// src/server.js (FINAL VERSION - WORKS LOCALLY AND ON VERCEL)

import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import connectDB from "./config/database.js";
import { app } from "./app.js";

// Load environment variables reliably
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({
  path: path.resolve(__dirname, "../.env"),
});

// Connect to the database
connectDB();

if (!process.env.VERCEL) {
  const PORT = process.env.PORT || 8000;
  app.listen(PORT, () => {
    console.log(`🚀 Server is running locally at http://localhost:${PORT}`);
  });
}

export default app;
