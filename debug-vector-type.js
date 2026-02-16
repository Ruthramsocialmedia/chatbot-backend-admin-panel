
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
);

async function main() {
    const { data, error } = await supabase
        .from('embeddings')
        .select('vector')
        .limit(1);

    if (error) {
        console.error(error);
        return;
    }

    if (data && data.length > 0) {
        const v = data[0].vector;
        console.log("Type:", typeof v);
        console.log("Is Array:", Array.isArray(v));
        console.log("Value preview:", JSON.stringify(v).substring(0, 100));
    } else {
        console.log("No data found.");
    }
}

main();
