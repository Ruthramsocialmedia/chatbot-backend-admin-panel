import { supabaseAdmin } from './services/supabaseService.js';

async function inspect() {
    console.log("Searching for 'website' or 'email' in questions...");

    const { data: qData, error } = await supabaseAdmin
        .from('questions')
        .select(`
            id,
            question_text,
            intents (
                name,
                slug
            )
        `)
        .or('question_text.ilike.%contact%,question_text.ilike.%address%,question_text.ilike.%url%')
        .limit(20);

    if (error) {
        console.error("Error:", error);
    } else {
        qData.forEach(q => {
            console.log(`[${q.intents?.name}] ${q.question_text}`);
        });
    }
}

inspect();
