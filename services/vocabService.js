import { supabaseAdmin } from './supabaseService.js';

class VocabService {
    constructor() {
        this.vocabSet = new Set();
        this.vocabWords = [];
        this.isLoaded = false;
    }

    async load() {
        if (this.isLoaded) return;
        await this.refresh();
    }

    async refresh() {
        console.log("[VocabService] Refreshing vocabulary...");
        try {
            const set = new Set();

            // Fetch Questions
            const { data: questions, error: qError } = await supabaseAdmin
                .from('questions')
                .select('question_text');

            if (qError) console.error("[VocabService] Error fetching questions:", qError);
            else {
                questions?.forEach(q => this.processTextToVocab(q.question_text, set));
            }

            // Fetch Intents
            const { data: intents, error: iError } = await supabaseAdmin
                .from('intents')
                .select('name');

            if (iError) console.error("[VocabService] Error fetching intents:", iError);
            else {
                intents?.forEach(i => this.processTextToVocab(i.name, set));
            }

            this.vocabSet = set;
            this.vocabWords = Array.from(set);
            this.isLoaded = true;
            console.log(`[VocabService] Loaded ${this.vocabWords.length} words.`);

            return { success: true, count: this.vocabWords.length };

        } catch (err) {
            console.error("[VocabService] Failed to load vocabulary:", err);
            return { success: false, error: err.message };
        }
    }

    processTextToVocab(text, set) {
        if (!text) return;
        text.toLowerCase()
            .replace(/[^a-z0-9\s]/g, " ")
            .split(/\s+/)
            .filter(Boolean)
            .forEach((t) => {
                if (t.length >= 3) set.add(t);
            });
    }

    getSet() {
        return this.vocabSet;
    }

    getArray() {
        return this.vocabWords;
    }
}

export const vocabService = new VocabService();
