import { normalizeToMeaning, generateAnswerFromContext } from './services/geminiService.js';
import { supabaseAdmin } from './services/supabaseService.js';
import { aiService } from './services/aiService.js';

async function test() {
    console.log("--- Testing Contact Details ---");
    const input = "contact details";
    const normalized = await normalizeToMeaning(input);
    console.log(`Normalized: "${normalized}"`);

    const queryVector = await aiService.generateEmbedding(normalized);
    const { data: matches } = await supabaseAdmin.rpc('match_embeddings', {
        query_embedding: queryVector,
        match_threshold: 0.45,
        match_count: 5
    });

    if (matches && matches.length > 0) {
        console.log(`Found ${matches.length} DB matches.`);
        const intentIds = [...new Set(matches.map(m => m.intent_id))];
        const { data: answersData } = await supabaseAdmin
            .from('answers')
            .select('intent_id, answer_text')
            .in('intent_id', intentIds)
            .eq('is_active', true);

        const contextItems = matches.map(m => {
            const ans = answersData?.find(a => a.intent_id === m.intent_id);
            return {
                question: m.question_text,
                answer: ans?.answer_text || "Answer not found."
            };
        });

        console.log("Context Items:", JSON.stringify(contextItems, null, 2));

        const realAnswer = await generateAnswerFromContext(normalized, contextItems);
        console.log(`\nFinal Answer:\n"${realAnswer}"`);
    } else {
        console.log("No matches found.");
    }
}

test();
