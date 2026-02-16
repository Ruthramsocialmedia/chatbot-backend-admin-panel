import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
);

async function wipeDatabase() {
    console.log('=== WIPE DB: Deleting ALL data ===\n');

    // Order matters because of FK constraints
    const tables = [
        'embeddings',
        'answers',
        'duplicate_flags',
        'questions',
        'intents'
    ];

    for (const table of tables) {
        console.log(`Deleting from ${table}...`);
        const { error, count } = await supabase
            .from(table)
            .delete()
            .neq('id', 0); // Hack to delete all rows if ID is int, for UUID use .not('id', 'is', null)

        // For UUID tables, .neq('id', 0) fails. Let's use .not('id', 'is', null) which works for both
        if (error && error.code === '22P02') {
            // UUID error, retry with correct filter
            const { error: retryErr } = await supabase
                .from(table)
                .delete()
                .not('id', 'is', null);

            if (retryErr) {
                console.error(`  ❌ Failed to delete ${table}:`, retryErr.message);
            } else {
                console.log(`  ✅ Cleared ${table}`);
            }
        } else if (error) {
            console.error(`  ❌ Failed to delete ${table}:`, error.message);
        } else {
            console.log(`  ✅ Cleared ${table}`);
        }
    }
    console.log('\n=== DONE ===');
}

wipeDatabase().catch(console.error);
