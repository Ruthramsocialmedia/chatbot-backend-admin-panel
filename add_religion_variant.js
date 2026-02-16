import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { GoogleGenerativeAI } from '@google/generative-ai';

dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const embedModel = genAI.getGenerativeModel({ model: "gemini-embedding-001" });

async function addVariant() {
    const intentId = 'd6dfa8f0-2a81-4b3b-a18c-5d7f9d6a445e';
    const newQuestion = "Are students from all religions welcome?";

    console.log(`Adding variant: "${newQuestion}" to intent ${intentId}...`);

    // 1. Insert Question
    const { data: qData, error: qError } = await supabase
        .from('questions')
        .insert({
            intent_id: intentId,
            question_text: newQuestion,
            is_active: true
        })
        .select()
        .single();

    if (qError) {
        console.error('Error inserting question:', qError.message);
        return;
    }

    console.log(`Question inserted with ID: ${qData.id}`);

    // 2. Generate Embedding
    console.log('Generating embedding...');
    try {
        const result = await embedModel.embedContent({
            content: { parts: [{ text: newQuestion }] },
            outputDimensionality: 768
        });
        const vector = result.embedding.values;
        console.log(`Embedding generated. Length: ${vector.length}`);

        // 3. Save Embedding
        const { error: embError } = await supabase.from('embeddings').upsert({
            intent_id: intentId,
            question_id: qData.id,
            model: 'gemini-embedding-001',
            dims: vector.length,
            vector: vector
        });

        if (embError) {
            console.error('Error saving embedding:', embError.message);
        } else {
            console.log('✅ Embedding saved successfully!');
        }

    } catch (err) {
        console.error('Error generating embedding:', err.message);
    }
}

addVariant();
