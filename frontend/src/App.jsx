import { useState, useEffect, useCallback, useRef } from "react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTip,
  ResponsiveContainer, LineChart, Line, ReferenceLine, BarChart, Bar
} from "recharts";

const CACHE_TTL = 5 * 60 * 1000;
const QUICK = {
  equity:["AAPL","MSFT","NVDA","TSLA","GOOGL","AMZN","META","JPM","AMD"],
  etf:["SPY","QQQ","IWM","GLD","TLT","VTI","SOXX","ARKK","CQQQ"],
  crypto:["BTC","ETH","SOL","BNB","XRP","ADA","AVAX","LINK","DOT"],
};
const IND_HELP = {
  RSI:"RSI: misura la velocità dei movimenti. Sopra 70 = possibile inversione ribasso. Sotto 30 = possibile rimbalzo.",
  SMA20:"Media Mobile 20gg: media degli ultimi 20 prezzi. Sopra = trend positivo. Sotto = trend negativo.",
  SMA7:"Media Mobile 7gg: più reattiva. Utile per cogliere cambi di momentum a breve.",
  VOL:"Volume: quanti asset scambiati nelle 24h. Volume alto conferma il movimento di prezzo.",
};
const fmt = {
  price:n=>n==null?"--":n>=1000?n.toLocaleString("en-US",{maximumFractionDigits:2}):n>=1?n.toFixed(2):n<0.01?n.toFixed(6):n.toFixed(4),
  large:n=>{if(n==null)return"--";const a=Math.abs(n);if(a>=1e12)return`${(n/1e12).toFixed(2)}T`;if(a>=1e9)return`${(n/1e9).toFixed(2)}B`;if(a>=1e6)return`${(n/1e6).toFixed(2)}M`;return n.toLocaleString();},
  pct:n=>n==null?"--":`${Number(n)>=0?"+":""}${Number(n).toFixed(2)}%`,
};
function sma(arr,p){return arr.map((_,i)=>{if(i<p-1)return null;return arr.slice(i-p+1,i+1).reduce((a,b)=>a+b,0)/p;});}
function rsiCalc(arr,p=14){if(arr.length<p+1)return arr.map(()=>null);const d=arr.slice(1).map((v,i)=>v-arr[i]);return[null,...d.map((_,i)=>{if(i<p-1)return null;const s=d.slice(Math.max(0,i-p+1),i+1);const g=s.filter(x=>x>0).reduce((a,b)=>a+b,0)/p;const l=s.filter(x=>x<0).reduce((a,b)=>a+Math.abs(b),0)/p;if(l===0)return 100;return 100-100/(1+g/l);})];}
function calcSignal(data,rsi,abv20,abv7){if(!data)return null;let sc=0;const p=Number(data.changePct24h||0);if(p>0)sc++;if(p>2)sc++;if(abv20)sc++;if(abv7)sc++;if(rsi!=null){if(rsi>50&&rsi<68)sc++;if(rsi>=70)sc--;if(rsi<35)sc--;}
  if(sc>=4)return{label:"BULLISH",it:"Momento positivo 📈",color:"#00e676",bg:"rgba(0,230,118,.08)",border:"#00e676",dot:"#00e676"};
  if(sc>=2)return{label:"NEUTRALE",it:"Momento neutrale ➡️",color:"#ffb300",bg:"rgba(255,179,0,.08)",border:"#ffb300",dot:"#ffb300"};
  return{label:"BEARISH",it:"Momento negativo 📉",color:"#ff4057",bg:"rgba(255,64,87,.08)",border:"#ff4057",dot:"#ff4057"};}
function simpleRisk(pct,rsi){const a=Math.abs(Number(pct||0));let r=0;if(a>5)r++;if(a>10)r++;if(rsi!=null&&(rsi>75||rsi<25))r++;if(r>=2)return{label:"Alto ⚠️",color:"#ff4057"};if(r===1)return{label:"Medio 🟡",color:"#ffb300"};return{label:"Basso ✅",color:"#00e676"};}

async function fetchMarketData(sym, type) {
  const r = await fetch("/api/market", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sym, type }),
  });
  if (!r.ok) throw new Error(`Errore server ${r.status}`);
  const json = await r.json();
  if (json.error) throw new Error(json.error);
  if (!json.price) throw new Error(`Nessun dato ricevuto per ${sym}`);
  return json;
}

