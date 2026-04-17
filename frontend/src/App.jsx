import { useState, useEffect, useRef, useCallback } from "react";

// ─── Configuration ───
const API_BASE = (import.meta.env.VITE_API_BASE || "http://localhost:8000").replace(/\/+$/, "");
const WS_URL = (import.meta.env.VITE_WS_URL || `${API_BASE.replace(/^http/i, "ws")}/ws/analyze`).replace(/\/+$/, "");

// ─── Agent Definitions ───
const AGENTS = [
  { id: "budget", name: "Budget Analyst", icon: "📊", color: "#00FFB2", bg: "rgba(0,255,178,0.06)", border: "rgba(0,255,178,0.2)" },
  { id: "debt", name: "Debt Strategist", icon: "🎯", color: "#FF5A5A", bg: "rgba(255,90,90,0.06)", border: "rgba(255,90,90,0.2)" },
  { id: "invest", name: "Investment Advisor", icon: "📈", color: "#3DD6D0", bg: "rgba(61,214,208,0.06)", border: "rgba(61,214,208,0.2)" },
  { id: "tax", name: "Tax Optimizer", icon: "🏛️", color: "#FFCF56", bg: "rgba(255,207,86,0.06)", border: "rgba(255,207,86,0.2)" },
  { id: "goal", name: "Goal Planner", icon: "🏠", color: "#B088F9", bg: "rgba(176,136,249,0.06)", border: "rgba(176,136,249,0.2)" },
];

const FLOW = [
  { id: "intake", label: "Intake", icon: "📥" },
  { id: "budget", label: "Budget", icon: "📊" },
  { id: "debt", label: "Debt", icon: "🎯" },
  { id: "invest", label: "Invest", icon: "📈" },
  { id: "tax", label: "Tax", icon: "🏛️" },
  { id: "roadmap", label: "Roadmap", icon: "🗺️" },
];

const normalizeCurrencyCode = (value) => {
  const code = String(value || "USD").trim().toUpperCase();
  return code || "USD";
};

const currencyPrefix = (currencyCode) => {
  const code = normalizeCurrencyCode(currencyCode);
  if (code === "USD") return "$";
  return `${code} `;
};

const formatMoney = (value, currencyCode = "USD") => {
  return `${currencyPrefix(currencyCode)}${Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
};

const formatLogCurrency = (text, currencyCode = "USD") => {
  const code = normalizeCurrencyCode(currencyCode);
  if (code === "USD") return text;
  return String(text || "").replace(/\$/g, currencyPrefix(code));
};

const DEFAULT_PROFILE = {
  monthly_income: 7500,
  expenses: { Housing: 2100, Food: 650, Transport: 400, Subscriptions: 180, Shopping: 520, Utilities: 220, Entertainment: 310, Insurance: 280, Miscellaneous: 190 },
  debts: [
    { name: "Student Loan", balance: 28000, interest_rate: 5.5, minimum_payment: 320 },
    { name: "Credit Card", balance: 4200, interest_rate: 22.9, minimum_payment: 120 },
    { name: "Car Loan", balance: 12000, interest_rate: 6.2, minimum_payment: 280 },
  ],
  savings: 8500,
  investments: 15000,
  retirement_contributions: 500,
  tax_filing_status: "single",
  annual_income: 90000,
  goal: "Buy a house in 3 years",
  goal_amount: 60000,
  goal_timeline_months: 36,
  age: 30,
  risk_tolerance: "moderate",
  employer_401k_match: 4.0,
  currency: "USD",
};

// ─── Small Components ───

function Spark({ data, color, w = 110, h = 28 }) {
  const mx = Math.max(...data), mn = Math.min(...data), rng = mx - mn || 1;
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - ((v - mn) / rng) * (h - 4) - 2}`).join(" ");
  return <svg width={w} height={h}><polyline fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" points={pts} /></svg>;
}

