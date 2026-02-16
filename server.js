import express from "express";
import cors from "cors";
import { ENV } from "./config/env.js";
import { publishIntent } from "./controllers/publishController.js";
import { chatHandler } from "./controllers/chatController.js";
import { scanDuplicates } from "./controllers/duplicateController.js";

const app = express();

app.use(cors({ origin: "*" })); // In production, restrict origin
app.use(express.json());

// DEBUG: Log all requests (Disabled for Production)
// app.use((req, res, next) => {
//   console.log(`[DEBUG] Received: ${req.method} ${req.url}`);
//   next();
// });

app.get("/", (req, res) => {
  res.json({ status: "ok", message: "Montfort Chatbot backend running" });
});

// Phase 3 Routes
app.post("/api/publish", publishIntent);
app.post("/api/chat", chatHandler);
app.post("/api/scan-duplicates", scanDuplicates);
app.post("/api/refresh-vocab", async (req, res) => {
  try {
    const { vocabService } = await import('./services/vocabService.js');
    const result = await vocabService.refresh();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(ENV.PORT, () => {
  console.log(`🚀 Backend listening on http://localhost:${ENV.PORT}`);
});
