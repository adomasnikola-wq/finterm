import express from "express";
import fetch from "node-fetch";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";

const app = express();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
app.use(cors());
app.use(express.json());

const GEMINI_KEY = process.env.GEMINI_API_KEY;

async function askGemini(prompt) {
  const r = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        tools: [{ google_search: {} }],
      }),
    }
  );
  const data = await r.json();
  if (data.error) throw new Error(data.error.message);
  return data?.candidates?.[0]?.content?.parts
    ?.filter((p) => p.text).map((p) => p.text).join("") || "";
}

// ── Dati mercato via Gemini + web search ───────────────────────────────────
app.post("/api/market", async (req, res) => {
  const { sym, type } = req.body;
  try {
    const date = new Date().toLocaleDateString("en-US", { month:"long", day:"numeric", year:"numeric" });
    const text = await askGemini(
      `Today is ${date}. Search the web for REAL current market data for ${sym} (${type}).
Return ONLY valid JSON, no markdown, no backticks:
{
  "symbol":"${sym}","name":"Full Name","type":"${type}",
  "price":0,"change24h":0,"changePct24h":0,
  "high24h":0,"low24h":0,"volume24h":0,"marketCap":0,
  "rank":null,"ath":null,"athChangePct":null,
  "supply":null,"pe":null,"fiftyTwoHigh":null,"fiftyTwoLow":null,
  "exchange":null,
  "priceHistory":[{"date":"Apr 1","price":0,"volume":0}]
}
Search TWICE: 1) current price and metrics 2) last 20 daily closing prices.
priceHistory must have exactly 20 real entries. No zeros for main fields.`
    );
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) throw new Error("JSON non trovato");
    res.json(JSON.parse(m[0]));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Analisi AI via Gemini ──────────────────────────────────────────────────
app.post("/api/ai", async (req, res) => {
  try {
    const text = await askGemini(req.body.prompt);
    res.json({ text });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Frontend ───────────────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, "../frontend/dist")));
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "../frontend/dist/index.html"));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`FINTERM running on port ${PORT}`));
