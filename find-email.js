import { supabaseAdmin } from './services/supabaseService.js';

async function findEmail() {
    console.log("Searching for 'email' or '@' in answers...");

    const { data, error } = await supabaseAdmin
        .from('answers')
        .select('answer_text, intent_id, intents(name)')
        .or('answer_text.ilike.%email%,answer_text.ilike.%@%');

    if (error) {
        console.error("Error:", error);
    } else {
        if (data.length === 0) {
            console.log("No answer contains 'email' or '@'.");
        } else {
            console.log(`Found ${data.length} answers:`);
            data.forEach(d => {
                console.log(`- [${d.intents?.name}] ${d.answer_text}`);
            });
        }
    }
}

findEmail();
