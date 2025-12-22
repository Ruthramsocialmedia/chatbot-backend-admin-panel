import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from 'dotenv';
dotenv.config();

const key = process.env.GEMINI_API_KEY;

async function test() {
    try {
        if (!key) {
            console.error("No API Key found");
            return;
        }

        // We can't list models via SDK easily in node? 
        // Actually we can use the API directly via fetch to list models if SDK assumes a model.
        // But SDK might have listModels?
        // Let's try raw fetch to list models.

        const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${key}`;
        console.log("Fetching models list...");
        const res = await fetch(url);
        const data = await res.json();

        if (data.models) {
            console.log("Available Models:");
            data.models.forEach(m => console.log(`- ${m.name} (${m.supportedGenerationMethods})`));
        } else {
            console.log("No models found or error:", data);
        }

    } catch (err) {
        console.error("Error:", err.message);
    }
}

test();
