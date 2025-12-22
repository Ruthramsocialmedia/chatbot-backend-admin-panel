import { supabaseAdmin } from '../services/supabaseService.js';
import { aiService } from '../services/aiService.js';
import { aiIntentRouter } from './aiIntentRouter.js';
import { correctSpelling } from '../services/geminiService.js';

// controllers/chatController.js


// Helper: Extract clean topic label from question
function formatTopicLabel(question) {
  const stopwords = ['what', 'is', 'the', 'are', 'info', 'about', 'for', 'details', 'of', 'in', 'on', 'how', 'to', 'can', 'you', 'tell', 'me', 'enquiry', 'check', 'where', 'when', 'who', 'which', 'do', 'does', 'located'];
  const words = question.toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/);
  const keywords = words.filter(w => !stopwords.includes(w) && w.length > 2);

  // Capitalize first letter of each keyword
  const label = keywords.slice(0, 3).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  return label || "General Info";
}

export const chatHandler = async (req, res) => {
  // Fix: Frontend sends 'question', not 'message'
  // Added 'history' to support Context Awareness
  const { question, history = [], panoNames = [], projectNames = [] } = req.body;
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

    // --- FEATURE 3 & 11: CONTEXT AWARENESS & ANCHOR LOCKING ---
    // Define Major Entities (Anchors)
    const ANCHOR_KEYWORDS = [
      'canteen', 'mess', 'cafeteria', 'food',
      'hostel', 'boarding', 'dorm',
      'library', 'book',
      'transport', 'bus', 'van',
      'admission', 'apply', 'joining',
      'fee', 'payment', 'tuition',
      'wifi', 'internet',
      'sports', 'cricket', 'football', 'gym',
      'lab', 'computer', 'science',
      'lab', 'computer', 'science',
      'principal', 'teacher', 'staff', 'chairman', 'correspondent', 'founder', 'director',
      'timing', 'schedule', 'hour',
      'uniform', 'dress'
    ];

    let itemsToFetch = 5; // Default match_count
    let activeContextAnchor = null; // Will store the locked anchor if any

    // Check History for Anchor

    // 1. Detect Anchor in Current Query
    const currWords = message.toLowerCase().split(/\s+/);
    const currAnchor = ANCHOR_KEYWORDS.find(kw => message.toLowerCase().includes(kw));

    // Boost Search Depth for FACTS (Phone, Email, etc.)
    // If user asks for a specific fact, we need to dig deeper (Top 20) to find the one right answer
    // because generic "policy" docs often rank higher semantically.
    const FACT_KEYWORDS = ['phone', 'mobile', 'whatsapp', 'email', 'address', 'fee', 'tuition', 'timing', 'schedule', 'location'];
    const hasFactKeyword = FACT_KEYWORDS.some(kw => message.toLowerCase().includes(kw));
    if (hasFactKeyword) {
      itemsToFetch = 20;
      console.log(`[Chat] Fact query detected. Boosting match_count to ${itemsToFetch}.`);
    }

    // 2. Detect Anchor in Previous Query (if history exists)
    if (history.length > 0 && !currAnchor) {
      const lastUserMsg = history[history.length - 1]?.user || ""; // Use user query as proxy for resolved topic
      const prevAnchor = ANCHOR_KEYWORDS.find(kw => lastUserMsg.toLowerCase().includes(kw));

      // 3. Apply Lock Rule: If Prev has Anchor AND Curr has NONE -> LOCK
      // Only apply for short/referential queries (<= 5 words to be safe)
      if (prevAnchor && currWords.length <= 5) {
        activeContextAnchor = prevAnchor;
        console.log(`[Chat] Context Anchor Detected: Locked to entity '${activeContextAnchor}' from previous turn.`);

        // Force merge for semantic context (still useful)
        // But CRITICALLY, we will filter results later
        message = `${activeContextAnchor} ${message}`;

        // Increase fetch count to ensure we find the specific entity answers
        // even if generic "food" answers (Hostel) dominate the top spots
        itemsToFetch = 15;
      }
    } else if (history.length > 0) {
      // Existing simple merge for non-anchor cases (flow continuity)
      const lastUserMsg = history[history.length - 1]?.user || "";
      if (currWords.length <= 2 && lastUserMsg) {
        console.log(`[Chat] Context Detection: Merging "${message}" with history context "${lastUserMsg}"`);
        message = `${lastUserMsg} ${message}`;
      }
    }

    // 1. AI Intent Router (Navigation Logic)
    // Checks if the user wants to "Go to Library" etc.


    // 2. Spelling Correction & Meaning Normalization (RAG-Optimized)
    let correctedMessage = message;
    const wordCount = message.split(/\s+/).length;

    // Optimization: Skip expensive Gemini call for short/simple queries
    if (wordCount > 5) {
      correctedMessage = await aiService.normalizeToMeaning(message); // Now points to geminiService via aliasing or direct import
      console.log(`[Chat] Query Normalized: "${correctedMessage}"`);
    } else {
      console.log(`[Chat] Short query detected (${wordCount} words). Skipping normalization to save quota.`);
      // Basic cleanup only
      correctedMessage = message.replace(/[^\w\s]/gi, '').trim();

      // --- LIGHTWEIGHT TYPO CORRECTION (For Facts) ---
      // Fixes "whatapp" -> "whatsapp" so Fact Guard works even if normalization is skipped.
      const TYPO_MAP = {
        'whatapp': 'whatsapp',
        'wtsap': 'whatsapp',
        'whtsap': 'whatsapp',
        'moble': 'mobile',
        'phon': 'phone',
        'emal': 'email',
        'emai': 'email',
        'fee': 'fees' // Plural normalization
      };

      const words = correctedMessage.split(' ');
      const fixedWords = words.map(w => TYPO_MAP[w.toLowerCase()] || w);
      correctedMessage = fixedWords.join(' ');
      if (correctedMessage !== message) {
        console.log(`[Chat] Typo Auto-Corrected: "${message}" -> "${correctedMessage}"`);
      }
    }

    // 3. Generate Embedding for Corrected Query
    const queryVector = await aiService.generateEmbedding(correctedMessage);
    if (!queryVector) {
      return res.status(500).json({ error: 'Failed to generate embedding' });
    }

    // 4. Call Postgres RPC 'match_embeddings' (Fetch Top 5 for RAG)
    let { data: matches, error } = await supabaseAdmin.rpc('match_embeddings', {
      query_embedding: queryVector,
      match_threshold: 0.45, // Lowered to catch "what is what is..." style data
      match_count: itemsToFetch // Dynamic: 5 normally, 15 if anchored
    });

    if (error) {
      console.error('[Chat] RPC Error:', error);
      return res.json({
        answer: "I'm having trouble accessing my memory right now. Please try again.",
        sources: []
      });
    }

    // 5. Smart Answer Selection with Fact Validation
    if (matches && matches.length > 0) {

      console.log(`[Chat] Processing ${matches.length} matches...`);

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

      // --- APPLY CONTEXT ANCHOR FILTER ---
      if (activeContextAnchor) {
        console.log(`[Chat] Applying Anchor Filter: Keeping only matches containing '${activeContextAnchor}'...`);
        const originalTop = enrichedMatches[0].question_text;
        const filtered = enrichedMatches.filter(m => {
          const txt = (m.question_text + " " + m.answer_text).toLowerCase();
          return txt.includes(activeContextAnchor);
        });

        if (filtered.length > 0) {
          console.log(`[Chat] Anchor Filter Success: Reduced ${matches.length} -> ${filtered.length} matches.`);
          console.log(`[Chat] New Top Match: "${filtered[0].question_text}" (Was: "${originalTop}")`);
          enrichedMatches = filtered; // Use the filtered set
        } else {
          console.log(`[Chat] Anchor Filter Warning: No matches contained '${activeContextAnchor}'. Reverting to raw results.`);
          // Fallback: enrichedMatches already contains the original set with answer_text, so no change needed.
        }
      }

      // Reset to top 5 for final processing implies we assume enrichedMatches is sorted by similarity
      // Since we filtered, the new index 0 is the best *relevant* match.
      // We can proceed with enrichedMatches.

      // B. Define Fact Patterns (Regex)
      const FACT_PATTERNS = {
        phone: { keywords: ['phone', 'mobile', 'whatsapp', 'call'], regex: /(\+?\d[\d -]{7,15}|\d{3,5}\s?\d{3,5})/ }, // 8-15 digits
        email: { keywords: ['email', 'mail'], regex: /[\w.-]+@[\w.-]+\.\w+/ }, // Simple email check
        website: { keywords: ['website', 'url', 'uri', 'link', 'web'], regex: /https?:\/\// }, // New Website Pattern
        time: { keywords: ['time', 'timing', 'schedule', 'open', 'close', 'hour'], regex: /(\d{1,2}(:\d{2})?\s?(am|pm)|[0-2]?\d:\d{2})/i },
        fee: { keywords: ['fee', 'payment', 'cost', 'price', 'tuition'], regex: /(\d+|free|rupees|rs\.|inr)/i }
      };

      const queryLower = correctedMessage.toLowerCase();
      let bestMatch = enrichedMatches[0]; // Default to vector top match
      let isSpecificFact = false;

      // C. Check if Query Asks for a Fact
      // Find which fact type matches the user's query keywords
      const detectedFactType = Object.entries(FACT_PATTERNS).find(([type, config]) =>
        config.keywords.some(kw => queryLower.includes(kw))
      );

      if (detectedFactType) {
        const [type, config] = detectedFactType;
        console.log(`[Chat] Detected fact intent: '${type}'. Validating answers...`);

        // D. Find a match where the ANSWER explicitly contains the fact value
        const validMatch = enrichedMatches.find(m => {
          // 1. Keyword check (Question should relate to the topic) - relaxed check
          // 2. VALUE CHECK: Answer MUST contain the pattern (The Core Fix)
          const hasValue = config.regex.test(m.answer_text);
          return hasValue;
        });

        if (validMatch) {
          console.log(`[Chat] Found VALID fact match: "${validMatch.question_text}" (Ans: "${validMatch.answer_text.substring(0, 20)}...")`);
          bestMatch = validMatch;
          isSpecificFact = true;
        } else {
          console.log(`[Chat] FACT GUARD: No answer contained a valid '${type}' value. BLOCKING fallback.`);
          // --- FEATURE 13: FACT GUARD RULE ---
          // If user wants a fact (Phone/Email) but we have no value, DO NOT return policy/semantic text.
          return res.json({
            answer: `I'm sorry, I currently don't have the specific ${type} information available in my records.`,
            matched_question: "Fact Guard Block",
            normalizedQuestion: correctedMessage,
            confidence: 0 // Explicit 0 to indicate no valid match
          });
        }
      } else {
        console.log(`[Chat] No specific fact keyword detected. Using semantic rank.`);
      }

      console.log(`[Chat] Winning match: "${bestMatch.question_text}"`);

      // --- FEATURE 13: DOMAIN VALIDITY CHECK (MINIMUM CONFIDENCE FLOOR) ---
      // Prevents "Top 5 List" for completely unknown/out-of-domain queries.
      const MIN_CONFIDENCE_FLOOR = 0.55;

      if (!isSpecificFact && bestMatch.similarity < MIN_CONFIDENCE_FLOOR) {
        console.log(`[Chat] Domain Guard: Best match confidence (${bestMatch.similarity}) is below floor (${MIN_CONFIDENCE_FLOOR}). Blocking result.`);
        // Force fallback logic to trigger below
        matches = [];
      } else {

        // --- FEATURE 8: BROAD QUERY HANDLING (TOP 5) ---
        // If NOT a specific fact and confidence is moderate/low, return list
        // RULE 2: Detect "Single Strong Answer"
        // If the top match is very strong (>0.82), we should treat it as a direct answer
        // even if the query is short (e.g. "canteen" -> direct answer about canteen)
        const isVeryStrongMatch = bestMatch.similarity > 0.82;
        const isHighConfidence = bestMatch.similarity > 0.65;

        // Only use list if it's NOT a specific fact, NOT a very strong match, 
        // AND (it's weak confidence OR it's a short query with multiple options)
        const shouldUseList = !isSpecificFact && !isVeryStrongMatch && (!isHighConfidence || (queryLower.split(' ').length < 2 && matches.length > 2));

        if (shouldUseList && matches.length > 1) {
          console.log(`[Chat] Broad/Ambiguous Query Detected. Returning Top 5 list.`);

          // RULE 1: Overview Format
          const topic = formatTopicLabel(correctedMessage);
          const listResponse = `Here’s a quick overview of ${topic}:\n\n` +
            enrichedMatches
              .slice(0, 4) // Show top 4 max
              .map(m => {
                let label = formatTopicLabel(m.question_text).replace(/School|Montfort/gi, '').trim();
                if (!label || label.length < 2) label = "Details";
                return `• **${label}**: ${m.answer_text}`;
              })
              .join("\n\n"); // Double spacing for readability

          return res.json({
            answer: listResponse,
            matched_question: "Broad Query - Overview",
            normalizedQuestion: correctedMessage,
            confidence: bestMatch.similarity
          });
        }

        // E. Return the Single Winner (RAG Synthesis)
        if (bestMatch && bestMatch.answer_text) {

          // FEATURE 14: NATURAL REWRITING (Tone Layer)
          // OPTIMIZATION: Only use Gemini for complex/long queries (wordCount > 4).
          // Short queries get fast DB answer or Presentation Layer (Rule 2).
          if (!isSpecificFact && wordCount > 4) {
            console.log("[Chat] General Query (Complex) - Using RAG Synthesis for Natural Tone...");
            let synthesis = await aiService.generateAnswerFromContext(correctedMessage, [bestMatch]);
            if (!synthesis) synthesis = bestMatch.answer_text; // SAFETY FALLBACK

            return res.json({
              answer: synthesis,
              matched_question: bestMatch.question_text,
              normalizedQuestion: correctedMessage,
              confidence: bestMatch.similarity
            });
          }
          console.log(`[Chat] Query optimized (Short/Fact) - Skipping RAG Synthesis. Returning direct answer.`);

          // If Fact Mode (Phone/Email) -> Return RAW to ensure exact digits/values (Feature 7 & 8)
          console.log("[Chat] Fact Mode - Returning Raw Answer for Precision.");
          return res.json({
            answer: bestMatch.answer_text,
            matched_question: bestMatch.question_text,
            normalizedQuestion: correctedMessage,
            confidence: bestMatch.similarity
          });
        }
      } // End of Domain Guard Else
    } // End of if (matches)

    // 6. Fallback (Only call Gemini if no DB match found)
    console.log('[Chat] No match found above threshold. Calling Gemini fallback.');
    const fallback = await aiService.answerGeneralQuestion(correctedMessage);
    return res.json({
      answer: fallback,
      confidence: 0,
      normalizedQuestion: correctedMessage
    });

  } catch (err) {
    console.error('[Chat] Error:', err);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};