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

const SLUG = {
  BTC:"bitcoin",ETH:"ethereum",SOL:"solana",BNB:"binance-coin",
  XRP:"xrp",ADA:"cardano",AVAX:"avalanche",LINK:"chainlink",
  DOT:"polkadot",DOGE:"dogecoin",MATIC:"polygon",ATOM:"cosmos",
  UNI:"uniswap",LTC:"litecoin",BCH:"bitcoin-cash",
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
    const slug = SLUG[req.params.id.toUpperCase()] || req.params.id.toLowerCase();

    const [assetRes, histRes] = await Promise.all([
      fetch(`https://api.coincap.io/v2/assets/${slug}`),
      fetch(`https://api.coincap.io/v2/assets/${slug}/history?interval=d1`),
    ]);

    if (!assetRes.ok) throw new Error(`Asset non trovato: ${slug}`);
    const assetJson = await assetRes.json();
    const histJson = await histRes.json();

    const a = assetJson.data;
    if (!a) throw new Error(`Nessun dato per ${slug}`);

    const prices = (histJson.data || []).slice(-20);
    const priceHistory = prices.map((p) => ({
      date: new Date(p.time).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      price: parseFloat(p.priceUsd),
      volume: 0,
    }));

    const price = parseFloat(a.priceUsd);
    const change24h = parseFloat(a.changePercent24Hr);

    const mkt = [{
      symbol: a.symbol,
      name: a.name,
      current_price: price,
      price_change_24h: price * change24h / 100,
      price_change_percentage_24h: change24h,
      high_24h: price * 1.01,
      low_24h: price * 0.99,
      total_volume: parseFloat(a.volumeUsd24Hr),
      market_cap: parseFloat(a.marketCapUsd),
      market_cap_rank: parseInt(a.rank),
      ath: null,
      ath_change_percentage: null,
      circulating_supply: parseFloat(a.supply),
    }];

    res.json({ mkt, hist: { prices: prices.map((p) => [p.time, parseFloat(p.priceUsd)]), total_volumes: [] }, priceHistory });
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
    if (!data.chart?.result?.[0]) throw new Error(`Ticker non trovato: ${req.params.sym}`);
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
