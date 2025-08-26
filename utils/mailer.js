// utils/email.js (FINAL AND CORRECT VERSION)

import nodemailer from "nodemailer";
import { ApiError } from "./ApiError.js";

export const sendEmail = async (to, subject, html) => {
  try {
    // Transporter ko hamesha function ke ANDAR banayein
    const transporter = nodemailer.createTransport({
      host: process.env.MAIL_HOST,
      port: process.env.MAIL_PORT,
      // ===> YAHI HAI MUKHYA FIX <===
      // Agar port 465 hai, toh secure: true, warna secure: false.
      secure: process.env.MAIL_PORT == 465,
      auth: {
        user: process.env.MAIL_USER,
        pass: process.env.MAIL_PASS,
      },
    });

    const info = await transporter.sendMail({
      from: `"Gullnaaz Enterprises" <${process.env.MAIL_USER}>`,
      to: to,
      subject: subject,
      html: html,
    });

    console.log(`✅ Email sent successfully to ${to}.`);
  } catch (error) {
    console.error("❌ Error sending email via Nodemailer:", error);
    console.error("Nodemailer Configuration Used:", {
      host: process.env.MAIL_HOST,
      port: process.env.MAIL_PORT,
      user: process.env.MAIL_USER,
    });
    throw new ApiError(
      500,
      "Failed to send email. Please check server logs for details."
    );
  }
};
