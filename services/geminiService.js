// services/geminiService.js — IUI Engine v2.5
// Advanced Input Understanding for Montfort Chatbot
// - Safe spelling (no noun swaps)
// - Word-split + local vocab spell-fix
// - Meaning-preserving normalization
// - School-safe fallback
// - Embeddings for semantic search

import { GoogleGenerativeAI } from "@google/generative-ai";
import { ENV } from "../config/env.js";
import { fileURLToPath } from "url";
import { supabaseAdmin } from "./supabaseService.js";
import { vocabService } from "./vocabService.js";
import { levenshteinDistance } from "../utils/stringUtils.js";
import { keyManager } from "../utils/keyManager.js";

// Initialize genAI dynamically in callGemini to allow key rotation
// const genAI = new GoogleGenerativeAI(ENV.GEMINI_API_KEY); <--- REMOVED static init
const CHAT_MODEL = ENV.GEMINI_MODEL || "gemini-flash-latest";
const EMBED_MODEL = "gemini-embedding-001";

/* ---------------------------------------------------------
   CORE GEMINI CALLER (SDK Version)
--------------------------------------------------------- */
/* ---------------------------------------------------------
   CORE GEMINI CALLER (SDK Version)
--------------------------------------------------------- */
const COOLDOWN_MS = 60 * 1000; // 1 minute cooldown
let last429Time = 0;

async function callGemini(prompt, instruction = "") {
  // CIRCUIT BREAKER: Check cooldown (Only if ALL keys are exhausted/rate-limited, but for now simple global check)
  // With multi-key, we might not need global cooldown unless ALL keys fail.
  // For simplicity: If keyManager returns null (all blocked), we wait.

  const currentKey = keyManager.getKey();
  if (!currentKey) return "";

  try {
    const genAI = new GoogleGenerativeAI(currentKey);
    const model = genAI.getGenerativeModel({ model: CHAT_MODEL });

    // Construct prompt with instruction
    const userPrompt = instruction
      ? `${instruction}\n\nUSER: ${prompt}`
      : prompt;

    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: userPrompt }] }],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 1000,
      }
    });

    const response = await result.response;
    return response.text().trim();
  } catch (err) {
    if (err.message && (err.message.includes("429") || err.message.includes("Quota exceeded") || err.message.includes("503") || err.message.includes("500"))) {
      console.warn(`[Gemini] Temporary error / rate limit on key ${keyManager.getCurrentKeyMasked()}: ${err.message.substring(0, 60)}...`);

      // ROTATE KEY AND RETRY
      if (keyManager.rotate()) {
        console.log(`[Gemini] Retrying with new key...`);
        return callGemini(prompt, instruction); // Recursive retry with new key
      } else {
        // No more keys or rotation failed
        console.error("[Gemini] All keys exhausted/rate limited.");
        return "";
      }
    }
    console.error("[Gemini] callGemini error:", err.message);
    return "";
  }
}

