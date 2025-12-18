import { duplicateService } from '../services/duplicateService.js';
import { supabaseAdmin } from '../services/supabaseService.js';

export const scanDuplicates = async (req, res) => {
    try {
        // Delegate complex logic to service
        const result = await duplicateService.scanForDuplicates();

        // Send success response
        res.json({ success: true, ...result });

    } catch (err) {
        console.error('[DuplicateScan] Error:', err);
        res.status(500).json({ error: 'Scan failed', details: err.message });
    }
};
