import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from 'dotenv';
dotenv.config();

const key = process.env.GEMINI_API_KEY;
console.log("Key available:", key ? "Yes (" + key.substring(0, 5) + "...)" : "No");

async function test() {
    try {
        const genAI = new GoogleGenerativeAI(key);
        const modelName = "gemini-flash-latest";
        console.log(`Testing model: ${modelName}`);
        const model = genAI.getGenerativeModel({ model: modelName });
        const result = await model.generateContent("Hello, are you there?");
        const response = await result.response;
        console.log("Response:", response.text());
    } catch (err) {
        console.error("Error:", err.message);
    }
}

test();