function Donut({ segments, size = 130, currencyCode = "USD" }) {
  const total = segments.reduce((s, d) => s + d.value, 0);
  let cum = 0;
  const r = 46, cx = 58, cy = 58, sw = 20, circ = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} viewBox="0 0 116 116">
      {segments.map((seg, i) => {
        const pct = seg.value / total, dl = pct * circ, doff = -cum * circ;
        cum += pct;
        return <circle key={i} cx={cx} cy={cy} r={r} fill="none" stroke={seg.color} strokeWidth={sw} strokeDasharray={`${dl} ${circ - dl}`} strokeDashoffset={doff} transform={`rotate(-90 ${cx} ${cy})`} opacity="0.8" />;
      })}
      <text x={cx} y={cy - 4} textAnchor="middle" fill="#E2E8F0" fontSize="13" fontWeight="700" fontFamily="inherit">
        {currencyPrefix(currencyCode)}{(total / 1000).toFixed(1)}k
      </text>
      <text x={cx} y={cy + 10} textAnchor="middle" fill="#64748B" fontSize="8.5" fontFamily="inherit">/month</text>
    </svg>
  );
}

function DebtBar({ name, balance, rate, max, color, currencyCode }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 3 }}>
        <span style={{ color: "#E2E8F0" }}>{name}</span>
        <span style={{ color: "#64748B" }}>{formatMoney(balance, currencyCode)} · {rate}%</span>
      </div>
      <div style={{ height: 7, borderRadius: 4, background: "rgba(255,255,255,0.04)", overflow: "hidden" }}>
        <div style={{ width: `${(balance / max) * 100}%`, height: "100%", borderRadius: 4, background: color, transition: "width 1s" }} />
      </div>
    </div>
  );
}

function MetricCard({ label, value, color, spark }) {
  return (
    <div style={{ background: "#111827", borderRadius: 10, padding: "12px 13px 8px", border: "1px solid rgba(255,255,255,0.05)" }}>
      <div style={{ fontSize: 9.5, color: "#64748B", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 19, fontWeight: 700, color, fontFamily: "'Outfit', sans-serif" }}>{value}</div>
      {spark && <Spark data={spark} color={color} />}
    </div>
  );
}

// ─── Profile Editor Modal ───

