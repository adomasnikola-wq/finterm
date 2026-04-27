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
const CG_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
  "Accept": "application/json",
  "Accept-Language": "en-US,en;q=0.9",
};

// ── AI Analysis via Gemini Flash (gratis) ──────────────────────────────────
app.post("/api/ai", async (req, res) => {
  try {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: req.body.prompt }] }],
          tools: [{ google_search: {} }],
        }),
      }
    );
    const data = await r.json();
    if (data.error) throw new Error(data.error.message);
    const text =
      data?.candidates?.[0]?.content?.parts
        ?.filter((p) => p.text)
        .map((p) => p.text)
        .join("") || "Nessuna risposta da Gemini.";
    res.json({ text });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Dati Crypto via CoinGecko (gratis, no key) ─────────────────────────────
app.get("/api/crypto/:id", async (req, res) => {
  try {
    await new Promise((r) => setTimeout(r, 300));
    const mktUrl = `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${req.params.id}&price_change_percentage=7d`;
    const histUrl = `https://api.coingecko.com/api/v3/coins/${req.params.id}/market_chart?vs_currency=usd&days=20&interval=daily`;

    const mktRes = await fetch(mktUrl, { headers: CG_HEADERS });
    if (!mktRes.ok) throw new Error(`CoinGecko markets: ${mktRes.status}`);
    const mkt = await mktRes.json();

    await new Promise((r) => setTimeout(r, 500));

    const histRes = await fetch(histUrl, { headers: CG_HEADERS });
    if (!histRes.ok) throw new Error(`CoinGecko history: ${histRes.status}`);
    const hist = await histRes.json();

    if (!Array.isArray(mkt) || mkt.length === 0)
