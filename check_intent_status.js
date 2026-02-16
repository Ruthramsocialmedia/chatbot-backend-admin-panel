import { supabaseAdmin } from './services/supabaseService.js';

async function checkStatus() {
    const id = 'd6dfa8f0-2a81-4b3b-a18c-5d7f9d6a445e';
    const { data, error } = await supabaseAdmin
        .from('intents')
        .select('status')
        .eq('id', id)
        .single();

    if (error) console.error(error);
    else console.log('Intent Status:', data);
}

checkStatus();
