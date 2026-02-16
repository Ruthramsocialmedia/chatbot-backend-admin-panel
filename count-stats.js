import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
);

async function countRows(table) {
    const { count, error } = await supabase
        .from(table)
        .select('*', { count: 'exact', head: true });

    if (error) {
        console.error(`Error counting ${table}:`, error.message);
        return 'Error';
    }
    return count;
}

async function main() {
    console.log('=== Database Row Counts ===');
    const tables = ['answers', 'duplicate_flags', 'embeddings', 'intents', 'questions'];

    for (const table of tables) {
        const count = await countRows(table);
        console.log(`${table}: ${count}`);
    }
}

main().catch(console.error);
