import { supabaseAdmin } from './services/supabaseService.js';
import { aiService } from './services/aiService.js';
import { GoogleGenerativeAI } from "@google/generative-ai";
// Ensure aiService is working with correct model
// We rely on aiService.generateEmbedding from previous fixes

const NAMED_INTENT = {
    slug: 'school_website',
    name: 'School Website',
    answer: "The official Montfort ICSE website is https://montforticse.in/",
    questions: [
        "What is the official school website?",
        "school website link",
        "website url",
        "official website",
        "web address",
        "site url",
        "montfort website"
    ]
};

async function run() {
    console.log(`Fixing Intent: ${NAMED_INTENT.name}...`);

    // 1. Get or Create Intent
    let intentId;
    const { data: existing } = await supabaseAdmin
        .from('intents')
        .select('id')
        .eq('slug', NAMED_INTENT.slug)
        .single();

    if (existing) {
        console.log("Intent already exists, using ID:", existing.id);
        intentId = existing.id;
    } else {
        const { data: newIntent, error: iErr } = await supabaseAdmin
            .from('intents')
            .insert({
                name: NAMED_INTENT.name,
                slug: NAMED_INTENT.slug,
                status: 'published'
            })
            .select()
            .single();

        if (iErr) {
            console.error("Failed to create intent:", iErr);
            return;
        }
        console.log("Created Intent:", newIntent.id);
        intentId = newIntent.id;
    }

    // 2. Upsert Answer
    const { error: aErr } = await supabaseAdmin
        .from('answers')
        .upsert({
            intent_id: intentId,
            answer_text: NAMED_INTENT.answer,
            is_active: true
        }, { onConflict: 'intent_id' }); // Assuming one answer per intent mostly

    if (aErr) console.error("Answer Upsert Error:", aErr);
    else console.log("Answer updated.");

    // 3. Process Questions
    for (const qText of NAMED_INTENT.questions) {
        // Insert Question
        let questionId;

        // check existing to avoid duplicates if unique constraint missing
        const { data: existQ } = await supabaseAdmin
            .from('questions')
            .select('id')
            .eq('intent_id', intentId)
            .ilike('question_text', qText)
            .single();

        if (existQ) {
            questionId = existQ.id;
            console.log(`Question exists: "${qText}"`);
        } else {
            const { data: newQ, error: qErr } = await supabaseAdmin
                .from('questions')
                .insert({
                    intent_id: intentId,
                    question_text: qText,
                    is_active: true
                })
                .select()
                .single();

            if (qErr) {
                console.error(`Failed to insert question "${qText}":`, qErr);
                continue;
            }
            questionId = newQ.id;
            console.log(`Created Question: "${qText}"`);
        }

        // Generate Embedding
        console.log(`Generating embedding for: "${qText}"`);
        const vector = await aiService.generateEmbedding(qText);

        if (!vector) {
            console.error("Failed to generate embedding (Gemini error?)");
            continue;
        }

        // Upsert Embedding
        const { error: emErr } = await supabaseAdmin
            .from('embeddings')
            .upsert({
                intent_id: intentId,
                question_id: questionId,
                model: 'text-embedding-004',
                dims: vector.length,
                vector: vector
            }, { onConflict: 'question_id, model' });

        if (emErr) console.error("Embedding DB Error:", emErr);
        else console.log("Embedding saved.");

        // Sleep to avoid rate limits
        await new Promise(r => setTimeout(r, 500));
    }

    console.log("Legacy Data Fix Complete!");
}

run();
