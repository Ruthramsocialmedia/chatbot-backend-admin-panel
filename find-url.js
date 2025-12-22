import { supabaseAdmin } from './services/supabaseService.js';

async function findUrl() {
    console.log("Searching for 'montforticse.in' in answers...");

    const { data, error } = await supabaseAdmin
        .from('answers')
        .select('answer_text, intent_id, intents(name)')
        .ilike('answer_text', '%montforticse.in%');

    if (error) {
        console.error("Error:", error);
    } else {
        if (data.length === 0) {
            console.log("No answer contains the website URL.");
        } else {
            console.log(`Found ${data.length} answers containing the URL:`);
            data.forEach(d => {
                console.log(`- [${d.intents?.name}] ${d.answer_text.substring(0, 50)}...`);
            });
        }
    }
}

findUrl();
