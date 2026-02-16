// test-multikey.js
import { keyManager } from './utils/keyManager.js';

async function testRotation() {
    console.log("--- Testing KeyManager Rotation ---");
    console.log("Initial Key:", keyManager.getCurrentKeyMasked());

    // Simulate Keys if none loaded (Mocking for test)
    if (keyManager.keys.length < 2) {
        console.log("Injecting dummy keys for testing...");
        keyManager.keys.push("dummy-key-2");
        keyManager.keys.push("dummy-key-3");
    }

    console.log(`Total Keys: ${keyManager.keys.length}`);

    // Test Rotation
    const k1 = keyManager.getKey();
    keyManager.rotate();
    const k2 = keyManager.getKey();

    console.log(`Key 1: ${k1}`);
    console.log(`Key 2: ${k2}`);

    if (k1 !== k2) {
        console.log("✅ Rotation Successful!");
    } else {
        console.error("❌ Rotation Failed (Key did not change)");
    }
}

testRotation();
