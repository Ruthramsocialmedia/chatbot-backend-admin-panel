import dotenv from "dotenv";

dotenv.config();

export const ENV = {
  GEMINI_API_KEY: process.env.GEMINI_API_KEY,
  // Default to stable, high-quota gemini-3.5-flash-lite
  GEMINI_MODEL: process.env.GEMINI_MODEL || "gemini-3.5-flash-lite",
  PORT: process.env.PORT || 3000
};
