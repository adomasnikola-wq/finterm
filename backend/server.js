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
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
  "Accept": "application/json",
};

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
    const text = data?.candidates?.[0]?.content?.parts
      ?.filter((p) => p.text)
      .map((p) => p.text)
      .join("") || "Nessuna risposta.";
    res.json({ text });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/crypto/:id", async (req, res) => {
  try {
    await new Promise((r) => setTimeout(r, 300));
    const mktRes = await fetch(
      `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${req.params.id}&price_change_percentage=7d`,
      { headers: CG_HEADERS }
    );
    if (!mktRes.ok) throw new Error(`CoinGecko: ${mktRes.status}`);
    const mkt = await mktRes.json();
    await new Promise((r) => setTimeout(r, 500));
    const histRes = await fetch(
      `https://api.coingecko.com/api/v3/coins/${req.params.id}/market_chart?vs_currency=usd&days=20&interval=daily`,
      { headers: CG_HEADERS }
    );
    if (!histRes.ok) throw new Error(`CoinGecko history: ${histRes.status}`);
    const hist = await histRes.json();
    if (!Array.isArray(mkt) || mkt.length === 0) {
      throw new Error(`Coin non trovata: ${req.params.id}`);
    }
    res.json({ mkt, hist });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/stock/:sym", async (req, res) => {
  try {
    const r = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${req.params.sym}?interval=1d&range=1mo`,
      {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
          "Accept": "application/json",
        },
      }
    );
    if (!r.ok) throw new Error(`Yahoo Finance: ${r.status}`);
    const data = await r.json();
    if (!data.chart?.result?.[0]) {
      throw new Error(`Ticker non trovato: ${req.params.sym}`);
    }
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.use(express.static(path.join(__dirname, "../frontend/dist")));
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "../frontend/dist/index.html"));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`FINTERM running on port ${PORT}`));
