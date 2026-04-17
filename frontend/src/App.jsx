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
};

// ─── Small Components ───

function Spark({ data, color, w = 110, h = 28 }) {
  const mx = Math.max(...data), mn = Math.min(...data), rng = mx - mn || 1;
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - ((v - mn) / rng) * (h - 4) - 2}`).join(" ");
  return <svg width={w} height={h}><polyline fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" points={pts} /></svg>;
}

function Donut({ segments, size = 130 }) {
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
      <text x={cx} y={cy - 4} textAnchor="middle" fill="#E2E8F0" fontSize="13" fontWeight="700" fontFamily="inherit">${(total / 1000).toFixed(1)}k</text>
      <text x={cx} y={cy + 10} textAnchor="middle" fill="#64748B" fontSize="8.5" fontFamily="inherit">/month</text>
    </svg>
  );
}

function DebtBar({ name, balance, rate, max, color }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 3 }}>
        <span style={{ color: "#E2E8F0" }}>{name}</span>
        <span style={{ color: "#64748B" }}>${balance.toLocaleString()} · {rate}%</span>
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
  const [mode, setMode] = useState("demo"); // "demo" = local simulation, "live" = API/WebSocket
  const [connected, setConnected] = useState(false);
  const logsEnd = useRef(null);
  const wsRef = useRef(null);

  useEffect(() => {
    logsEnd.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  // ── Demo Mode (local simulation) ──
  const DEMO_OUTPUTS = {
    intake: [
      "Monthly income: $7,500",
      "Total expenses: $4,850 (64.7% of income)",
      "Free cash flow: $2,650/month",
      "Total debt: $44,200",
      "Net worth: ~($20,700)",
      `Goal: ${profile.goal}`,
    ],
    budget: [
      "🔴 Subscriptions ($180): 3 overlapping services — save $35/mo",
      "🔴 Shopping ($520): 38% above benchmark — target $350, save $170/mo",
      "🟡 Food ($650): Slightly high — meal prep could save $120/mo",
      "🟢 Housing ($2,100): 28% of income — within 30% guideline",
      "🟢 Insurance ($280): Within normal range",
      "💰 Total recoverable: $325/month → $11,700 over 3 years",
      "📋 Recommended: 50/30/20 → $3,750 needs / $2,250 wants / $1,500 savings",
    ],
    debt: [
      "⚡ PRIORITY: Credit Card @ 22.9% APR — $80/mo in interest alone",
      "📋 Strategy: Avalanche Method (highest interest first)",
      "→ Phase 1 (Mo 1-7): Extra $500/mo to Credit Card — PAID OFF",
      "→ Phase 2 (Mo 8-19): Redirect $620/mo to Car Loan — PAID OFF",
      "→ Phase 3 (Mo 20-28): Accelerate Student Loan — saves $4,200 interest",
      "🎯 Debt-free in 28 months (8 months ahead of minimum schedule)",
    ],
    invest: [
      "📊 Current portfolio: $15,000 (needs diversification review)",
      "🎯 Risk profile: Moderate (age 30, 3yr goal horizon)",
      "→ Goal fund: High-yield savings @ 4.5% APY (safe & liquid)",
      "→ Long-term: 55% US stocks / 25% bonds / 10% international / 10% cash",
      "⚡ FIRST: Max employer 401k match (4%) — free 100% return",
      "💡 Don't invest down payment money in stocks — too short timeline",
    ],
    tax: [
      "🏛️ Max 401(k): Saves ~$5,520/yr at 24% bracket",
      "🏛️ HSA contributions: Saves ~$996/yr (triple tax advantage)",
      "→ Student loan interest deduction: Up to $600/yr",
      "💡 Roth IRA: $7,000/yr for tax-free retirement growth",
      "🎯 Total annual tax savings: ~$7,116 → $593/mo redirectable",
    ],
    roadmap: [
      "📅 Months 1-7: Kill credit card debt + save $1,200/mo to HYSA",
      "📅 Months 8-19: Pay off car loan + save $1,600/mo",
      "📅 Months 20-28: Accelerate student loan + save $2,100/mo",
      "📅 Months 29-36: Full savings sprint — $2,650/mo to down payment",
      "🏠 Projected at month 36: $62,400",
      "🎉 GOAL ACHIEVABLE — $2,400 buffer for closing costs!",
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

  const savingsProjection = [8500, 9800, 12200, 15800, 20400, 26000, 32500, 39800, 47000, 53500, 58200, 62400];

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
              <Donut segments={expenseSegs} />
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
              <DebtBar key={d.name} name={d.name} balance={d.balance} rate={d.interest_rate} max={28000} color={["#FF5A5A", "#FFCF56", "#3DD6D0"][i]} />
            ))}
            <div style={{ marginTop: 8, padding: "7px 9px", borderRadius: 6, background: "rgba(255,90,90,0.06)", border: "1px solid rgba(255,90,90,0.12)", fontSize: 10.5, color: "#FF5A5A" }}>
              Total: ${profile.debts.reduce((s, d) => s + d.balance, 0).toLocaleString()} · Min: ${profile.debts.reduce((s, d) => s + d.minimum_payment, 0)}/mo
            </div>
          </div>
        </div>

        {/* ── Right Panel ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {/* Metrics Row */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
            <MetricCard label="Monthly Income" value="$7,500" color="#00FFB2" spark={[6800, 7000, 7200, 7500, 7500, 7500]} />
            <MetricCard label="Expenses" value="$4,850" color="#FF5A5A" spark={[4200, 4400, 4600, 4700, 4900, 4850]} />
            <MetricCard label="Free Cash" value="$2,650" color="#3DD6D0" spark={[2600, 2600, 2600, 2800, 2600, 2650]} />
            <MetricCard label="Savings" value="$8,500" color="#B088F9" spark={[3000, 4200, 5500, 6800, 7600, 8500]} />
            <MetricCard label="Investments" value="$15,000" color="#FFCF56" spark={[10000, 11200, 12800, 13500, 14200, 15000]} />
            <MetricCard label="Total Debt" value="$44,200" color="#FF5A5A" spark={[52000, 50000, 48000, 47000, 45500, 44200]} />
          </div>

          {/* Goal Banner */}
          <div style={{ padding: "11px 14px", borderRadius: 9, background: "rgba(176,136,249,0.06)", border: "1px solid rgba(176,136,249,0.15)", fontSize: 12, color: "#B088F9" }}>
            🏠 {profile.goal} — Target: ${profile.goal_amount?.toLocaleString() || "60,000"} in {profile.goal_timeline_months || 36} months
          </div>

          {/* Savings Projection (shown after analysis starts) */}
          {activeStep >= 0 && (
            <div style={{ background: "#111827", borderRadius: 11, border: "1px solid rgba(255,255,255,0.05)", padding: 16 }}>
              <h3 style={{ fontFamily: "'Outfit', sans-serif", fontSize: 11, fontWeight: 600, color: "#475569", margin: "0 0 10px", textTransform: "uppercase", letterSpacing: "1.2px" }}>Savings Trajectory → $60,000 Goal</h3>
              <div style={{ display: "flex", alignItems: "end", gap: 5, height: 90 }}>
                {savingsProjection.map((val, i) => {
                  const maxV = Math.max(...savingsProjection);
                  const hPct = (val / maxV) * 100;
                  const isLast = i === savingsProjection.length - 1;
                  return (
                    <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
                      {(i === 0 || isLast) && <span style={{ fontSize: 8.5, color: isLast ? "#00FFB2" : "#475569" }}>{i === 0 ? "Now" : "Mo 36"}</span>}
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
                <span>$8,500</span>
                <span style={{ color: "#00FFB2", fontWeight: 700 }}>$62,400 🎯</span>
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
                {log.text}
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
