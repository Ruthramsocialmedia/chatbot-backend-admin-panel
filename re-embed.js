/**
 * re-embed.js — Regenerate ALL embeddings using gemini-embedding-001
 * 
 * SAFE TO RE-RUN: Skips questions that already have embeddings.
 * Run: node re-embed.js
 */
import { createClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
);

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const embedModel = genAI.getGenerativeModel({ model: 'gemini-embedding-001' });

const EMBED_MODEL_NAME = 'gemini-embedding-001';
const TARGET_DIMS = 768;
const RATE_LIMIT_DELAY = 300; // ms between calls

async function generateEmbedding(text) {
    const result = await embedModel.embedContent({
        content: { parts: [{ text: text.replace(/\n/g, ' ') }] },
        outputDimensionality: TARGET_DIMS
    });
    return result.embedding.values;
}

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
    console.log('=== RE-EMBED: Regenerating embeddings (resume-safe) ===\n');

    // 1. Fetch all intents (for logging slug names)
    const { data: intents, error: intentErr } = await supabase
        .from('intents')
        .select('id, slug, status');

    if (intentErr) {
        console.error('Failed to fetch intents:', intentErr);
        process.exit(1);
    }
    console.log(`Found ${intents.length} intents.\n`);

    // 2. Fetch ALL active questions
    const { data: questions, error: qErr } = await supabase
        .from('questions')
        .select('id, intent_id, question_text')
        .eq('is_active', true);

    if (qErr) {
        console.error('Failed to fetch questions:', qErr);
        process.exit(1);
    }
    console.log(`Found ${questions.length} active questions.\n`);

    // 3. Fetch existing embeddings to know which to skip
    const { data: existingEmbeddings, error: embErr } = await supabase
        .from('embeddings')
        .select('question_id, model')
        .eq('model', EMBED_MODEL_NAME);

    const alreadyDone = new Set();
    if (!embErr && existingEmbeddings) {
        existingEmbeddings.forEach(e => alreadyDone.add(e.question_id));
    }
    console.log(`Already embedded: ${alreadyDone.size} (will skip these).\n`);

    const toProcess = questions.filter(q => !alreadyDone.has(q.id));
    console.log(`Remaining to embed: ${toProcess.length}\n`);

    if (toProcess.length === 0) {
        console.log('✅ All questions already embedded! Nothing to do.');
        return;
    }

    // 4. Generate new embeddings
    let successCount = 0;
    let errorCount = 0;
    let retryCount = 0;

    for (let i = 0; i < toProcess.length; i++) {
        const q = toProcess[i];
        const intent = intents.find(it => it.id === q.intent_id);

        try {
            const vector = await generateEmbedding(q.question_text);

            const { error: insErr } = await supabase.from('embeddings').upsert({
                intent_id: q.intent_id,
                question_id: q.id,
                model: EMBED_MODEL_NAME,
                dims: vector.length,
                vector: vector
            }, { onConflict: 'question_id, model' });

            if (insErr) {
                console.error(`  ❌ DB Error QID ${q.id}:`, insErr.message);
                errorCount++;
            } else {
                successCount++;
                if (successCount % 10 === 0 || successCount <= 5) {
                    console.log(`  ✅ [${successCount}/${toProcess.length}] "${q.question_text}" (${intent?.slug || 'unknown'})`);
                }
            }
        } catch (err) {
            console.error(`  ❌ Error QID ${q.id}: ${err.message}`);
            errorCount++;

            // If rate limited, wait and retry
            // If rate limited, STOP immediately
            if (err.status === 429 || (err.message && (err.message.includes('429') || err.message.includes('Quota exceeded')))) {
                console.error(`\n🚨 GEN-AI RATE LIMIT REACHED! Stopping immediately.`);
                console.error(`   Server message: ${err.message}`);
                console.error(`   Restart this script later to resume from where you left off.`);
                process.exit(1);
            }
        }

        await sleep(RATE_LIMIT_DELAY);
    }

    console.log(`\n=== DONE ===`);
    console.log(`✅ Success: ${successCount}`);
    console.log(`❌ Errors:  ${errorCount}`);
    console.log(`⏳ Retries: ${retryCount}`);
    console.log(`Total processed: ${toProcess.length}`);
    console.log(`Previously done:  ${alreadyDone.size}`);
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
