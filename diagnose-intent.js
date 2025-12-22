import { supabaseAdmin } from './services/supabaseService.js';

async function diagnose() {
    // 1. Get Intent ID
    const { data: intents } = await supabaseAdmin
        .from('intents')
        .select('id, name')
        .ilike('name', '%official montfort icse website%');

    if (!intents || intents.length === 0) {
        console.log("Intent not found by name.");
        return;
    }

    const intentId = intents[0].id;
    console.log(`Intent ID: ${intentId} (${intents[0].name})`);

    // 2. Get Questions
    const { data: questions } = await supabaseAdmin
        .from('questions')
        .select('id, question_text')
        .eq('intent_id', intentId);

    if (!questions || questions.length === 0) {
        console.log("No questions found for this intent.");
        return;
    }

    console.log(`Found ${questions.length} questions:`);
    const qIds = [];
    questions.forEach(q => {
        console.log(`- [${q.id}] ${q.question_text}`);
        qIds.push(q.id);
    });

    // 3. Check Embeddings
    const { data: embeddings } = await supabaseAdmin
        .from('embeddings')
        .select('question_id, dims')
        .in('question_id', qIds);

    console.log(`Found ${embeddings?.length || 0} embeddings for these questions.`);
    if (embeddings) {
        embeddings.forEach(e => console.log(`- Emb for Q [${e.question_id}]: ${e.dims} dims`));
    }
}

diagnose();
