import { supabaseAdmin } from './supabaseService.js';
import { aiService } from './aiService.js';

export const duplicateService = {
    // Scan specific questions or all drafts
    async scanForDuplicates() {
        console.log('[DuplicateScan] Starting scan...');

        // 1. Fetch all DRAFT questions (we only care if new drafts look like existing stuff)
        // We assume published stuff is already "clean" (or we'd have flagged it before publish).
        const { data: drafts, error: dErr } = await supabaseAdmin
            .from('questions')
            .select(`
            id, 
            question_text, 
            intent_id,
            intents!inner(status) 
        `)
            .eq('intents.status', 'draft')
            .eq('is_active', true);

        if (dErr) throw dErr;
        console.log(`[DuplicateScan] Found ${drafts.length} drafts to check.`);

        let flagsCreated = 0;

        for (const draft of drafts) {
            // 2. Generate Embedding for the draft
            const vector = await aiService.generateEmbedding(draft.question_text);
            if (!vector) continue;

            // 3. Search for matches in the WHOLE DB (published OR other drafts)
            // using our RPC 'match_embeddings' logic, BUT we can't use 'match_embeddings' directly
            // because that function filters for 'published' only usually, or we need a new RPC.
            // Actually, we can just use the vector extension query via raw Supabase RPC if we make a generic one,
            // or effectively we have to do the search. 
            // A better way for Admin tools: Use a specific RPC for duplicate detection that sees EVERYTHING.

            // Let's call a new RPC or use existing if modified?
            // Existing `match_embeddings` checks `e.deleted_at is null` and `a.is_active = true`.
            // It joins intents/answers. It might be too restrictive (we want to match against QUESTIONS only).

            // We'll create a lightweight RPC `find_similar_questions` in the next step.
            const { data: matches, error: mErr } = await supabaseAdmin.rpc('find_similar_questions', {
                query_embedding: vector,
                match_threshold: 0.90, // High threshold for "Duplicate" warning
                match_count: 5
            });

            if (mErr) {
                console.error('[DuplicateScan] Search error:', mErr);
                continue;
            }

            // 4. Process matches
            for (const match of matches) {
                // Ignore self
                if (match.id === draft.id) continue;

                // Check if flag already exists
                const { data: existing } = await supabaseAdmin
                    .from('duplicate_flags')
                    .select('id')
                    .eq('source_question_id', draft.id)
                    .eq('matched_question_id', match.id)
                    .single();

                if (!existing) {
                    // Create Flag
                    await supabaseAdmin.from('duplicate_flags').insert({
                        source_intent_id: draft.intent_id,
                        source_question_id: draft.id,
                        matched_intent_id: match.intent_id,
                        matched_question_id: match.id,
                        similarity: match.similarity,
                        resolution: 'unresolved'
                    });
                    flagsCreated++;
                    console.log(`[DuplicateScan] Flagged: "${draft.question_text}" vs "${match.question_text}"`);
                }
            }
        }

        return { draftsChecked: drafts.length, flagsCreated };
    }
};
