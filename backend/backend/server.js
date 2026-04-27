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
    const [mkt, hist] = await Promise.all([
      fetch(
        `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${req.params.id}&price_change_percentage=7d`
      ).then((r) => r.json()),
      fetch(
        `https://api.coingecko.com/api/v3/coins/${req.params.id}/market_chart?vs_currency=usd&days=20&interval=daily`
      ).then((r) => r.json()),
    ]);
    res.json({ mkt, hist });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Dati Stock/ETF via Yahoo Finance (gratis, no key) ──────────────────────
app.get("/api/stock/:sym", async (req, res) => {
  try {
    const r = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${req.params.sym}?interval=1d&range=1mo`,
      { headers: { "User-Agent": "Mozilla/5.0" } }
    );
    const data = await r.json();
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Serve frontend React buildato ──────────────────────────────────────────
app.use(express.static(path.join(__dirname, "../frontend/dist")));
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "../frontend/dist/index.html"));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`FINTERM running on port ${PORT}`));
