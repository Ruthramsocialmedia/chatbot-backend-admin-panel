import { supabaseAdmin } from './services/supabaseService.js';

async function inspect() {
    console.log("Inspecting 'embeddings' table...");
    const { data, error } = await supabaseAdmin.from('embeddings').select('*').limit(1);

    if (error) {
        console.error("Error:", error);
    } else {
        if (data.length > 0) {
            console.log("Columns:", Object.keys(data[0]));
        } else {
            console.log("Table is empty (or no permission).");
            // If empty, I can't see keys. But setup_rpc.sql implied table exists.
        }
    }
}

inspect();
