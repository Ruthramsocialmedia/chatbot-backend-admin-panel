import { supabaseAdmin } from '../services/supabaseService.js';
import { aiService } from '../services/aiService.js';

export const publishIntent = async (req, res) => {
    // Phase 4 Update: Support bulk publishing
    // Expect: { intentIds: ["uuid1", "uuid2"] } OR (legacy) { intentId: "uuid" }
    let { intentId, intentIds } = req.body;

    // Normalize to array
    if (intentId) intentIds = [intentId];
    if (!intentIds || !Array.isArray(intentIds) || intentIds.length === 0) {
        return res.status(400).json({ error: 'Missing intentIds' });
    }

    const results = {
        total: intentIds.length,
        success: 0,
        failed: 0,
        details: []
    };

    try {
        console.log(`[BulkPublish] Processing ${intentIds.length} intents...`);

        // Loop through each intent
        // We do this sequentially to respect rate limits of Gemini/OpenAI
        for (const id of intentIds) {
            try {
                const result = await processSingleIntent(id);
                results.success++;
                results.details.push({ id, status: 'success', slug: result.slug });
            } catch (err) {
                console.error(`[BulkPublish] Failed for ${id}:`, err.message);
                results.failed++;
                results.details.push({ id, status: 'failed', error: err.message });
            }
        }

        return res.json({ success: true, ...results });

    } catch (err) {
        console.error('[BulkPublish] Critical Error:', err);
        return res.status(500).json({ error: 'Internal Server Error', details: err.message });
    }
};

// Helper function to process one intent (Refactored from previous version)
async function processSingleIntent(intentId) {
    // 1. Fetch Intent Data
    const { data: intent, error: iErr } = await supabaseAdmin
        .from('intents')
        .select('id, status, slug, name')
        .eq('id', intentId)
        .single();

    if (iErr || !intent) throw new Error('Intent not found');

    // 2. State Transition (Draft -> Published)
    // Validate 9 Qs + 1 A using DB validation triggers
    if (intent.status === 'draft') {
        const { error: updateErr } = await supabaseAdmin
            .from('intents')
            .update({ status: 'published' })
            .eq('id', intentId);

        if (updateErr) throw new Error('Validation Failed: ' + updateErr.message);
    }

    // 3. Fetch Active Questions
    const { data: questions, error: qErr } = await supabaseAdmin
        .from('questions')
        .select('id, question_text')
        .eq('intent_id', intentId)
        .eq('is_active', true)
        .eq('is_active', true);

    if (qErr || !questions || questions.length === 0) throw new Error('No active questions found');

    // 4. Generate Embeddings
    const embeddingModel = "text-embedding-004"; // Gemini
    let embeddedCount = 0;

    for (const q of questions) {
        const vector = await aiService.generateEmbedding(q.question_text);
        if (vector) {
            const { error: insErr } = await supabaseAdmin.from('embeddings').upsert({
                intent_id: intentId,
                question_id: q.id,
                model: embeddingModel,
                dims: vector.length,
                vector: vector
            }, { onConflict: 'question_id, model' });

            if (insErr) {
                console.error(`DB Error QID ${q.id}:`, insErr);
            } else {
                embeddedCount++;
            }
        }
    }

    return { slug: intent.slug, count: embeddedCount };
}
