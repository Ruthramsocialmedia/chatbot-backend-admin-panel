import { levenshteinDistance } from './utils/stringUtils.js';
import { vocabService } from './services/vocabService.js';

async function testRefactor() {
    console.log("--- Testing stringUtils ---");
    const dist = levenshteinDistance("kitten", "sitting");
    console.log(`Levenshtein 'kitten' vs 'sitting' (Expected 3): ${dist}`);
    if (dist === 3) console.log("✅ Levenshtein Working");
    else console.error("❌ Levenshtein Failed");

    console.log("\n--- Testing vocabService ---");
    // Mocking supabaseAdmin for safety (or we can just run it if we trust the read-only nature)
    // For now, let's just try to load and see if it crashes or connects.
    // NOTE: This requires DB connection.
    try {
        const result = await vocabService.refresh();
        if (result.success) {
            console.log(`✅ Vocab Refresh Success. Loaded ${result.count} words.`);
            console.log("Sample words:", vocabService.getArray().slice(0, 5));
        } else {
            console.error("❌ Vocab Refresh Failed:", result.error);
        }
    } catch (err) {
        console.error("❌ Vocab Service Crash:", err);
    }
}

testRefactor();