function ProfileEditor({ profile, onSave, onClose }) {
  const [data, setData] = useState(JSON.stringify(profile, null, 2));
  const [error, setError] = useState("");

  const handleSave = () => {
    try {
      const parsed = JSON.parse(data);
      setError("");
      onSave(parsed);
    } catch (e) {
      setError("Invalid JSON: " + e.message);
    }
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}>
      <div style={{ background: "#0F172A", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 14, padding: 24, width: "90%", maxWidth: 600, maxHeight: "80vh", display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h2 style={{ fontFamily: "'Outfit', sans-serif", fontSize: 18, fontWeight: 600, margin: 0, color: "#E2E8F0" }}>Edit Financial Profile</h2>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#64748B", fontSize: 20, cursor: "pointer" }}>✕</button>
        </div>
        <textarea
          value={data}
          onChange={(e) => setData(e.target.value)}
          style={{
            flex: 1, minHeight: 300, background: "#1E293B", color: "#E2E8F0", border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 8, padding: 14, fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, lineHeight: 1.6, resize: "vertical",
          }}
        />
        {error && <div style={{ color: "#FF5A5A", fontSize: 12, marginTop: 8 }}>{error}</div>}
        <div style={{ display: "flex", gap: 10, marginTop: 16, justifyContent: "flex-end" }}>
          <button onClick={onClose} style={{ padding: "8px 20px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "transparent", color: "#64748B", fontSize: 13, cursor: "pointer" }}>Cancel</button>
          <button onClick={handleSave} style={{ padding: "8px 20px", borderRadius: 8, border: "none", background: "#00FFB2", color: "#0B0F19", fontWeight: 600, fontSize: 13, cursor: "pointer" }}>Save & Close</button>
        </div>
      </div>
    </div>
  );
}

function PromptProfileModal({ text, setText, loading, error, onGenerate, onClose }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}>
      <div style={{ background: "#0F172A", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 14, padding: 24, width: "90%", maxWidth: 700, maxHeight: "80vh", display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h2 style={{ fontFamily: "'Outfit', sans-serif", fontSize: 18, fontWeight: 600, margin: 0, color: "#E2E8F0" }}>Describe Your Finances</h2>
          <button onClick={onClose} disabled={loading} style={{ background: "none", border: "none", color: "#64748B", fontSize: 20, cursor: loading ? "not-allowed" : "pointer" }}>✕</button>
        </div>

        <p style={{ fontSize: 12, color: "#94A3B8", margin: "0 0 10px" }}>
          Type naturally, e.g. "I make $7,500 monthly, spend around $2,100 on housing, have a $4,200 credit card at 22.9%, and want to buy a house in 3 years."
        </p>

        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Type your financial details in plain English..."
          style={{
            flex: 1, minHeight: 220, background: "#1E293B", color: "#E2E8F0", border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 8, padding: 14, fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, lineHeight: 1.6, resize: "vertical",
          }}
        />

        {error && <div style={{ color: "#FF5A5A", fontSize: 12, marginTop: 8 }}>{error}</div>}

        <div style={{ display: "flex", gap: 10, marginTop: 16, justifyContent: "flex-end" }}>
          <button onClick={onClose} disabled={loading} style={{ padding: "8px 20px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "transparent", color: "#64748B", fontSize: 13, cursor: loading ? "not-allowed" : "pointer" }}>Cancel</button>
          <button onClick={onGenerate} disabled={loading || !text.trim()} style={{ padding: "8px 20px", borderRadius: 8, border: "none", background: "#00FFB2", color: "#0B0F19", fontWeight: 600, fontSize: 13, cursor: loading || !text.trim() ? "not-allowed" : "pointer", opacity: loading || !text.trim() ? 0.6 : 1 }}>
            {loading ? "Generating..." : "Generate Profile"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════
// ─── Main App ───
// ═══════════════════════════════════════════

export default function FinanceWarRoom() {
  const [profile, setProfile] = useState(DEFAULT_PROFILE);
  const [activeStep, setActiveStep] = useState(-1);
  const [running, setRunning] = useState(false);
  const [logs, setLogs] = useState([]);
  const [results, setResults] = useState(null);
  const [showEditor, setShowEditor] = useState(false);
  const [showPromptModal, setShowPromptModal] = useState(false);
  const [promptText, setPromptText] = useState("");
  const [promptLoading, setPromptLoading] = useState(false);
  const [promptError, setPromptError] = useState("");
  const [mode, setMode] = useState("live"); // "demo" = local simulation, "live" = API/WebSocket
  const [connected, setConnected] = useState(false);
  const logsEnd = useRef(null);
  const wsRef = useRef(null);

  const totalExpenses = Object.values(profile.expenses || {}).reduce((sum, amount) => sum + (Number(amount) || 0), 0);
  const totalDebt = (profile.debts || []).reduce((sum, debt) => sum + (Number(debt.balance) || 0), 0);
  const monthlyDebtMinimum = (profile.debts || []).reduce((sum, debt) => sum + (Number(debt.minimum_payment) || 0), 0);
  const freeCash = (Number(profile.monthly_income) || 0) - totalExpenses;
  const netSavingsPerMonth = Math.max(freeCash, 0);
  const monthsToGoal = Math.max(Number(profile.goal_timeline_months) || 36, 1);
  const goalAmount = Number(profile.goal_amount) || 60000;
  const savingsProjection = Array.from({ length: 12 }, (_, index) => {
    const progress = index / 11;
    return Math.round((Number(profile.savings) || 0) + (netSavingsPerMonth * monthsToGoal * progress));
  });
  const finalProjectedSavings = savingsProjection[savingsProjection.length - 1];
  const currencyCode = normalizeCurrencyCode(profile.currency || "USD");
  const money = (value) => formatMoney(value, currencyCode);

  useEffect(() => {
    logsEnd.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  // ── Demo Mode (local simulation) ──
  const DEMO_OUTPUTS = {
    intake: [
      `Monthly income: ${money(profile.monthly_income)}`,
      `Total expenses: ${money(totalExpenses)} (${((totalExpenses / (profile.monthly_income || 1)) * 100).toFixed(1)}% of income)`,
      `Free cash flow: ${money(freeCash)}/month`,
      `Total debt: ${money(totalDebt)}`,
      `Net worth: ${money((profile.savings || 0) + (profile.investments || 0) - totalDebt)}`,
      `Goal: ${profile.goal}`,
    ],
    budget: [
      `🧾 Total spending categories: ${Object.keys(profile.expenses || {}).length}`,
      `💰 Current expenses: ${money(totalExpenses)}/month`,
      `📉 Suggested optimization target: ${money(Math.max(totalExpenses * 0.08, 0))}/month`,
      `📋 Recommended baseline split: 50/30/20`,
    ],
    debt: [
      `📌 Total debts: ${(profile.debts || []).length}`,
      `💳 Outstanding debt: ${money(totalDebt)}`,
      `📋 Minimum debt payments: ${money(monthlyDebtMinimum)}/month`,
      "🎯 Strategy: avalanche payoff (highest interest first)",
    ],
    invest: [
      `📊 Current portfolio: ${money(profile.investments)}`,
      `🎯 Risk profile: ${(profile.risk_tolerance || "moderate").toString()} (age ${profile.age || "n/a"})`,
      `⚡ Employer 401k match: ${(profile.employer_401k_match || 0).toFixed(1)}%`,
      "💡 Keep short-term goal funds in low-volatility assets",
    ],
    tax: [
      `🏛️ Filing status: ${profile.tax_filing_status || "single"}`,
      `💼 Annual income used: ${money(profile.annual_income || (profile.monthly_income || 0) * 12)}`,
      "💡 Tax strategy is generated in full in Live API mode",
    ],
    roadmap: [
      `📅 Timeline: ${monthsToGoal} months`,
      `🏠 Goal target: ${money(goalAmount)}`,
      `💵 Current savings: ${money(profile.savings)}`,
      `🚀 Projected savings at month ${monthsToGoal}: ${money(finalProjectedSavings)}`,
      finalProjectedSavings >= goalAmount
        ? `🎉 Goal is achievable with an estimated ${money(finalProjectedSavings - goalAmount)} buffer`
        : `⚠️ Estimated shortfall: ${money(goalAmount - finalProjectedSavings)} — increase monthly savings`,
    ],
  };

  const runDemo = useCallback(async () => {
    setRunning(true);
    setLogs([]);
    setResults(null);
    setActiveStep(-1);

    for (let i = 0; i < FLOW.length; i++) {
      setActiveStep(i);
      const step = FLOW[i];
      const items = DEMO_OUTPUTS[step.id] || [];

      setLogs(prev => [...prev, { step: step.id, type: "thinking", text: `${step.icon} ${step.label} agent processing...` }]);
      await new Promise(r => setTimeout(r, 700));

      for (const item of items) {
        await new Promise(r => setTimeout(r, 200));
        setLogs(prev => [...prev, { step: step.id, type: "result", text: item }]);
      }

      setLogs(prev => [...prev, { step: step.id, type: "done", text: `✅ ${step.label} complete` }]);
      await new Promise(r => setTimeout(r, 350));
    }

    setRunning(false);
  }, []);

  // ── Live Mode (WebSocket) ──
  const runLive = useCallback(async () => {
    setRunning(true);
    setLogs([]);
    setResults(null);
    setActiveStep(0);

    try {
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        setConnected(true);
        ws.send(JSON.stringify({ profile }));
      };

      ws.onmessage = (event) => {
        const data = JSON.parse(event.data);

        if (data.type === "complete") {
          setResults(data.results);
          setRunning(false);
          return;
        }

        if (data.type === "error") {
          setLogs(prev => [...prev, { step: "system", type: "error", text: data.text }]);
          setRunning(false);
          return;
        }

        // Update active step
        const stepIdx = FLOW.findIndex(f => f.id === data.step);
        if (stepIdx >= 0) setActiveStep(stepIdx);

        setLogs(prev => [...prev, data]);
      };

      ws.onclose = () => {
        setConnected(false);
        setRunning(false);
      };

      ws.onerror = () => {
        setLogs(prev => [...prev, { step: "system", type: "error", text: "WebSocket connection failed — is the backend running?" }]);
        setRunning(false);
        setConnected(false);
      };
    } catch (e) {
      setLogs(prev => [...prev, { step: "system", type: "error", text: `Connection error: ${e.message}` }]);
      setRunning(false);
    }
  }, [profile]);

  const reset = () => {
    setActiveStep(-1);
    setLogs([]);
    setResults(null);
    setRunning(false);
    if (wsRef.current) wsRef.current.close();
  };

  const generateProfileFromPrompt = useCallback(async () => {
    try {
      setPromptLoading(true);
      setPromptError("");

      const response = await fetch(`${API_BASE}/profile/from-text`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: promptText }),
      });

      const payload = await response.json();
      if (!response.ok || payload.status !== "ok" || !payload.profile) {
        throw new Error(payload.message || "Failed to generate profile from prompt");
      }

      setProfile(payload.profile);
      setMode("live");
      setShowPromptModal(false);
      setLogs(prev => [...prev, { step: "intake", type: "result", text: "✅ Profile generated from prompt. Review and run analysis." }]);
    } catch (e) {
      setPromptError(e.message || "Could not parse your prompt.");
    } finally {
      setPromptLoading(false);
    }
  }, [promptText]);

  const run = mode === "demo" ? runDemo : runLive;

  const expenseSegs = Object.entries(profile.expenses).map(([k, v], i) => ({
    label: k, value: v,
    color: ["#FF5A5A", "#3DD6D0", "#FFCF56", "#B088F9", "#00FFB2", "#FF9F43", "#6366F1", "#FDA7DF", "#38BDF8"][i % 9],
  }));

  return (
    <div style={{
      fontFamily: "'IBM Plex Mono', 'Fira Code', monospace",
      background: "#0B0F19",
      color: "#E2E8F0",
      minHeight: "100vh",
      padding: 20,
      boxSizing: "border-box",
    }}>
      <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@300;400;500;600;700&family=Outfit:wght@400;500;600;700;800&display=swap" rel="stylesheet" />

      {showEditor && <ProfileEditor profile={profile} onSave={(p) => { setProfile(p); setShowEditor(false); }} onClose={() => setShowEditor(false)} />}
      {showPromptModal && (
        <PromptProfileModal
          text={promptText}
          setText={setPromptText}
          loading={promptLoading}
          error={promptError}
          onGenerate={generateProfileFromPrompt}
          onClose={() => {
            if (!promptLoading) {
              setShowPromptModal(false);
              setPromptError("");
            }
          }}
        />
      )}

      {/* ── Header ── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 22, flexWrap: "wrap", gap: 10 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 3 }}>
            <div style={{
              width: 9, height: 9, borderRadius: "50%",
              background: running ? "#00FFB2" : "#64748B",
              boxShadow: running ? "0 0 14px #00FFB2" : "none",
              animation: running ? "pulse 1.4s infinite" : "none",
            }} />
            <h1 style={{ fontFamily: "'Outfit', sans-serif", fontSize: 21, fontWeight: 800, margin: 0, letterSpacing: "-0.3px" }}>
              FINANCE WAR ROOM
            </h1>
          </div>
          <p style={{ fontFamily: "'Outfit', sans-serif", fontSize: 11.5, color: "#64748B", margin: 0 }}>
            Multi-Agent Financial Advisory · LangGraph + CrewAI
          </p>
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          {/* Mode Toggle */}
          <div style={{ display: "flex", borderRadius: 7, border: "1px solid rgba(255,255,255,0.08)", overflow: "hidden" }}>
            {["demo", "live"].map(m => (
              <button key={m} onClick={() => !running && setMode(m)} style={{
                padding: "7px 14px", border: "none", fontSize: 11, fontWeight: 600, cursor: running ? "not-allowed" : "pointer",
                background: mode === m ? "rgba(0,255,178,0.12)" : "transparent",
                color: mode === m ? "#00FFB2" : "#64748B",
                fontFamily: "'Outfit', sans-serif",
              }}>
                {m === "demo" ? "Demo" : "Live API"}
              </button>
            ))}
          </div>

          <button onClick={() => !running && setShowEditor(true)} style={{
            padding: "8px 16px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.08)",
            background: "transparent", color: "#64748B", fontWeight: 500, fontSize: 12, cursor: "pointer",
            fontFamily: "'Outfit', sans-serif",
          }}>
            ✏️ Edit Profile
          </button>

          <button onClick={() => !running && setShowPromptModal(true)} style={{
            padding: "8px 16px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.08)",
            background: "transparent", color: "#64748B", fontWeight: 500, fontSize: 12, cursor: "pointer",
            fontFamily: "'Outfit', sans-serif",
          }}>
            📝 Describe Profile
          </button>

          <button onClick={run} disabled={running} style={{
            fontFamily: "'Outfit', sans-serif", padding: "9px 22px", borderRadius: 8, border: "none",
            background: running ? "rgba(0,255,178,0.12)" : "linear-gradient(135deg, #00FFB2, #00D49B)",
            color: running ? "#00FFB2" : "#0B0F19", fontWeight: 700, fontSize: 13,
            cursor: running ? "not-allowed" : "pointer", transition: "all 0.2s",
          }}>
            {running ? "⏳ Agents Working..." : "▶ Run Analysis"}
          </button>

          {activeStep >= 0 && !running && (
            <button onClick={reset} style={{
              fontFamily: "'Outfit', sans-serif", padding: "8px 16px", borderRadius: 8,
              border: "1px solid rgba(255,255,255,0.08)", background: "transparent",
              color: "#64748B", fontWeight: 500, fontSize: 12, cursor: "pointer",
            }}>↺ Reset</button>
          )}
        </div>
      </div>

      {/* ── Pipeline Flow ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 0, marginBottom: 20, overflowX: "auto", paddingBottom: 6 }}>
        {FLOW.map((step, i) => (
          <div key={step.id} style={{ display: "flex", alignItems: "center", flexShrink: 0 }}>
            <div style={{
              padding: "7px 13px", borderRadius: 7, fontSize: 10.5, fontWeight: 600, whiteSpace: "nowrap",
              background: i === activeStep ? "rgba(0,255,178,0.1)" : i < activeStep ? "rgba(0,255,178,0.04)" : "#111827",
              border: `1px solid ${i === activeStep ? "#00FFB2" : i < activeStep ? "rgba(0,255,178,0.15)" : "rgba(255,255,255,0.05)"}`,
              color: i <= activeStep ? "#00FFB2" : "#475569",
              transition: "all 0.3s",
            }}>
              {step.icon} {step.label}{i < activeStep && " ✓"}
            </div>
            {i < FLOW.length - 1 && (
              <div style={{ width: 20, height: 2, background: i < activeStep ? "#00FFB2" : "rgba(255,255,255,0.06)", transition: "all 0.3s", flexShrink: 0 }} />
            )}
          </div>
        ))}
      </div>

      {/* ── Main Grid ── */}
      <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", gap: 18, alignItems: "start" }}>

        {/* ── Left Sidebar ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {/* Agent Crew */}
          <div style={{ background: "#111827", borderRadius: 11, border: "1px solid rgba(255,255,255,0.05)", padding: 14 }}>
            <h3 style={{ fontFamily: "'Outfit', sans-serif", fontSize: 11, fontWeight: 600, color: "#475569", margin: "0 0 10px", textTransform: "uppercase", letterSpacing: "1.2px" }}>Agent Crew</h3>
            {AGENTS.map(agent => {
              const isActive = running && activeStep >= 0 && FLOW[activeStep]?.id === agent.id;
              return (
                <div key={agent.id} style={{
                  display: "flex", alignItems: "center", gap: 9, padding: "7px 9px", borderRadius: 7, marginBottom: 5,
                  background: isActive ? agent.bg : "transparent",
                  border: `1px solid ${isActive ? agent.border : "transparent"}`,
                  transition: "all 0.3s",
                }}>
                  <span style={{ fontSize: 16 }}>{agent.icon}</span>
                  <div>
                    <div style={{ fontSize: 11.5, fontWeight: 600, color: isActive ? agent.color : "#E2E8F0" }}>
                      {agent.name}
                      {isActive && <span style={{ marginLeft: 5, fontSize: 9, animation: "pulse 1s infinite" }}> ● ACTIVE</span>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Expense Donut */}
          <div style={{ background: "#111827", borderRadius: 11, border: "1px solid rgba(255,255,255,0.05)", padding: 14 }}>
            <h3 style={{ fontFamily: "'Outfit', sans-serif", fontSize: 11, fontWeight: 600, color: "#475569", margin: "0 0 10px", textTransform: "uppercase", letterSpacing: "1.2px" }}>Expenses</h3>
            <div style={{ display: "flex", justifyContent: "center", marginBottom: 10 }}>
              <Donut segments={expenseSegs} currencyCode={currencyCode} />
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
              {expenseSegs.map(seg => (
                <div key={seg.label} style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 9.5 }}>
                  <div style={{ width: 5, height: 5, borderRadius: 2, background: seg.color }} />
                  <span style={{ color: "#64748B" }}>{seg.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Debts */}
          <div style={{ background: "#111827", borderRadius: 11, border: "1px solid rgba(255,255,255,0.05)", padding: 14 }}>
            <h3 style={{ fontFamily: "'Outfit', sans-serif", fontSize: 11, fontWeight: 600, color: "#475569", margin: "0 0 10px", textTransform: "uppercase", letterSpacing: "1.2px" }}>Debts</h3>
            {profile.debts.map((d, i) => (
              <DebtBar key={d.name} name={d.name} balance={d.balance} rate={d.interest_rate} max={28000} color={["#FF5A5A", "#FFCF56", "#3DD6D0"][i]} currencyCode={currencyCode} />
            ))}
            <div style={{ marginTop: 8, padding: "7px 9px", borderRadius: 6, background: "rgba(255,90,90,0.06)", border: "1px solid rgba(255,90,90,0.12)", fontSize: 10.5, color: "#FF5A5A" }}>
              Total: {money(totalDebt)} · Min: {money(monthlyDebtMinimum)}/mo
            </div>
          </div>
        </div>

        {/* ── Right Panel ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {/* Metrics Row */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
            <MetricCard label="Monthly Income" value={money(profile.monthly_income)} color="#00FFB2" spark={[0.8, 0.9, 0.95, 1, 1, 1].map((f) => (profile.monthly_income || 0) * f)} />
            <MetricCard label="Expenses" value={money(totalExpenses)} color="#FF5A5A" spark={[0.85, 0.9, 0.95, 1, 1.02, 1].map((f) => totalExpenses * f)} />
            <MetricCard label="Free Cash" value={money(freeCash)} color="#3DD6D0" spark={[0.8, 0.85, 0.9, 1, 0.95, 1].map((f) => freeCash * f)} />
            <MetricCard label="Savings" value={money(profile.savings)} color="#B088F9" spark={[0.35, 0.5, 0.65, 0.8, 0.9, 1].map((f) => (profile.savings || 0) * f)} />
            <MetricCard label="Investments" value={money(profile.investments)} color="#FFCF56" spark={[0.7, 0.78, 0.85, 0.9, 0.95, 1].map((f) => (profile.investments || 0) * f)} />
            <MetricCard label="Total Debt" value={money(totalDebt)} color="#FF5A5A" spark={[1.2, 1.12, 1.07, 1.03, 1.01, 1].map((f) => totalDebt * f)} />
          </div>

          {/* Goal Banner */}
          <div style={{ padding: "11px 14px", borderRadius: 9, background: "rgba(176,136,249,0.06)", border: "1px solid rgba(176,136,249,0.15)", fontSize: 12, color: "#B088F9" }}>
            🏠 {profile.goal} — Target: {money(profile.goal_amount || 60000)} in {profile.goal_timeline_months || 36} months
          </div>

          {/* Savings Projection (shown after analysis starts) */}
          {activeStep >= 0 && (
            <div style={{ background: "#111827", borderRadius: 11, border: "1px solid rgba(255,255,255,0.05)", padding: 16 }}>
              <h3 style={{ fontFamily: "'Outfit', sans-serif", fontSize: 11, fontWeight: 600, color: "#475569", margin: "0 0 10px", textTransform: "uppercase", letterSpacing: "1.2px" }}>
                Savings Trajectory → {money(goalAmount)} Goal
              </h3>
              <div style={{ display: "flex", alignItems: "end", gap: 5, height: 90 }}>
                {savingsProjection.map((val, i) => {
                  const maxV = Math.max(...savingsProjection);
                  const hPct = (val / maxV) * 100;
                  const isLast = i === savingsProjection.length - 1;
                  return (
                    <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
                      {(i === 0 || isLast) && <span style={{ fontSize: 8.5, color: isLast ? "#00FFB2" : "#475569" }}>{i === 0 ? "Now" : `Mo ${monthsToGoal}`}</span>}
                      {i > 0 && !isLast && <span style={{ fontSize: 0 }}>&nbsp;</span>}
                      <div style={{
                        width: "100%", height: `${hPct}%`, borderRadius: 3, minHeight: 3,
                        background: isLast ? "linear-gradient(to top, #00FFB2, #00D49B)" : `rgba(0,255,178,${0.1 + (i / savingsProjection.length) * 0.45})`,
                        transition: "height 0.6s ease",
                      }} />
                    </div>
                  );
                })}
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 7, fontSize: 9.5, color: "#475569" }}>
                <span>{money(profile.savings)}</span>
                <span style={{ color: finalProjectedSavings >= goalAmount ? "#00FFB2" : "#FF5A5A", fontWeight: 700 }}>
                  {money(finalProjectedSavings)} {finalProjectedSavings >= goalAmount ? "🎯" : "⚠️"}
                </span>
              </div>
            </div>
          )}

          {/* ── Agent Console ── */}
          <div style={{
            background: "#111827", borderRadius: 11, border: "1px solid rgba(255,255,255,0.05)",
            padding: 14, minHeight: 280, maxHeight: 480, overflowY: "auto",
          }}>
            <h3 style={{
              fontFamily: "'Outfit', sans-serif", fontSize: 11, fontWeight: 600, color: "#475569",
              margin: "0 0 10px", textTransform: "uppercase", letterSpacing: "1.2px",
              position: "sticky", top: 0, background: "#111827", paddingBottom: 6, zIndex: 1,
            }}>
              Agent Console {running && <span style={{ color: "#00FFB2" }}>● LIVE</span>}
              {mode === "live" && <span style={{ marginLeft: 8, color: connected ? "#00FFB2" : "#FF5A5A", fontSize: 9 }}>{connected ? "CONNECTED" : "DISCONNECTED"}</span>}
            </h3>

            {logs.length === 0 && !running && (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: 180, color: "#475569", fontSize: 12.5, textAlign: "center", gap: 7 }}>
                <span style={{ fontSize: 28, opacity: 0.3 }}>⚡</span>
                <span>Press <strong style={{ color: "#00FFB2" }}>Run Analysis</strong> to deploy all 5 agents</span>
                <span style={{ fontSize: 10.5, opacity: 0.5 }}>
                  {mode === "demo" ? "Demo mode — simulated agent outputs" : "Live mode — connects to FastAPI + LangGraph backend"}
                </span>
              </div>
            )}

            {logs.map((log, i) => (
              <div key={i} style={{
                padding: "3px 0", fontSize: 11.5, lineHeight: 1.6,
                color: log.type === "thinking" ? "#FFCF56" : log.type === "done" ? "#00FFB2" : log.type === "error" ? "#FF5A5A" : "#CBD5E1",
                opacity: log.type === "thinking" ? 0.65 : 1,
                fontStyle: log.type === "thinking" ? "italic" : "normal",
                borderBottom: log.type === "done" ? "1px solid rgba(255,255,255,0.04)" : "none",
                paddingBottom: log.type === "done" ? 8 : 3,
                marginBottom: log.type === "done" ? 8 : 0,
                animation: "fadeIn 0.25s ease",
              }}>
                {log.type === "result" && <span style={{ color: "#475569", marginRight: 5 }}>→</span>}
                {formatLogCurrency(log.text, currencyCode)}
              </div>
            ))}
            <div ref={logsEnd} />
          </div>

          {/* Architecture Note */}
          <div style={{
            background: "#111827", borderRadius: 11, border: "1px solid rgba(255,255,255,0.05)",
            padding: 14, fontSize: 10.5, color: "#475569", lineHeight: 1.7,
          }}>
            <span style={{ fontWeight: 700, color: "#CBD5E1" }}>Architecture: </span>
            <span style={{ color: "#00FFB2" }}>LangGraph</span> orchestrates the 6-step stateful pipeline with conditional edges and checkpointing. {" "}
            <span style={{ color: "#3DD6D0" }}>CrewAI</span> manages 5 specialized agents with distinct tools and memory. {" "}
            Agents share a <span style={{ color: "#B088F9" }}>WarRoomState</span> so each builds on upstream findings. {" "}
            Backend streams events via <span style={{ color: "#FFCF56" }}>WebSocket</span> for real-time UI updates.
          </div>
        </div>
      </div>

      <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.35} }
        @keyframes fadeIn { from{opacity:0;transform:translateY(4px)} to{opacity:1;transform:translateY(0)} }
        ::-webkit-scrollbar{width:5px} ::-webkit-scrollbar-track{background:transparent} ::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.08);border-radius:3px}
        @media(max-width:768px){ div[style*="grid-template-columns: 280px"]{grid-template-columns:1fr!important} }
      `}</style>
    </div>
  );
}
