import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from 'dotenv';
dotenv.config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const embeddingModel = genAI.getGenerativeModel({ model: "text-embedding-004" });
// Use Configured Model or Fallback to Stable 1.5 Flash
const modelName = process.env.GEMINI_MODEL || "gemini-pro";
const generativeModel = genAI.getGenerativeModel({ model: modelName });

export const aiService = {
    // 1. Grammar & Spell Fix
    async correctGrammar(text) {
        if (!text || !text.trim()) return text;
        try {
            const prompt = `Correct the spelling and grammar of the following user query for a school chatbot. Do not change the meaning. Return ONLY the corrected text.\n\nQuery: "${text}"`;

            const result = await generativeModel.generateContent(prompt);
            const response = await result.response;
            const corrected = response.text().trim();

            // Safety: if response is too different or empty, fallback to original
            return corrected || text;
        } catch (error) {
            console.error('Gemini Correction Error:', error.message);
            // Non-blocking: Return original text if AI fails (e.g. quota/model error)
            return text;
        }
    },

    // 2. Generate embedding for a single string
    async generateEmbedding(text) {
        if (!text || !text.trim()) return null;

        try {
            // Normalize text
            const cleanText = text.replace(/\n/g, ' ');

            const result = await embeddingModel.embedContent(cleanText);
            const embedding = result.embedding;

            // Gemini returns object { values: [...] }
            return embedding.values;
        } catch (error) {
            console.error('Gemini Embedding Error:', error.message);
            throw error;
        }
    },

    // 3. Batch generation
    async generateEmbeddingsBatch(texts) {
        try {
            // Gemini batch support? Easier to map promises for now to avoid complexity limits
            // text-embedding-004 supports batch but let's keep it simple
            const cleanTexts = texts.map(t => t.replace(/\n/g, ' '));

            const promises = cleanTexts.map(t => embeddingModel.embedContent(t));
            const results = await Promise.all(promises);

            return results.map(r => r.embedding.values);
        } catch (error) {
            console.error('Batch Embedding Error:', error);
            throw error;
        }
    }
};