/* ---------------------------------------------------------
   LAYER 0 — Basic pre-clean
--------------------------------------------------------- */
function preClean(text) {
  if (!text) return "";
  return text
    .replace(/[\u200B-\u200D\uFEFF]/g, "") // zero-width chars
    .replace(/[""„]/g, '"')
    .replace(/[''']/g, "'")
    .replace(/[\u{1F300}-\u{1FAFF}]/gu, "") // emojis
    .replace(/\s+/g, " ")
    .trim();
}

/* ---------------------------------------------------------
   LAYER 1 — Word-split fix (merged words)
   Examples:
   - "waterin"    → "water in"
   - "canteenin"  → "canteen in"
   - "hostelstudents" → "hostel students"
--------------------------------------------------------- */
function splitMergedWords(text) {
  const vocabWords = vocabService.getArray();
  const vocabSet = vocabService.getSet();

  if (!vocabWords || !vocabWords.length) return text;

  return text
    .split(/\s+/)
    .map((word) => {
      const lower = word.toLowerCase();
      if (vocabSet.has(lower)) return word;

      // Try splitting into 2 vocab words
      for (let i = 3; i < lower.length - 2; i++) {
        const left = lower.slice(0, i);
        const right = lower.slice(i);

        if (vocabSet.has(left) && vocabSet.has(right)) {
          return `${left} ${right}`;
        }
      }

      return word;
    })
    .join(" ");
}

/* ---------------------------------------------------------
   LAYER 2 — Local vocab-based spell-fix (safe)
   Important:
   - We SKIP very short words (length < 5) like "text", "test"
     to avoid "text" → "test" mistakes.
--------------------------------------------------------- */
function localSpellFix(text) {
  const vocabWords = vocabService.getArray();
  const vocabSet = vocabService.getSet();

  if (!vocabWords || !vocabWords.length) return text;

  return text
    .split(/\s+/)
    .map((token) => {
      const t = token.toLowerCase();

      // keep very short / non-alpha tokens as is
      if (!/^[a-z]+$/.test(t) || t.length < 5) return token;

      // already known word
      if (vocabSet.has(t)) return token;

      let best = t;
      let bestDist = Infinity;

      for (const v of vocabWords) {
        const d = levenshteinDistance(t, v);
        if (d < bestDist) {
          bestDist = d;
          best = v;
        }
      }

      // Allow up to ~40% of length as distance
      const maxDist = Math.max(1, Math.round(t.length * 0.4));

      if (bestDist <= maxDist) {
        if (token[0] === token[0].toUpperCase()) {
          return best.charAt(0).toUpperCase() + best.slice(1);
        }
        return best;
      }

      return token;
    })
    .join(" ");
}

/* ---------------------------------------------------------
   EXPORT: QUICK CORRECTION (Local Only - FAST)
   Pipeline:
   1) preClean
   2) splitMergedWords
   3) localSpellFix
--------------------------------------------------------- */
export async function quickCorrection(text) {
  if (!text) return "";

  // Ensure vocab is loaded
  await vocabService.load();

  let processed = preClean(text);
  processed = splitMergedWords(processed);
  processed = localSpellFix(processed);

  return processed;
}

/* ---------------------------------------------------------
   EXPORT: SPELLING CORRECTION (IUI v2.5)
   Pipeline:
   1) preClean
   2) splitMergedWords
   3) localSpellFix
   4) LLM spelling (strict, no noun swaps)
--------------------------------------------------------- */
export async function correctSpelling(text) {
  if (!text) return "";

  // ✅ FIX: Ensure vocab is loaded before processing
  await vocabService.load();

  // 1. basic cleaning
  let processed = preClean(text);

  // 2. fix merged words
  processed = splitMergedWords(processed);

  // 3. local vocab-based spell-fix (safe)
  processed = localSpellFix(processed);

  const originalTokens = Array.from(
    new Set(processed.split(/\s+/).map((t) => t.toLowerCase()))
  );

  const inst = `
You are a STRICT spelling corrector for school-related questions.

GOAL:
- Fix ONLY spelling mistakes.
- Optionally fix very small grammar issues (like "is they" → "are they").
- Preserve the original meaning 100%.

VERY IMPORTANT:
- DO NOT replace one noun with a DIFFERENT noun.
- DO NOT change "text books" to "test blocks" or anything similar.
- DO NOT invent new words that were not typed by the user.
- DO NOT add new concepts, places, or items.
- DO NOT remove important words.

You MAY:
Correct spelling mistakes exactly, but do not alter the meaning, replace nouns, add new words, or change the user's intent. Fix only obvious typos, such as "texxt" → "text", "bukks" → "books", "conatct" → "contact", "conatct" → "contact", "deils" → "details".
- Combine obvious pairs: "text books" → "textbooks" (same meaning).
- Fix simple English grammar if needed.

The following logic words MUST NOT CHANGE MEANING:
- "did not"
- "don't"
- "didn't"
- "not"
- "follow"
- "break"
- "obey"
- "rules"

You MUST treat these as FIXED MEANING WORDS.

These original user words must stay the SAME CONCEPT
(you may only fix spelling or spacing for them):
${originalTokens.join(", ")}

Return ONLY the corrected sentence, nothing else.
`;

  try {
    const out = await callGemini(processed, inst);
    if (!out) return processed;

    const trimmed = out.trim();

    const outWords = trimmed.split(/\s+/).length;
    const origWords = processed.split(/\s+/).length;

    // If Gemini shrinks too much, something went wrong → keep processed
    if (outWords < origWords - 3) return processed;

    return trimmed;
  } catch {
    return processed;
  }
}

/* ---------------------------------------------------------
   EXPORT: MEANING NORMALIZER
   Rewrites into a clean English question, preserving meaning.
--------------------------------------------------------- */
/* ---------------------------------------------------------
   EXPORT: MEANING NORMALIZER
   Rewrites into a clean English question, preserving meaning.
--------------------------------------------------------- */
export async function normalizeToMeaning(text) {
  if (!text) return "";

  const cleaned = preClean(text);
  const tokens = cleaned.split(/\s+/).filter(Boolean);

  // If too short → don't risk rewrite unless it looks like a keyword query
  if (tokens.length <= 1) return cleaned;

  const inst = `
You are an expert spell checker for a school chatbot.
Correct the spelling and grammar of the user's query.

INPUT: "${cleaned}"

RULES:
1. Fix typos (e.g. "wesiet" -> "website", "scol" -> "school").
2. DO NOT change the structure of the sentence.
3. DO NOT rewrite keywords into full questions.
   - "contact detaikls" -> "contact details" (NOT "What are the contact details?")
   - "fees pay" -> "fees payment" (NOT "How do I pay fees?")
4. Preserve the user's intent and specific words.

Return ONLY the corrected text.
`;

  try {
    const out = await callGemini(cleaned, inst);
    if (!out) return cleaned;
    return out.trim();
  } catch (err) {
    console.warn("[Normalize] Error:", err.message);
    return cleaned;
  }
}

/* ---------------------------------------------------------
   EXPORT: RAG ANSWER GENERATOR
   Synthesizes answer from specific retrieved context.
--------------------------------------------------------- */
export async function generateAnswerFromContext(userQuery, contextItems) {
  if (!contextItems || contextItems.length === 0) {
    return "I couldn't find specific information about that in my database.";
  }

  // Format context for the LLM
  const contextString = contextItems
    .map((item, idx) => `FACT ${idx + 1}:\nQuestion: "${item.question_text}"\nAnswer: "${item.answer_text}"`)
    .join("\n\n");

  const inst = `
You are the friendly, official AI tour guide and campus assistant for Thiagarajar College.
Use the FACTS below to answer the user's question accurately, warmly, and concisely.

USER QUESTION: "${userQuery}"

AVAILABLE FACTS:
${contextString}

INSTRUCTIONS:
1. Synthesize a single cohesive, natural answer in 1 to 2 clear spoken sentences.
2. Directly answer what the user asked. Do not list separate facts or use bullet points.
3. Sound conversational and warm, suitable for spoken voice narration.
4. Format all times cleanly for speech narration (e.g. "9:00 AM to 6:00 PM" instead of "9.00 AM - 6.00 PM").
5. Do NOT use markdown formatting (no **bold**, no *italic*), and do NOT output raw URLs or bullet lists.
6. If the specific detail is not in the facts, say: "I don't have that specific detail in our college records, but you can inquire at the admissions office or explore our campus facilities."

Answer:
`;

  const normalizeSpeechTimes = (str) => {
    if (!str) return str;
    return str
      .replace(/(\b\d{1,2})\.(\d{2})\s*(AM|PM|am|pm)\b/g, '$1:$2 $3')
      .replace(/(\b\d{1,2}(?::\d{2})?\s*(?:AM|PM|am|pm)?)\s*[-–—]\s*(\b\d{1,2}(?::\d{2})?\s*(?:AM|PM|am|pm)\b)/gi, '$1 to $2');
  };

  try {
    const out = await callGemini(userQuery, inst);
    if (!out) throw new Error("Gemini returned empty response (Rate Limit or Error)");
    // Remove markdown formatting (**bold**, *italic*) and format times cleanly
    const cleaned = out.replace(/\*\*/g, "").replace(/\*/g, "").replace(/__/g, "").trim();
    return normalizeSpeechTimes(cleaned);
  } catch (err) {
    console.error("[Gemini RAG] Error:", err.message);
    // Fallback: return the first match's answer with normalized times
    const fallbackAnswer = contextItems[0]?.answer_text || "I'm having trouble processing that right now.";
    return normalizeSpeechTimes(fallbackAnswer);
  }
}

/* ---------------------------------------------------------
   EXPORT: SUMMARY
--------------------------------------------------------- */
export async function summarizeAnswers(text) {
  const inst = `
Summarize the following Q&A pairs into short, simple bullet points.
Do NOT add any new facts.
Return ONLY the bullet list.
`;

  const out = await callGemini(text, inst);
  return out || text;
}

/* ---------------------------------------------------------
   EXPORT: GENERAL QUESTION FALLBACK (school-safe)
--------------------------------------------------------- */
export async function answerGeneralQuestion(text) {
  const inst = `
You are a safe assistant for Montfort ICSE School.

If the question is about Montfort ICSE School but the exact information
is NOT present in the school's official data or FAQ, you MUST reply EXACTLY:

"I don't have that information in my data. Please visit https://montforticse.in/ or contact the school office for official details."

If the question is clearly about something ELSE (not Montfort ICSE School),
you may answer normally with a brief, helpful reply.

Return ONLY the final answer text.
`;

  const out = await callGemini(text, inst);

  return (
    out ||
    "I don't have that information in my data. Please visit https://montforticse.in/ or contact the school office for official details."
  );
}

/* ---------------------------------------------------------
   EXPORT: EMBEDDINGS
--------------------------------------------------------- */
/* ---------------------------------------------------------
   EXPORT: EMBEDDINGS (SDK Version)
--------------------------------------------------------- */
export async function embedText(text) {
  const currentKey = keyManager.getKey();
  if (!currentKey) return [];

  try {
    const genAI = new GoogleGenerativeAI(currentKey);
    const model = genAI.getGenerativeModel({ model: EMBED_MODEL });
    const result = await model.embedContent({
      content: { parts: [{ text }] },
      outputDimensionality: 768   // Match existing DB vectors
    });
    return result.embedding.values || [];
  } catch (err) {
    console.error("[Gemini] embedText error:", err.message);
    if (err.message && (err.message.includes("429") || err.message.includes("Quota exceeded"))) {
      console.warn(`[Gemini Embed] Rate Limit on key ${keyManager.getCurrentKeyMasked()}`);
      if (keyManager.rotate()) {
        console.log(`[Gemini Embed] Retrying with new key...`);
        return embedText(text); // Recursive retry
      }
    }
    return [];
  }
}