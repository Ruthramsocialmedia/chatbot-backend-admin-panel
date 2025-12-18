// generate-embeddings.js — MEMORY SAFE v2.0
// JSONL output format for streaming, no large JSON arrays

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import { ENV } from "../config/env.js";
import { embedText } from "../services/geminiService.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ✅ FIX: Use .jsonl extension for streaming format
const RAW_INPUT_PATH = path.join(__dirname, "school-data.json");
const UNDERSTOOD_OUTPUT_PATH = path.join(__dirname, "school-data-understood.jsonl"); // .jsonl
const EMBEDDINGS_OUTPUT_PATH = path.join(__dirname, "embeddings.jsonl"); // .jsonl

/* ---------------------------------------------------------
   Build semantic entry
--------------------------------------------------------- */
function buildSemanticEntry(intent, question, answer, index) {
  const q = question.trim();
  const a = answer.trim();

  const semanticBlock = [
    `This is official Montfort ICSE School FAQ content.`,
    `Intent: "${intent}"`,
    `User question variation: "${q}".`,
    `Verified school answer: "${a}".`,
    `Do NOT change meaning of the answer.`,
  ];

  const tokens = `${q} ${a}`
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(t => t.length >= 4);

  const keywords = [...new Set(tokens)].join(", ");

  const embeddingText =
    `INTENT: ${intent}\n` +
    `QUESTION: ${q}\n` +
    `ANSWER: ${a}\n\n` +
    `MEANING BLOCK: ${semanticBlock.join(" ")}\n\n` +
    `KEYWORDS: ${keywords}, montfort, icse, school`;

  return {
    id: `${intent}_q${index}`,
    intent,
    question: q,
    answer: a,
    embedding_text: embeddingText,
    keyword: keywords,
  };
}

/* ---------------------------------------------------------
   MAIN (REAL-TIME / STREAMING)
--------------------------------------------------------- */
async function main() {
  if (!ENV.GEMINI_API_KEY) {
    console.error("❌ GEMINI_API_KEY missing");
    process.exit(1);
  }

  console.log("📥 Loading school-data.json");
  const raw = fs.readFileSync(RAW_INPUT_PATH, "utf8");
  const items = JSON.parse(raw);

  // ✅ FIX: Create write streams (no opening brackets)
  const understoodStream = fs.createWriteStream(UNDERSTOOD_OUTPUT_PATH);
  const embeddingStream = fs.createWriteStream(EMBEDDINGS_OUTPUT_PATH);

  let counter = 0;
  let successCount = 0;
  let errorCount = 0;

  console.log("🚀 Starting embedding generation...");

  for (const intentBlock of items) {
    const { intent, answer, questions } = intentBlock;

    if (!intent || !answer || !Array.isArray(questions)) {
      console.warn(`⚠️ Skipping invalid intent block: ${intent || 'unknown'}`);
      continue;
    }

    for (const q of questions) {
      const entry = buildSemanticEntry(intent, q, answer, counter);

      console.log(`🔍 Processing ${counter + 1}: ${q.substring(0, 60)}...`);

      let vector = [];
      try {
        vector = await embedText(entry.embedding_text);
        
        if (!vector || vector.length === 0) {
          console.error(`❌ Empty vector for: ${q.substring(0, 40)}...`);
          errorCount++;
          continue;
        }
      } catch (err) {
        console.error(`❌ Embedding failed for "${q.substring(0, 40)}...":`, err.message);
        errorCount++;
        continue;
      }

      const understoodObj = {
        id: entry.id,
        intent: entry.intent,
        question: entry.question,
        answer: entry.answer,
        keyword: entry.keyword,
      };

      const embeddingObj = {
        ...understoodObj,
        vector,
      };

      // ✅ FIX: Write JSONL format (one object per line)
      // No opening/closing brackets, no commas
      understoodStream.write(JSON.stringify(understoodObj) + "\n");
      embeddingStream.write(JSON.stringify(embeddingObj) + "\n");

      counter++;
      successCount++;

      // Small delay to avoid rate limiting
      if (counter % 10 === 0) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
  }

  // ✅ FIX: Just end streams (no closing brackets)
  understoodStream.end();
  embeddingStream.end();

  console.log("\n🎉 EMBEDDING GENERATION COMPLETE");
  console.log("=" .repeat(50));
  console.log(`📊 Total processed: ${counter}`);
  console.log(`✅ Successful: ${successCount}`);
  console.log(`❌ Failed: ${errorCount}`);
  console.log(`📁 Output files:`);
  console.log(`   - ${UNDERSTOOD_OUTPUT_PATH}`);
  console.log(`   - ${EMBEDDINGS_OUTPUT_PATH}`);
  console.log("\n⚠️  IMPORTANT: Files are in JSONL format (.jsonl)");
  console.log("   Use streaming/line-by-line parsing, not JSON.parse()");
}

// Handle script errors
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  process.exit(1);
});

// Run the main function
main().catch((error) => {
  console.error('❌ Fatal error in main():', error);
  process.exit(1);
});