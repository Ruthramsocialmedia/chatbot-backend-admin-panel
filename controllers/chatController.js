import { supabaseAdmin } from '../services/supabaseService.js';
import { aiService } from '../services/aiService.js';
import { aiIntentRouter } from './aiIntentRouter.js';

export const chatHandler = async (req, res) => {
  // Fix: Frontend sends 'question', not 'message'
  const { question, panoNames = [], projectNames = [] } = req.body;
  const message = question; // Alias for internal use

  if (!message || !message.trim()) {
    return res.status(400).json({ error: 'Message cannot be empty' });
  }

  try {
    console.log(`[Chat] User asks: "${message}"`);

    // 1. AI Intent Router (Navigation Logic)
    // Checks if the user wants to "Go to Library" etc.
    const intentResult = aiIntentRouter(message, panoNames, projectNames);

    if (intentResult.intent === 'pano' || intentResult.intent === 'project') {
      console.log(`[Chat] Navigation Intent: ${intentResult.intent} -> ${intentResult.target}`);
      return res.json({
        success: true,
        intent: intentResult.intent,
        target: intentResult.target,
        answer: `Opening ${intentResult.target}...`, // Fallback text
        action: intentResult.intent // for frontend
      });
    }

    // 2. Grammar Correction & Normalization (Gemini Flash)
    const correctedMessage = await aiService.correctGrammar(message);
    console.log(`[Chat] Corrected: "${correctedMessage}"`);

    // 3. Generate Embedding for Corrected Query
    const queryVector = await aiService.generateEmbedding(correctedMessage);
    if (!queryVector) {
      return res.status(500).json({ error: 'Failed to generate embedding' });
    }

    // 4. Call Postgres RPC 'match_embeddings'
    const { data: matches, error } = await supabaseAdmin.rpc('match_embeddings', {
      query_embedding: queryVector,
      match_threshold: 0.75, // Adjust confidence here
      match_count: 3
    });

    if (error) {
      console.error('[Chat] RPC Error:', error);
      return res.json({
        answer: "I'm having trouble accessing my memory right now. Please try again.",
        sources: []
      });
    }

    // 5. Process Results
    if (matches && matches.length > 0) {
      const bestMatch = matches[0];
      console.log(`[Chat] Match: "${bestMatch.question_text}" (${(bestMatch.similarity * 100).toFixed(1)}%)`);

      return res.json({
        answer: bestMatch.answer_text,
        matched_question: bestMatch.question_text,
        normalizedQuestion: correctedMessage,
        confidence: bestMatch.similarity
      });
    } else {
      console.log('[Chat] No match found above threshold.');
      return res.json({
        answer: "I'm not sure about that. Can you rephrase or ask differently?",
        confidence: 0,
        normalizedQuestion: correctedMessage
      });
    }

  } catch (err) {
    console.error('[Chat] Error:', err);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};