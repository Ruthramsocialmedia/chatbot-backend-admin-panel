import { ENV } from '../config/env.js';

class KeyManager {
    constructor() {
        this.keys = [];
        this.currentIndex = 0;
        this.loadKeys();
    }

    loadKeys() {
        // 1. Load primary key
        if (ENV.GEMINI_API_KEY) {
            this.keys.push(ENV.GEMINI_API_KEY);
        }

        // 2. Load indexed keys (GEMINI_API_KEY_1, _2, etc.)
        // We scan up to 20 to be safe, or check process.env if we could (but ENV is our interface)
        // Since ENV might not have them all explicitly defined if not updated, 
        // we might need to rely on process.env directly here or update config/env.js first.
        // Let's assume config/env.js gives us access or we use process.env here for dynamic loading.
        // Direct process.env access is better for dynamic keys not hardcoded in ENV object.

        Object.keys(process.env).forEach(key => {
            if (key.startsWith('GEMINI_API_KEY_') && process.env[key]) {
                // Avoid duplicates if GEMINI_API_KEY is just a reference to one of these
                if (!this.keys.includes(process.env[key])) {
                    this.keys.push(process.env[key]);
                }
            }
        });

        // 3. Load comma-separated list
        if (process.env.GEMINI_API_KEYS) {
            const extra = process.env.GEMINI_API_KEYS.split(',').map(k => k.trim()).filter(Boolean);
            extra.forEach(k => {
                if (!this.keys.includes(k)) this.keys.push(k);
            });
        }

        if (this.keys.length === 0) {
            console.warn("[KeyManager] No API Keys found! Gemini calls will fail.");
        } else {
            console.log(`[KeyManager] Loaded ${this.keys.length} API keys.`);
        }
    }

    getKey() {
        if (this.keys.length === 0) return null;
        return this.keys[this.currentIndex];
    }

    rotate() {
        if (this.keys.length <= 1) {
            console.warn("[KeyManager] Rotation requested but only 1 key available.");
            return false; // Cannot rotate
        }

        const prevIndex = this.currentIndex;
        this.currentIndex = (this.currentIndex + 1) % this.keys.length;
        console.log(`[KeyManager] Rotating Key: ${prevIndex} -> ${this.currentIndex}`);
        return true; // Rotated successfully
    }

    // Helper to mask key for logging
    getCurrentKeyMasked() {
        const k = this.getKey();
        if (!k) return "NONE";
        return k.substring(0, 5) + "...";
    }
}

export const keyManager = new KeyManager();
