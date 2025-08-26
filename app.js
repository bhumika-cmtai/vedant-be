import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import mainRouter from "./routes/index.js";
import { errorHandler } from "./middlewares/error.middleware.js";

const app = express();

// ✅ CORS origin check
console.log(
  `[CORS Verification] The server is about to configure CORS for origin: ${process.env.CORS_ORIGIN}`
);

// ✅ CORS middleware (corrected and complete)
app.use(
  cors({
    origin: ["http://localhost:3000", "https://www.naraaglobal.com"],
    credentials: true,
  })
);

// ✅ Handle preflight OPTIONS request for all routes
app.options("*", cors({
  origin: ["http://localhost:3000", "https://www.naraaglobal.com"],
  credentials: true,
}));

// ✅ Body and cookie parsers
app.use(express.json({ limit: "16kb" }));
app.use(express.urlencoded({ extended: true, limit: "16kb" }));
app.use(cookieParser());

// ✅ Static files
app.use(express.static("public"));

// ✅ Main API routes
app.use("/api/v1", mainRouter);

// ✅ Error handler
app.use(errorHandler);

// ✅ Export app
export { app };
