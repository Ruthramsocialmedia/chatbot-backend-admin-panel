
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
);

async function main() {
    console.log("=== SCANNING FOR CORRUPTED EMBEDDINGS ===\n");

    const { count, error: countErr } = await supabase
        .from('embeddings')
        .select('*', { count: 'exact', head: true });

    if (countErr) {
        console.error("Error getting count:", countErr);
        return;
    }
    console.log(`Total rows to scan: ${count}`);

    // Pagination to avoid memory issues
    const PAGE_SIZE = 1000;
    let corruptedCount = 0;

    for (let i = 0; i < count; i += PAGE_SIZE) {
        const { data: rows, error } = await supabase
            .from('embeddings')
            .select('id, question_id, dims, vector')
            .range(i, i + PAGE_SIZE - 1);

        if (error) {
            console.error(`Error fetching range ${i}-${i + PAGE_SIZE}:`, error);
            continue;
        }

        for (const row of rows) {
            let reason = null;
            let vec = row.vector;

            if (typeof vec === 'string') {
                try {
                    vec = JSON.parse(vec);
                } catch (e) {
                    reason = "Vector string parse error";
                }
            }

            if (!reason) {
                if (!vec) reason = "Vector is NULL/Empty";
                else if (!Array.isArray(vec)) reason = "Vector is not an array";
                else if (vec.length === 0) reason = "Vector is EMPTY array";
                else if (vec.length !== 768) reason = `Vector dim mismatch (found ${vec.length}, expected 768)`;
                else if (vec.every(v => v === 0)) reason = "Vector is all ZEROS";
                else if (vec.some(v => v === null || isNaN(v))) reason = "Vector contains NaN or NULL values";
            }

            if (reason) {
                console.log(`❌ CORRUPTED: ID ${row.id} (QID ${row.question_id}) -> ${reason}`);
                corruptedCount++;
            }
        }

        process.stdout.write(`\rScanned ${Math.min(i + PAGE_SIZE, count)} / ${count}...`);
    }

    console.log(`\n\n=== SCAN COMPLETE ===`);
    console.log(`Found ${corruptedCount} corrupted embeddings.`);
}

main().catch(console.error);
