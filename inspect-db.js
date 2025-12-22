import { supabaseAdmin } from './services/supabaseService.js';

async function inspect() {
    console.log("Inspecting 'questions' table...");
    const { data: qData, error: qError } = await supabaseAdmin.from('questions').select('*').limit(1);
    if (qError) {
        console.error("Questions Error:", qError);
    } else {
        if (qData.length > 0) {
            console.log("Questions Columns:", Object.keys(qData[0]));
            console.log("Sample Question:", qData[0]);
        } else {
            console.log("Questions Table is empty.");
        }
    }
}

inspect();
