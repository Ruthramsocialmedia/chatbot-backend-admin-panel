import { ENV } from "./config/env.js";
import dotenv from 'dotenv';
dotenv.config();

console.log("ENV.GEMINI_API_KEY:", ENV.GEMINI_API_KEY ? "Present" : "Missing");
console.log("process.env.GEMINI_API_KEY:", process.env.GEMINI_API_KEY ? "Present" : "Missing");
console.log("Match?", ENV.GEMINI_API_KEY === process.env.GEMINI_API_KEY);