async function runAIAnalysis(sym, data, mode, onChunk, onStatus) {
  const isSimple = mode === "simple";
  const date = new Date().toLocaleDateString("it-IT", { day:"numeric", month:"long", year:"numeric" });
  const prompt = isSimple
    ? `Oggi è ${date}. Sei un consulente finanziario che spiega a NON esperti.\nASSET: ${data.name} (${sym})\nPrezzo: $${fmt.price(data.price)} (${fmt.pct(data.changePct24h)} oggi)\nMCap: ${fmt.large(data.marketCap)}\n${data.rank?`Rank: #${data.rank}`:""}\nFai una ricerca web su notizie recenti, poi scrivi in ITALIANO semplice:\n[SINTESI]\n2-3 frasi chiare: cosa sta succedendo e perché è importante.\n[/SINTESI]\n[NOTIZIE]\n• notizia 1 spiegata semplicemente\n• notizia 2\n• notizia 3\n[/NOTIZIE]\n[COSA FARE]\n2-3 frasi pratiche per un principiante. No consigli finanziari diretti.\n[/COSA FARE]`
    : `Oggi è ${date}. Sei un analista quantitativo senior.\nASSET: ${data.name} (${sym})\nPrezzo: $${fmt.price(data.price)} (${fmt.pct(data.changePct24h)})\nVolume: ${fmt.large(data.volume24h)} | MCap: ${fmt.large(data.marketCap)}\n${data.rank?`CMC: #${data.rank}`:""}${data.pe?` | P/E: ${data.pe}x`:""}\n${data.ath?`ATH: $${fmt.price(data.ath)} (${fmt.pct(data.athChangePct)})`:""}\nFai ricerca web, poi in ITALIANO:\n▸ TREND TECNICO\n[1 frase]\n▸ SUPPORTI / RESISTENZE\nS1: $X | S2: $X\nR1: $X | R2: $X\n▸ CATALYST RECENTI\n• news1\n• news2\n• news3\n▸ TARGET 30gg\nBull: $X | Base: $X | Bear: $X\n▸ RISK/REWARD\nScore: X/10 — motivazione\n▸ SENTIMENT\nEmoji X/10 — frase\n▸ OPERATIVITÀ\n[LONG/SHORT/NEUTRALE — entry, stop, target]`;
  onStatus("Ricerca web in corso...");
  const r = await fetch("/api/ai", {
    method:"POST", headers:{"Content-Type":"application/json"},
    body: JSON.stringify({ prompt }),
  });
  if (!r.ok) throw new Error(`AI ${r.status}`);
  onStatus("Analisi in corso...");
  const json = await r.json();
  if (json.error) throw new Error(json.error);
  onChunk(json.text || "Nessuna risposta.");
}

