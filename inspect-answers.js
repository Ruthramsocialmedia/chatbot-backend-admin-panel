import { supabaseAdmin } from './services/supabaseService.js';

async function inspect() {
    console.log("Inspecting 'answers' table...");
    const { data, error } = await supabaseAdmin.from('answers').select('*').limit(1);

    if (error) {
        console.error("Error:", error);
    } else {
        if (data.length > 0) {
            console.log("Columns:", Object.keys(data[0]));
        } else {
            console.log("Table is empty.");
        }
    }
}

inspect();
