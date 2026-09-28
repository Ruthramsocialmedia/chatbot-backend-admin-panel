import { supabaseAdmin } from '../services/supabaseService.js';
import { aiService } from '../services/aiService.js';
import { aiIntentRouter } from './aiIntentRouter.js';
// correctSpelling import removed — spelling is handled inline

// controllers/chatController.js


// Helper: Format times for clean TTS pronunciation (e.g. 9.00 AM - 6.00 PM -> 9:00 AM to 6:00 PM)
function normalizeSpeechTimes(str) {
  if (!str) return str;
  return str
    .replace(/(\b\d{1,2})\.(\d{2})\s*(AM|PM|am|pm)\b/g, '$1:$2 $3')
    .replace(/(\b\d{1,2}(?::\d{2})?\s*(?:AM|PM|am|pm)?)\s*[-–—]\s*(\b\d{1,2}(?::\d{2})?\s*(?:AM|PM|am|pm)\b)/gi, '$1 to $2');
}


export const chatHandler = async (req, res) => {
  // Fix: Frontend sends 'question', not 'message'
  // Added 'history' and 'lastMatchedIntent' to support Context Awareness
  const { question, history = [], panoNames = [], projectNames = [], lastMatchedIntent = null } = req.body;
  let message = question;

  if (!message || !message.trim()) {
    return res.status(400).json({ error: 'Message cannot be empty' });
  }

  // 1. AI Intent Router (Navigation Logic) - Priority #1
  // Checks if the user wants to "Go to Library" etc.
  // Must run BEFORE Fact Detection to prevent "open" triggering "Time" facts
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

  try {
    console.log(`[Chat] User asks: "${message}"`);

    let itemsToFetch = 5; // Default match_count

    // 1. Prepare words for context analysis
    const currWords = message.toLowerCase().split(/\s+/);



    // 2. [REMOVED] Generic Deterministic Context Merging
    // User requested to disable this feature strictly.
    // message remains as is.

    // 1. AI Intent Router (Navigation Logic)
    // Checks if the user wants to "Go to Library" etc.


    // 2. Spelling Correction & Grammar Fix (Two-Stage Strategy)
    const tStart = Date.now();

    // STAGE 1: FAST PATH (Local Only)
    let fastMessage = await aiService.quickCorrection(message);
    const tQuick = Date.now();
    console.log(`[Perf] QuickCorrection: ${tQuick - tStart}ms`);

    let usedMessage = fastMessage; // Track which version we used

    // Generate Embedding for Fast Path
    let queryVector = await aiService.generateEmbedding(fastMessage);
    const tEmbed = Date.now();
    console.log(`[Perf] Embedding: ${tEmbed - tQuick}ms`);

    if (!queryVector) {
      return res.status(500).json({ error: 'Failed to generate embedding' });
    }

    // Call Postgres RPC (Fast Path)
    let { data: matches, error } = await supabaseAdmin.rpc('match_embeddings', {
      query_embedding: queryVector,
      match_threshold: 0.45,
      match_count: itemsToFetch
    });

    if (error) {
      console.error('[Chat] RPC Error:', error);
      return res.json({ answer: "I'm having trouble accessing my memory right now.", sources: [] });
    }

    // CHECK FAST PATH CONFIDENCE
    const FAST_PATH_THRESHOLD = 0.85;
    let fastPathSuccess = false;

    if (matches && matches.length > 0 && matches[0].similarity >= FAST_PATH_THRESHOLD) {
      console.log(`[Chat] 🚀 Fast Path Success! Confidence: ${matches[0].similarity.toFixed(4)}`);
      fastPathSuccess = true;
    } else {
      // STAGE 2: SLOW PATH (LLM Correction)
      console.log(`[Chat] 🐢 Fast Path Low Confidence. Engaging LLM...`);

      const llmMessage = await aiService.correctGrammar(message);

      if (llmMessage !== fastMessage) {
        console.log(`[Chat] LLM Refined: "${fastMessage}" -> "${llmMessage}"`);
        usedMessage = llmMessage;

        // Re-Generate Embedding for LLM-corrected query
        queryVector = await aiService.generateEmbedding(llmMessage);

        // Re-Run Search
        const { data: retryMatches, error: retryError } = await supabaseAdmin.rpc('match_embeddings', {
          query_embedding: queryVector,
          match_threshold: 0.45,
          match_count: itemsToFetch
        });

        if (!retryError && retryMatches) {
          matches = retryMatches;
        }
      }
    }

    let correctedMessage = usedMessage; // Compatibility for rest of code

    // Code continues with 'matches' populated...

    // 5. Smart Answer Selection with Fact Validation
    if (matches && matches.length > 0) {

      console.log(`[Chat] Processing ${matches.length} matches...`);
      // Debug: Show top 3 similarity scores
      matches.slice(0, 3).forEach((m, i) => {
        console.log(`[Chat]   #${i + 1}: "${m.question_text}" → similarity: ${m.similarity?.toFixed(4)}`);
      });

      // A. Fetch answers for ALL matches (up to 15 now)
      const intentIds = matches.map(m => m.intent_id);
      const { data: allAnswers } = await supabaseAdmin
        .from('answers')
        .select('intent_id, answer_text')
        .in('intent_id', intentIds)
        .eq('is_active', true);

      // Attach answer text to matches
      let enrichedMatches = matches.map(m => {
        const ans = allAnswers?.find(a => a.intent_id === m.intent_id);
        return { ...m, answer_text: ans?.answer_text || "" };
      });

      // --- DEDUPLICATION (Fix for "Website URI" 5x repeat) ---
      // Filter out matches that have identical answers to previous ones
      const seenAnswers = new Set();
      enrichedMatches = enrichedMatches.filter(m => {
        if (!m.answer_text) return false;
        if (seenAnswers.has(m.answer_text)) return false;
        seenAnswers.add(m.answer_text);
        return true;
      });

      // --- CONTEXT ANCHOR FILTER REMOVED (Generic Implementation) ---
      // We rely purely on semantic search and history merging now.

      // Reset to top 5 for final processing implies we assume enrichedMatches is sorted by similarity
      // Since we filtered, the new index 0 is the best *relevant* match.
      // We can proceed with enrichedMatches.

      // --- GENERIC: Use top semantic match directly (No Fact Guard) ---
      let bestMatch = enrichedMatches[0];

      console.log(`[Chat] Winning match: "${bestMatch.question_text}"`);

      // --- DOMAIN VALIDITY CHECK (MINIMUM CONFIDENCE FLOOR) ---
      // Prevents low-confidence answers for unknown/out-of-domain queries.
      // Tuned to 0.70 to allow typo-corrected matches (e.g. "tution" -> 0.73)
      const MIN_CONFIDENCE_FLOOR = 0.70;

      if (bestMatch.similarity < MIN_CONFIDENCE_FLOOR) {
        console.log(`[Chat] Domain Guard: Best match confidence (${bestMatch.similarity.toFixed(4)}) is below floor (${MIN_CONFIDENCE_FLOOR}). Blocking result.`);
        // Force fallback logic to trigger below
        matches = [];
      } else {

        // E. Synthesize Natural Answer via Gemini RAG using the top relevant matches
        const topMatches = enrichedMatches.slice(0, 3);
        console.log(`[Chat] Synthesizing RAG answer from ${topMatches.length} matches...`);

        try {
          const ragAnswer = await aiService.generateAnswerFromContext(correctedMessage || message, topMatches);
          const finalAnswer = normalizeSpeechTimes(ragAnswer || bestMatch.answer_text);

          console.log(`[Chat] Returning RAG answer. Top Match: "${bestMatch.question_text}" (${bestMatch.similarity.toFixed(3)})`);
          return res.json({
            answer: finalAnswer,
            matched_question: bestMatch.question_text,
            normalizedQuestion: correctedMessage,
            confidence: bestMatch.similarity
          });
        } catch (ragErr) {
          console.warn('[Chat] RAG synthesis fallback to direct answer:', ragErr.message);
          return res.json({
            answer: normalizeSpeechTimes(bestMatch.answer_text),
            matched_question: bestMatch.question_text,
            normalizedQuestion: correctedMessage,
            confidence: bestMatch.similarity
          });
        }
      } // End of Domain Guard Else
    } // End of if (matches)

    // 6. Fallback — Polite campus guide response
    console.log('[Chat] No match found above threshold. Returning fallback.');
    return res.json({
      answer: "I don't have that specific detail in our college records. You can ask me about admissions, courses, fees, hostel, campus facilities, or ask me to navigate to any tour location.",
      confidence: 0,
      normalizedQuestion: correctedMessage
    });

  } catch (err) {
    console.error('[Chat] Error:', err);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};