const ChartTip = ({active,payload,label,type}) => {
  if(!active||!payload?.length)return null;
  return(<div style={{background:"#0c1525",border:"1px solid #1e3350",padding:"8px 10px",fontFamily:"JetBrains Mono",fontSize:"9px",color:"#ccd8e8"}}><div style={{color:"#3a4e62",marginBottom:3}}>{label}</div>{payload.map((p,i)=>p.value!=null&&(<div key={i} style={{color:p.color,display:"flex",gap:8}}><span style={{color:"#7a90a8"}}>{String(p.name).toUpperCase()}</span><span>{type==="vol"?fmt.large(p.value):type==="rsi"?Number(p.value).toFixed(1):`$${fmt.price(p.value)}`}</span></div>))}</div>);
};
function IndBadge({label,value,valClass,help,onHover}){return(<div style={{display:"flex",gap:6,padding:"3px 10px",background:"#0c1525",fontSize:9,cursor:"help",position:"relative"}} onMouseEnter={()=>onHover(help)} onMouseLeave={()=>onHover(null)}><span style={{color:"#3a4e62"}}>{label}</span><span style={{color:valClass==="g"?"#00e676":valClass==="r"?"#ff4057":valClass==="a"?"#ffb300":"#7a90a8"}}>{value}</span><span style={{color:"#1e3350",fontSize:8}}>ⓘ</span></div>);}
function Semaphore({signal,simple}){if(!signal)return null;return(<div style={{display:"flex",alignItems:"center",gap:10,padding:simple?"12px 16px":"6px 12px",border:`1px solid ${signal.border}`,background:signal.bg,borderRadius:2,marginBottom:simple?12:0}}><div style={{width:simple?16:10,height:simple?16:10,borderRadius:"50%",background:signal.dot,flexShrink:0}}/><div><div style={{fontSize:simple?13:9,fontWeight:700,color:signal.color,letterSpacing:simple?1:2}}>{simple?signal.it:signal.label}</div>{simple&&<div style={{fontSize:10,color:"#7a90a8",marginTop:2}}>Segnale tecnico aggregato</div>}</div></div>);}
function SimpleCard({label,value,color,explain}){return(<div style={{background:"#070d18",border:"1px solid #152030",padding:"10px 14px",borderRadius:2}}><div style={{fontSize:9,color:"#3a4e62",letterSpacing:"2px",marginBottom:4,textTransform:"uppercase"}}>{label}</div><div style={{fontSize:13,fontWeight:600,color:color||"#ccd8e8"}}>{value}</div>{explain&&<div style={{fontSize:9,color:"#7a90a8",marginTop:4,lineHeight:1.5}}>{explain}</div>}</div>);}

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;600;700&family=Barlow:wght@700;900&display=swap');
*{margin:0;padding:0;box-sizing:border-box}
:root{--bg:#04080f;--bg2:#070d18;--bg3:#0c1525;--green:#00e676;--red:#ff4057;--amber:#ffb300;--blue:#4fc3f7;--t1:#ccd8e8;--t2:#7a90a8;--t3:#3a4e62;--br:#152030;--br2:#1e3350}
body{background:var(--bg);font-family:'JetBrains Mono',monospace;color:var(--t1)}
.app{min-height:100vh;display:flex;flex-direction:column}
.scanline{position:fixed;inset:0;background:repeating-linear-gradient(0deg,transparent,transparent 3px,rgba(0,0,0,.06) 3px,rgba(0,0,0,.06) 4px);pointer-events:none;z-index:9999}
.hdr{display:flex;align-items:center;justify-content:space-between;padding:0 16px;height:50px;background:var(--bg2);border-bottom:1px solid var(--br2);flex-shrink:0;gap:12px}
.logo{font-family:'Barlow',sans-serif;font-size:20px;font-weight:900;letter-spacing:3px;color:var(--green);flex-shrink:0}
.logo em{color:var(--t3);font-style:normal}
.hdr-mid{display:flex;align-items:center;gap:6px;flex:1;justify-content:center;flex-wrap:wrap}
.tabs{display:flex;gap:2px}
.tab{padding:5px 14px;font-size:9px;letter-spacing:2px;text-transform:uppercase;border:1px solid var(--br2);background:transparent;color:var(--t3);cursor:pointer;font-family:'JetBrains Mono',monospace;transition:all .15s}
.tab.on{background:var(--green);color:#000;border-color:var(--green);font-weight:700}
.tab:hover:not(.on){color:var(--green);border-color:var(--green)}
.mode-wrap{display:flex;border:1px solid var(--br2);overflow:hidden;flex-shrink:0}
.mode-btn{padding:5px 12px;font-size:9px;letter-spacing:1.5px;text-transform:uppercase;background:transparent;color:var(--t3);cursor:pointer;font-family:'JetBrains Mono',monospace;border:none;transition:all .15s}
.mode-btn.on{background:var(--blue);color:#000;font-weight:700}
.mode-btn:hover:not(.on){color:var(--blue)}
.clock{font-size:10px;color:var(--t3);letter-spacing:1px;text-align:right;flex-shrink:0}
.clock b{color:var(--t2)}
.search{display:flex;gap:8px;padding:10px 16px;background:var(--bg2);border-bottom:1px solid var(--br);flex-shrink:0}
.sinput{flex:1;background:var(--bg3);border:1px solid var(--br2);color:var(--t1);font-family:'JetBrains Mono',monospace;font-size:13px;padding:8px 12px;text-transform:uppercase;outline:none;transition:border-color .15s}
.sinput:focus{border-color:var(--green)}
.sinput::placeholder{color:var(--t3);text-transform:none;font-size:11px}
.sbtn{background:var(--green);color:#000;border:none;padding:8px 18px;font-family:'JetBrains Mono',monospace;font-size:11px;font-weight:700;letter-spacing:2px;cursor:pointer;flex-shrink:0;transition:opacity .15s}
.sbtn:hover:not(:disabled){opacity:.85}
.sbtn:disabled{opacity:.4;cursor:not-allowed}
.sbtn.g{background:transparent;border:1px solid var(--br2);color:var(--t3)}
.sbtn.g:hover:not(:disabled){border-color:var(--green);color:var(--green);opacity:1}
.qpicks{display:flex;gap:4px;padding:7px 16px;background:var(--bg2);border-bottom:1px solid var(--br);flex-wrap:wrap;flex-shrink:0}
.qlabel{font-size:8px;color:var(--t3);letter-spacing:2px;align-self:center;margin-right:4px}
.qp{font-size:9px;padding:2px 8px;border:1px solid var(--br2);color:var(--t3);background:transparent;cursor:pointer;font-family:'JetBrains Mono',monospace;transition:all .1s}
.qp:hover{border-color:var(--green);color:var(--green)}
.phdr{padding:12px 16px;background:var(--bg2);border-bottom:1px solid var(--br);flex-shrink:0}
.aname{font-size:9px;color:var(--t3);letter-spacing:2px;text-transform:uppercase;margin-bottom:5px}
.prow{display:flex;align-items:baseline;gap:12px;margin-bottom:8px;flex-wrap:wrap}
.bp{font-size:32px;font-weight:700;color:#fff;letter-spacing:-1px;line-height:1}
.chg{font-size:14px;font-weight:600}
.chg.up{color:var(--green)}.chg.dn{color:var(--red)}
.mrow{display:flex;gap:18px;flex-wrap:wrap;margin-bottom:8px}
.metric{display:flex;flex-direction:column;gap:2px}
.mlbl{font-size:7px;color:var(--t3);letter-spacing:2px;text-transform:uppercase}
.mval{font-size:10px;color:var(--t2)}
.indrow{display:flex;gap:1px;flex-wrap:wrap;position:relative}
.grid{display:grid;grid-template-columns:1fr 340px;gap:1px;background:var(--br);flex:1;min-height:0}
.cpanel{background:var(--bg);padding:14px 16px;overflow-y:auto}
.apanel{background:var(--bg2);padding:14px;overflow-y:auto;display:flex;flex-direction:column;gap:10px}
.sgrid{display:grid;grid-template-columns:1fr 1fr;gap:1px;background:var(--br);flex:1;min-height:0}
.sleft{background:var(--bg);padding:16px;overflow-y:auto;display:flex;flex-direction:column;gap:12px}
.sright{background:var(--bg2);padding:16px;overflow-y:auto;display:flex;flex-direction:column;gap:10px}
.ptitle{font-size:8px;letter-spacing:3px;color:var(--t3);text-transform:uppercase;margin-bottom:10px}
.abtn{width:100%;background:transparent;border:1px solid var(--green);color:var(--green);font-family:'JetBrains Mono',monospace;font-size:10px;font-weight:700;letter-spacing:2px;padding:10px;cursor:pointer;transition:all .15s;text-transform:uppercase;display:flex;align-items:center;justify-content:center;gap:8px}
.abtn:hover:not(:disabled){background:var(--green);color:#000}
.abtn:disabled{border-color:var(--t3);color:var(--t3);cursor:not-allowed}
.aout{font-size:10px;line-height:1.85;color:var(--t2);white-space:pre-wrap;border:1px solid var(--br2);padding:12px;background:var(--bg);flex:1;min-height:180px;overflow-y:auto}
.aout.live{border-color:var(--green)}
.sintesi{border:1px solid var(--green);background:rgba(0,230,118,.05);padding:12px 14px;font-size:11px;line-height:1.8;color:var(--t1)}
.sintesi-label{font-size:8px;letter-spacing:2px;color:var(--green);margin-bottom:6px;text-transform:uppercase}
.help-box{position:absolute;bottom:calc(100% + 6px);left:0;right:0;background:#0c1525;border:1px solid var(--br2);padding:10px 12px;font-size:9px;line-height:1.7;color:var(--t2);z-index:200;pointer-events:none}
.center{display:flex;flex-direction:column;align-items:center;justify-content:center;flex:1;gap:14px;padding:40px}
.lbar{width:260px;height:2px;background:var(--br2);position:relative;overflow:hidden}
.lbar-i{position:absolute;height:100%;background:var(--green);animation:lslide 1.5s ease-in-out infinite}
@keyframes lslide{0%{left:-40%;width:40%}100%{left:100%;width:40%}}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}
.pulse{animation:pulse 1.4s ease-in-out infinite}
@keyframes blink{0%,100%{opacity:1}50%{opacity:0}}
.blink{animation:blink 1s step-end infinite}
.errmsg{color:var(--red);font-size:10px;padding:12px 16px;border-left:2px solid var(--red);margin:12px 16px;background:rgba(255,64,87,.05);line-height:1.7}
.sbar{display:flex;gap:16px;padding:4px 16px;background:var(--bg2);border-top:1px solid var(--br2);font-size:8px;letter-spacing:1px;color:var(--t3);flex-shrink:0}
.sbar .on{color:var(--green)}.sbar .info{color:var(--blue)}
.status-tag{font-size:9px;color:var(--amber);letter-spacing:1px;margin-bottom:6px}
.scards{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.dr{display:flex;justify-content:space-between;font-size:9px;padding:3px 0;border-bottom:1px solid var(--br)}
.dk{color:var(--t3);letter-spacing:1.5px}.dv{color:var(--t2)}
`;

export default function FinTerm() {
  const [mode,setMode]=useState("simple");
  const [tab,setTab]=useState("crypto");
  const [input,setInput]=useState("BTC");
  const [ticker,setTicker]=useState(null);
  const [mktData,setMktData]=useState(null);
  const [chart,setChart]=useState([]);
  const [phase,setPhase]=useState("idle");
  const [loadMsg,setLoadMsg]=useState("");
  const [err,setErr]=useState(null);
  const [analysis,setAnalysis]=useState("");
  const [sintesi,setSintesi]=useState("");
  const [aiPhase,setAiPhase]=useState("idle");
  const [aiStatus,setAiStatus]=useState("");
  const [tooltip,setTooltip]=useState(null);
  const [time,setTime]=useState(new Date());
  const cacheRef=useRef(new Map());

  useEffect(()=>{
    const t=setInterval(()=>setTime(new Date()),1000);
    const l=document.createElement("link");l.rel="stylesheet";
    l.href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;600;700&family=Barlow:wght@700;900&display=swap";
    document.head.appendChild(l);
    return()=>clearInterval(t);
  },[]);

  const doFetch=useCallback(async(sym,at)=>{
    setPhase("loading");setErr(null);setMktData(null);setChart([]);
    setAnalysis("");setSintesi("");setAiPhase("idle");setAiStatus("");
    const ck=`${sym}_${at}`,cached=cacheRef.current.get(ck);
    if(cached&&Date.now()-cached.ts<CACHE_TTL){setMktData(cached.d);setChart(cached.c||[]);setPhase("done");return;}
    setLoadMsg(`GEMINI CERCA DATI ${sym}...`);
    try{
      const d=await fetchMarketData(sym,at);
      const h=Array.isArray(d.priceHistory)?d.priceHistory:[];
      setMktData(d);setChart(h);
      cacheRef.current.set(ck,{d,c:h,ts:Date.now()});
      setPhase("done");
    }catch(e){setErr(e.message);setPhase("error");}
  },[]);

  const execSearch=()=>{const s=input.trim().toUpperCase();if(s){setTicker(s);doFetch(s,tab);}};
  const pick=s=>{setInput(s);setTicker(s);doFetch(s,tab);};
  const switchTab=t=>{const d={equity:"AAPL",etf:"SPY",crypto:"BTC"};setTab(t);setInput(d[t]);setTicker(d[t]);doFetch(d[t],t);};

  const doAnalysis=async()=>{
    if(!mktData)return;
    setAiPhase("active");setAnalysis("");setSintesi("");setAiStatus("Avvio...");
    try{
      await runAIAnalysis(ticker,mktData,mode,
        chunk=>{setAnalysis(chunk);const m=chunk.match(/\[SINTESI\]([\s\S]*?)\[\/SINTESI\]/);if(m)setSintesi(m[1].trim());},
        st=>setAiStatus(st)
      );
    }catch(e){setAnalysis(`Errore: ${e.message}`);}
    setAiPhase("done");setAiStatus("");
  };

  const prices=chart.map(d=>d?.price).filter(Boolean);
  const sma20v=sma(prices,Math.min(20,prices.length));
  const sma7v=sma(prices,Math.min(7,prices.length));
  const rsiv=rsiCalc(prices,Math.min(14,Math.max(prices.length-1,1)));
  const enriched=chart.map((d,i)=>({...d,sma20:sma20v[i],sma7:sma7v[i],rsi:rsiv[i]}));
  const lastRSI=[...rsiv].reverse().find(v=>v!=null);
  const lastSMA20=[...sma20v].reverse().find(v=>v!=null);
  const lastSMA7=[...sma7v].reverse().find(v=>v!=null);
  const aboveSMA20=mktData?.price>lastSMA20,aboveSMA7=mktData?.price>lastSMA7;
  const rsiLabel=lastRSI>70?"OVERBOUGHT":lastRSI<30?"OVERSOLD":"NEUTRAL";
  const rsiCls=lastRSI>70?"r":lastRSI<30?"g":"a";
  const signal=calcSignal(mktData,lastRSI,aboveSMA20,aboveSMA7);
  const risk=simpleRisk(mktData?.changePct24h,lastRSI);
  const up=(mktData?.changePct24h??0)>=0,pColor=up?"#00e676":"#ff4057";
  const pMin=prices.length?Math.min(...prices)*0.994:"auto";
  const pMax=prices.length?Math.max(...prices)*1.006:"auto";
  const analysisClean=analysis.replace(/\[SINTESI\][\s\S]*?\[\/SINTESI\]\n?/,"").trim();

  return(<>
    <style>{CSS}</style>
    <div className="scanline"/>
    <div className="app">
      <div className="hdr">
        <div className="logo">FIN<em>TERM</em></div>
        <div className="hdr-mid">
          <div className="tabs">{["equity","etf","crypto"].map(t=><button key={t} className={`tab${tab===t?" on":""}`} onClick={()=>switchTab(t)}>{t}</button>)}</div>
          <div style={{width:1,height:20,background:"#1e3350"}}/>
          <div className="mode-wrap">
            <button className={`mode-btn${mode==="simple"?" on":""}`} onClick={()=>setMode("simple")}>🟢 Simple</button>
            <button className={`mode-btn${mode==="pro"?" on":""}`} onClick={()=>setMode("pro")}>⚡ Pro</button>
          </div>
        </div>
        <div className="clock"><div><b>{time.toLocaleTimeString("en-US",{hour12:false})}</b></div><div style={{fontSize:8}}>{time.toLocaleDateString("en-US",{month:"short",day:"numeric"})}</div></div>
      </div>

      <div className="search">
        <input className="sinput" value={input} onChange={e=>setInput(e.target.value.toUpperCase())} onKeyDown={e=>e.key==="Enter"&&execSearch()} placeholder={`Cerca ticker — es. ${tab==="crypto"?"BTC":tab==="etf"?"SPY":"AAPL"}`}/>
        <button className="sbtn" onClick={execSearch} disabled={phase==="loading"}>▶ CERCA</button>
        <button className="sbtn g" onClick={()=>ticker&&doFetch(ticker,tab)} disabled={phase==="loading"}>⟳</button>
      </div>

      <div className="qpicks">
        <span className="qlabel">RAPIDO▸</span>
        {QUICK[tab].map(s=><button key={s} className="qp" onClick={()=>pick(s)}>{s}</button>)}
      </div>

      {phase==="loading"&&<div className="center"><div className="pulse" style={{fontSize:11,color:"#3a4e62",letterSpacing:"2px"}}>{loadMsg}<span className="blink"> ▋</span></div><div className="lbar"><div className="lbar-i"/></div><div style={{fontSize:9,color:"#152030",letterSpacing:"1.5px",textAlign:"center"}}>GEMINI AI · WEB SEARCH<br/>Recupero dati in corso (~15s)...</div></div>}
      {phase==="error"&&<div className="errmsg">✕ {err}<br/><span style={{color:"#3a4e62",fontSize:9}}>Riprova con ⟳</span></div>}
      {phase==="idle"&&<div className="center"><div style={{fontSize:13,color:"#1e3350",letterSpacing:3}}>FINTERM v3.0</div><div style={{fontSize:9,color:"#152030",letterSpacing:"1.5px",textAlign:"center",lineHeight:1.9}}>Cerca un ticker o usa i quick pick<br/><span style={{color:"#3a4e62"}}>{mode==="simple"?"Modalità Simple: linguaggio chiaro":"Modalità Pro: analisi tecnica"}</span></div></div>}

      {phase==="done"&&mktData&&<>
        <div className="phdr">
          <div className="aname">{mktData.name} · {mktData.symbol}{mktData.rank?` · #${mktData.rank}`:""}{mktData.exchange?` · ${mktData.exchange}`:""}</div>
          <div className="prow">
            <div className="bp">${fmt.price(mktData.price)}</div>
            <div className={`chg ${up?"up":"dn"}`}>{up?"▲":"▼"} ${fmt.price(Math.abs(mktData.change24h||0))} ({fmt.pct(mktData.changePct24h)})</div>
            {mode==="simple"&&signal&&<Semaphore signal={signal} simple={false}/>}
          </div>
          <div className="mrow">
            {[["24H HIGH",`$${fmt.price(mktData.high24h)}`],["24H LOW",`$${fmt.price(mktData.low24h)}`],["VOLUME",fmt.large(mktData.volume24h)],["MKT CAP",fmt.large(mktData.marketCap)],mktData.ath&&["ATH",`$${fmt.price(mktData.ath)}`],mktData.athChangePct&&["DA ATH",fmt.pct(mktData.athChangePct)],mktData.pe&&["P/E",`${Number(mktData.pe).toFixed(1)}x`],mktData.fiftyTwoHigh&&["52W MAX",`$${fmt.price(mktData.fiftyTwoHigh)}`],mktData.fiftyTwoLow&&["52W MIN",`$${fmt.price(mktData.fiftyTwoLow)}`]].filter(Boolean).map(([l,v])=><div key={l} className="metric"><div className="mlbl">{l}</div><div className="mval">{v}</div></div>)}
          </div>
          {mode==="pro"&&<div className="indrow">
            {lastRSI!=null&&<IndBadge label="RSI 14" value={`${lastRSI.toFixed(1)} · ${rsiLabel}`} valClass={rsiCls} help={IND_HELP.RSI} onHover={setTooltip}/>}
            {lastSMA20!=null&&<IndBadge label="SMA 20" value={`$${fmt.price(lastSMA20)} ${aboveSMA20?"▲":"▼"}`} valClass={aboveSMA20?"g":"r"} help={IND_HELP.SMA20} onHover={setTooltip}/>}
            {lastSMA7!=null&&<IndBadge label="SMA 7" value={`$${fmt.price(lastSMA7)} ${aboveSMA7?"▲":"▼"}`} valClass={aboveSMA7?"g":"r"} help={IND_HELP.SMA7} onHover={setTooltip}/>}
            <div style={{display:"flex",gap:5,padding:"2px 8px",background:"#0c1525",fontSize:8}}><span style={{color:"#3a4e62"}}>BIAS</span><span style={{color:up?"#00e676":"#ff4057"}}>{up?"▲ BULLISH":"▼ BEARISH"}</span></div>
            {tooltip&&<div className="help-box">{tooltip}</div>}
          </div>}
        </div>

        {mode==="simple"&&<div className="sgrid">
          <div className="sleft">
            <Semaphore signal={signal} simple={true}/>
            {enriched.length>2&&<><div className="ptitle">ANDAMENTO — ULTIMI {enriched.length} GIORNI</div>
            <ResponsiveContainer width="100%" height={170}><AreaChart data={enriched} margin={{top:4,right:4,left:0,bottom:0}}><defs><linearGradient id="pg2" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={pColor} stopOpacity={0.2}/><stop offset="95%" stopColor={pColor} stopOpacity={0}/></linearGradient></defs><CartesianGrid strokeDasharray="1 5" stroke="#152030"/><XAxis dataKey="date" tick={{fill:"#3a4e62",fontSize:8,fontFamily:"JetBrains Mono"}} tickLine={false} axisLine={false}/><YAxis domain={[pMin,pMax]} tick={{fill:"#3a4e62",fontSize:8,fontFamily:"JetBrains Mono"}} tickLine={false} axisLine={false} width={68} tickFormatter={v=>`$${fmt.price(v)}`}/><RechartsTip content={<ChartTip type="price"/>}/><Area type="monotone" dataKey="price" name="price" stroke={pColor} strokeWidth={2} fill="url(#pg2)" dot={false} activeDot={{r:4,fill:pColor}}/></AreaChart></ResponsiveContainer></>}
            <div className="scards">
              <SimpleCard label="Trend attuale" value={up?"▲ In salita":"▼ In discesa"} color={up?"#00e676":"#ff4057"} explain={`${fmt.pct(mktData.changePct24h)} nelle ultime 24h.`}/>
              <SimpleCard label="Livello di rischio" value={risk.label} color={risk.color} explain="Basato su volatilità e indicatori tecnici."/>
              {lastRSI!=null&&<SimpleCard label="Forza del movimento" value={lastRSI>60?"Forte 💪":lastRSI<40?"Debole 😴":"Media ⚖️"} explain={`RSI ${lastRSI.toFixed(0)}/100. ${lastRSI>70?"Potrebbe rallentare.":lastRSI<30?"Possibile rimbalzo.":"Zona equilibrata."}`}/>}
              <SimpleCard label="Vs media 20gg" value={aboveSMA20?"Sopra ✅":"Sotto ⚠️"} explain="Rispetto alla media degli ultimi 20 giorni."/>
            </div>
          </div>
          <div className="sright">
            <div className="ptitle">ANALISI AI — GEMINI + WEB</div>
            {sintesi&&<div className="sintesi"><div className="sintesi-label">In sintesi</div>{sintesi}</div>}
            <button className="abtn" onClick={doAnalysis} disabled={aiPhase==="active"}>{aiPhase==="active"?<><span className="pulse" style={{display:"inline-block"}}>⟳</span> {aiStatus||"Analisi..."}</>:aiPhase==="done"?"Aggiorna analisi":"Spiega cosa sta succedendo"}</button>
            {aiPhase==="active"&&aiStatus&&<div className="status-tag"><span className="pulse">{aiStatus}</span></div>}
            <div className={`aout${aiPhase==="active"?" live":""}`}>
              {aiPhase==="idle"&&<span style={{color:"#3a4e62",fontSize:9,lineHeight:1.9}}>{`Premi il pulsante per una spiegazione semplice su ${mktData.name||ticker}.\n\nGemini cercherà le ultime notizie e spiegherà tutto senza gergo tecnico.`}</span>}
              {aiPhase==="active"&&!analysis&&<span className="pulse" style={{color:"#00e676"}}>Ricerca in corso...<span className="blink">▋</span></span>}
              {aiPhase!=="idle"&&analysisClean}
              {aiPhase==="active"&&<span className="blink" style={{color:"#00e676"}}> ▋</span>}
            </div>
            <div style={{fontSize:8,color:"#152030",letterSpacing:1,lineHeight:1.7}}>Informazioni solo indicative. Non costituiscono consulenza finanziaria.</div>
          </div>
        </div>}

        {mode==="pro"&&<div className="grid">
          <div className="cpanel">
            {enriched.length>2?<>
              <div className="ptitle">PRICE · {enriched.length}D · <span style={{color:"#ffb300"}}>SMA7</span> · <span style={{color:"#ce93d8"}}>SMA20</span></div>
              <ResponsiveContainer width="100%" height={190}><AreaChart data={enriched} margin={{top:4,right:4,left:0,bottom:0}}><defs><linearGradient id="pg" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={pColor} stopOpacity={0.25}/><stop offset="95%" stopColor={pColor} stopOpacity={0}/></linearGradient></defs><CartesianGrid strokeDasharray="1 5" stroke="#152030"/><XAxis dataKey="date" tick={{fill:"#3a4e62",fontSize:8,fontFamily:"JetBrains Mono"}} tickLine={false} axisLine={false}/><YAxis domain={[pMin,pMax]} tick={{fill:"#3a4e62",fontSize:8,fontFamily:"JetBrains Mono"}} tickLine={false} axisLine={false} width={68} tickFormatter={v=>`$${fmt.price(v)}`}/><RechartsTip content={<ChartTip type="price"/>}/><Area type="monotone" dataKey="price" name="price" stroke={pColor} strokeWidth={1.5} fill="url(#pg)" dot={false} activeDot={{r:3,fill:pColor}}/><Line type="monotone" dataKey="sma7" name="sma7" stroke="#ffb300" strokeWidth={1} dot={false} strokeDasharray="3 3"/><Line type="monotone" dataKey="sma20" name="sma20" stroke="#ce93d8" strokeWidth={1} dot={false} strokeDasharray="4 2"/></AreaChart></ResponsiveContainer>
              <div className="ptitle" style={{marginTop:10}}>VOLUME</div>
              <ResponsiveContainer width="100%" height={55}><BarChart data={enriched} margin={{top:0,right:4,left:0,bottom:0}}><CartesianGrid strokeDasharray="1 5" stroke="#152030" vertical={false}/><XAxis dataKey="date" tick={{fill:"#3a4e62",fontSize:8,fontFamily:"JetBrains Mono"}} tickLine={false} axisLine={false}/><YAxis tick={{fill:"#3a4e62",fontSize:8,fontFamily:"JetBrains Mono"}} tickLine={false} axisLine={false} width={68} tickFormatter={v=>fmt.large(v)}/><RechartsTip content={<ChartTip type="vol"/>}/><Bar dataKey="volume" name="volume" fill="#1e3350" radius={[1,1,0,0]}/></BarChart></ResponsiveContainer>
              {rsiv.filter(Boolean).length>3&&<><div className="ptitle" style={{marginTop:10}}>RSI (14)</div><ResponsiveContainer width="100%" height={80}><LineChart data={enriched} margin={{top:4,right:4,left:0,bottom:0}}><CartesianGrid strokeDasharray="1 5" stroke="#152030"/><XAxis dataKey="date" tick={{fill:"#3a4e62",fontSize:8,fontFamily:"JetBrains Mono"}} tickLine={false} axisLine={false}/><YAxis domain={[0,100]} tick={{fill:"#3a4e62",fontSize:8,fontFamily:"JetBrains Mono"}} tickLine={false} axisLine={false} width={26} ticks={[30,50,70]}/><RechartsTip content={<ChartTip type="rsi"/>}/><ReferenceLine y={70} stroke="#ff4057" strokeDasharray="2 4" strokeWidth={1}/><ReferenceLine y={30} stroke="#00e676" strokeDasharray="2 4" strokeWidth={1}/><Line type="monotone" dataKey="rsi" name="rsi" stroke="#4fc3f7" strokeWidth={1.5} dot={false} activeDot={{r:3}}/></LineChart></ResponsiveContainer></>}
            </>:<div style={{color:"#3a4e62",fontSize:9,lineHeight:1.7}}>Dati storici insufficienti. Premi ⟳ per riprovare.</div>}
          </div>
          <div className="apanel">
            <div className="ptitle">AI ANALYSIS · PRO · GEMINI</div>
            <div style={{display:"flex",flexDirection:"column",gap:0}}>
              {[["ASSET",`${mktData.name} (${mktData.symbol})`],["PRICE",`$${fmt.price(mktData.price)}`],["24H",fmt.pct(mktData.changePct24h)],["MCAP",fmt.large(mktData.marketCap)],["VOLUME",fmt.large(mktData.volume24h)],mktData.rank&&["RANK",`#${mktData.rank}`],mktData.pe&&["P/E",`${Number(mktData.pe).toFixed(1)}x`],lastRSI!=null&&["RSI 14",`${lastRSI.toFixed(1)} (${rsiLabel})`],lastSMA20!=null&&["SMA 20",`${aboveSMA20?"▲":"▼"} $${fmt.price(lastSMA20)}`],signal&&["SIGNAL",signal.label]].filter(Boolean).map(([k,v])=><div key={k} className="dr"><span className="dk">{k}</span><span className="dv">{v}</span></div>)}
            </div>
            <button className="abtn" onClick={doAnalysis} disabled={aiPhase==="active"}>{aiPhase==="active"?<><span className="pulse" style={{display:"inline-block"}}>⟳</span> {aiStatus||"Analisi..."}</>:aiPhase==="done"?"Aggiorna analisi":"▶ RUN AI ANALYSIS"}</button>
            {aiPhase==="active"&&aiStatus&&<div className="status-tag"><span className="pulse">{aiStatus}</span></div>}
            <div className={`aout${aiPhase==="active"?" live":""}`}>
              {aiPhase==="idle"&&<span style={{color:"#3a4e62",fontSize:9,lineHeight:1.9}}>{`Premi ▶ RUN AI ANALYSIS:\n\n• Trend tecnico\n• Supporti & resistenze\n• Catalyst recenti\n• Target 30gg\n• Risk/reward score\n• Entry, stop, target`}</span>}
              {aiPhase==="active"&&!analysis&&<span className="pulse" style={{color:"#00e676"}}>Ricerca web...<span className="blink">▋</span></span>}
              {aiPhase!=="idle"&&analysis}
              {aiPhase==="active"&&<span className="blink" style={{color:"#00e676"}}> ▋</span>}
            </div>
          </div>
        </div>}
      </>}

      <div className="sbar">
        <span className="on">● ONLINE</span>
        <span className="info">FINTERM v3</span>
        <span>{tab.toUpperCase()}</span>
        <span style={{color:"#3a4e62"}}>{mode.toUpperCase()}</span>
        {mktData&&<span style={{color:"#7a90a8"}}>{mktData.symbol} · ${fmt.price(mktData.price)}</span>}
        {signal&&<span style={{color:signal.color}}>● {signal.label}</span>}
        <span style={{marginLeft:"auto"}}>{time.toLocaleTimeString("en-US",{hour12:false})}</span>
      </div>
    </div>
  </>);
}
