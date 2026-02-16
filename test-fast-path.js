// test-fast-path.js
// Simulates Chat Controller logic to verify Fast Path vs Slow Path

const mockReq = (question) => ({
    body: { question }
});

const mockRes = {
    json: (data) => console.log("Response:", JSON.stringify(data, null, 2)),
    status: (code) => ({ json: (data) => console.log(`Error ${code}:`, data) })
};

// Mock Dependencies
const mockAiService = {
    quickCorrection: async (q) => q.toLowerCase().trim(), // Simple echo
    generateEmbedding: async (q) => [0.1, 0.2, 0.3], // Dummy vector
    correctGrammar: async (q) => q + " (corrected)" // Simulate change
};

const mockSupabase = {
    rpc: async (name, params) => {
        console.log(`[RPC] ${name} called.`);
        // Simulate results based on dummy vector or query?
        // Let's just return what we need for the test.
        // We can't easily inject the return value deep inside without a proper mock framework.
        // So this script might be limited if running against ACTUAL controller file.
        return { data: [], error: null };
    },
    from: () => ({ select: () => ({ in: () => ({ eq: () => ({ data: [] }) }) }) })
};

// Real validation requires running the ACTUAL server and hitting it.
// I will create a client script that hits localhost:3000 instead.

import fetch from 'node-fetch';

async function testServer() {
    console.log("--- Testing Fast Path ---");
    const t0 = Date.now();

    // 1. Ask a question we know exists (should be FAST)
    try {
        const res = await fetch('http://localhost:3000/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ question: "hostel fees" }) // Simple, high confidence likely
        });
        const data = await res.json();
        const t1 = Date.now();
        console.log(`[Fast?] Time: ${t1 - t0}ms`);
        console.log("Answer:", data.answer);
    } catch (e) {
        console.error("Server down or error:", e.message);
    }

    console.log("\n--- Testing Slow Path ---");
    const t2 = Date.now();
    // 2. Ask a messy question (should be SLOW)
    try {
        const res = await fetch('http://localhost:3000/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ question: "wht iz da hstl feez structure?" })
        });
        const data = await res.json();
        const t3 = Date.now();
        console.log(`[Slow?] Time: ${t3 - t2}ms`);
        console.log("Answer:", data.answer);
    } catch (e) {
        console.error("Server down or error:", e.message);
    }
}

testServer();
