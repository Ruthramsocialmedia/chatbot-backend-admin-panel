import dotenv from "dotenv";

dotenv.config();

export const ENV = {
  GEMINI_API_KEY: process.env.GEMINI_API_KEY || "",
  // Fallback to standard 'gemini-pro' if specific versions fail
  GEMINI_MODEL: process.env.GEMINI_MODEL || "gemini-pro",
  PORT: process.env.PORT || 3000
};
