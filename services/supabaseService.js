import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
    console.error('CRITICAL: Missing Supabase credentials in .env');
    // We don't throw here to avoid crashing server on import, but usage will fail
}

// Service Role client - BYPASSES RLS
export const supabaseAdmin = createClient(url, key, {
    auth: {
        autoRefreshToken: false,
        persistSession: false
    }
});
