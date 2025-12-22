import { correctSpelling } from './services/geminiService.js';

async function test() {
    console.log("Testing Fuzzy Matching...");
    const inputs = [
        "is thera canten in the canpus",
        "wat is the festivl hildays",
        "do i hav to waer uniform"
    ];

    for (const input of inputs) {
        console.log(`\nInput: "${input}"`);
        const start = Date.now();
        const corrected = await correctSpelling(input);
        console.log(`Output: "${corrected}"`);
        console.log(`Time: ${Date.now() - start}ms`);
    }
}

test();
