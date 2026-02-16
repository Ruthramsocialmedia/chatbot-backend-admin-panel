import { GoogleGenerativeAI } from "@google/generative-ai";
import { normalizeToMeaning, generateAnswerFromContext, answerGeneralQuestion, quickCorrection } from "./geminiService.js";
import { keyManager } from "../utils/keyManager.js";
import dotenv from 'dotenv';
dotenv.config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const embeddingModel = null; // Removed static init
// Use Configured Model or Fallback to Stable 1.5 Flash
const modelName = process.env.GEMINI_MODEL || "gemini-flash-latest";

export const aiService = {
    // 1. Grammar & Spell Fix
    async correctGrammar(text) {
        if (!text || !text.trim()) return text;

        const currentKey = keyManager.getKey();
        if (!currentKey) return text;

        try {
            const genAI = new GoogleGenerativeAI(currentKey);
            const generativeModel = genAI.getGenerativeModel({ model: modelName });

            const prompt = `Correct the spelling and grammar of the following user query for a school chatbot. Do not change the meaning. Return ONLY the corrected text.\n\nQuery: "${text}"`;

            const result = await generativeModel.generateContent(prompt);
            const response = await result.response;
            const corrected = response.text().trim();

            // Safety: if response is too different or empty, fallback to original
            return corrected || text;
        } catch (error) {
            console.error('Gemini Correction Error:', error.message);

            if (error.message && (error.message.includes("429") || error.message.includes("Quota exceeded"))) {
                if (keyManager.rotate()) {
                    console.log("[aiService] Rotating key and retrying correctGrammar...");
                    return this.correctGrammar(text);
                }
            }
            // Non-blocking: Return original text if AI fails (e.g. quota/model error)
            return text;
        }
    },

    // 2. Generate embedding for a single string
    async generateEmbedding(text) {
        if (!text || !text.trim()) return null;

        const currentKey = keyManager.getKey();
        if (!currentKey) return null;

        try {
            // Normalize text
            const cleanText = text.replace(/\n/g, ' ');

            const genAI = new GoogleGenerativeAI(currentKey);
            const embeddingModel = genAI.getGenerativeModel({ model: "gemini-embedding-001" });

            const result = await embeddingModel.embedContent({
                content: { parts: [{ text: cleanText }] },
                outputDimensionality: 768   // Match existing DB vectors
            });
            const embedding = result.embedding;

            // Gemini returns object { values: [...] }
            return embedding.values;
        } catch (error) {
            console.error('Gemini Embedding Error:', error.message);
            if (error.message && (error.message.includes("429") || error.message.includes("Quota exceeded"))) {
                if (keyManager.rotate()) {
                    console.log("[aiService] Rotating key and retrying generateEmbedding...");
                    return this.generateEmbedding(text);
                }
            }
            throw error;
        }
    },

    // 3. Batch generation
    async generateEmbeddingsBatch(texts) {
        try {
            // Gemini batch support? Easier to map promises for now to avoid complexity limits
            // gemini-embedding-001 supports batch but let's keep it simple
            const cleanTexts = texts.map(t => t.replace(/\n/g, ' '));

            const promises = cleanTexts.map(t => embeddingModel.embedContent({
                content: { parts: [{ text: t }] },
                outputDimensionality: 768
            }));
            const results = await Promise.all(promises);

            return results.map(r => r.embedding.values);
        } catch (error) {
            console.error('Batch Embedding Error:', error);
            throw error;
        }
    },

    // RAG Functions
    normalizeToMeaning,
    generateAnswerFromContext,
    answerGeneralQuestion,
    quickCorrection
};
