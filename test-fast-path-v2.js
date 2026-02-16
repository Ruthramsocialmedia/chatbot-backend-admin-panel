// test-fast-path-v2.js
// Uses global fetch (Node 18+) or minimal dependency

async function testServer() {
    console.log("Checking server health...");
    try {
        const health = await fetch('http://localhost:3000/');
        const healthData = await health.json();
        console.log("Server Health:", healthData);
    } catch (e) {
        console.error("❌ Server not reachable:", e.message);
        return;
    }

    console.log("\n--- Testing Fast Path (Expect < 300ms) ---");
    const t0 = Date.now();
    try {
        const res = await fetch('http://localhost:3000/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ question: "hostel fees" })
        });
        const data = await res.json();
        const t1 = Date.now();
        console.log(`[Fast Path] Time: ${t1 - t0}ms`);
        console.log("Response Data:", JSON.stringify(data, null, 2));
    } catch (e) {
        console.error("Error:", e.message);
    }

    console.log("\n--- Testing Slow Path (Expect > 1000ms) ---");
    const t2 = Date.now();
    try {
        const res = await fetch('http://localhost:3000/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ question: "wht iz da hstl feez structure?" })
        });
        const data = await res.json();
        const t3 = Date.now();
        console.log(`[Slow Path] Time: ${t3 - t2}ms`);
        console.log("Response Data:", JSON.stringify(data, null, 2));
    } catch (e) {
        console.error("Error:", e.message);
    }
}

testServer();
