import { createClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from 'dotenv';
dotenv.config();

console.log("--- System Debugger ---");

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const aiKey = process.env.GEMINI_API_KEY;

console.log("Supabase URL:", url ? "Set ✅" : "Missing ❌");
console.log("Supabase Key:", key ? "Set ✅" : "Missing ❌");
console.log("Gemini Key:", aiKey ? "Set ✅" : "Missing ❌");

if (!url || !key || !aiKey) {
    console.error("Stopping. Missing credentials in .env file.");
    process.exit(1);
}

const supabase = createClient(url, key);
const genAI = new GoogleGenerativeAI(aiKey);

async function testConnection() {
    try {
        console.log("\n[1/3] Testing Supabase Table Access...");
        const { data: intents, error: tableError } = await supabase
            .from('intents')
            .select('*')
            .limit(1);

        if (tableError) console.error("❌ Table Error:", tableError.message);
        else console.log("✅ Success. Found rows:", intents.length);

        console.log("\n[2/3] Testing Supabase RPC (Vector Match)...");
        const dummyVector = Array(768).fill(0.1);
        const { error: rpcError } = await supabase.rpc('match_embeddings', {
            query_embedding: dummyVector,
            match_threshold: 0.1,
            match_count: 1
        });

        console.log("\n[3/3] Testing 'find_similar_questions' RPC...");
        const { error: dsError } = await supabase.rpc('find_similar_questions', {
            query_embedding: dummyVector,
            match_threshold: 0.1,
            match_count: 1
        });

        if (dsError) {
            console.error("❌ RPC Error:", dsError.message);
            console.error("👉 Likely missing the SQL function 'find_similar_questions'.");
        } else {
            console.log("✅ Success. Duplicate Scanner RPC is ready.");
        }

        console.log("\n[4/4] Testing Gemini AI API (gemini-pro)...");
        const model = genAI.getGenerativeModel({ model: "gemini-pro" });
        const result = await model.generateContent("Say 'AI is working'");
        const response = await result.response;
        console.log("✅ Success. AI Replied:", response.text().trim());

    } catch (err) {
        console.error("❌ Unexpected Failure:", err.message);
        if (err.message.includes("API key")) console.error("👉 YOUR GEMINI API KEY IS INVALID OR EXPIRED.");
        if (err.message.includes("404")) console.error("👉 Model not found? Check GEMINI_MODEL setting.");
    }
}

testConnection();
