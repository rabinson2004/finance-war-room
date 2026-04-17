"""FastAPI server — REST API + WebSocket for real-time agent streaming."""

from __future__ import annotations

import asyncio
import json
import re
import traceback
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from langchain_core.messages import HumanMessage, SystemMessage

from config import settings, get_llm
from models.schemas import FinancialProfile
from graph.workflow import create_app, get_initial_state


# ── Lifespan ──

langgraph_app = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global langgraph_app
    print("Compiling LangGraph workflow...")
    langgraph_app = create_app()
    print("Finance War Room ready!")
    yield
    print("Shutting down...")


# ── FastAPI App ──

app = FastAPI(
    title="Finance War Room API",
    description="Multi-Agent Financial Advisory System powered by LangGraph + CrewAI",
    version="1.0.0",
    lifespan=lifespan,
)

cors_kwargs = {
    "allow_origins": settings.CORS_ORIGINS,
    "allow_credentials": True,
    "allow_methods": ["*"],
    "allow_headers": ["*"],
}

# Frontend deploy URLs on Vercel change frequently. This API does not rely on
# cookies/session credentials, so permissive CORS is acceptable in production.
if settings.APP_ENV == "production":
    cors_kwargs["allow_origins"] = ["*"]
    cors_kwargs["allow_credentials"] = False

origin_regex_parts = []
if settings.CORS_ALLOW_LOCALHOST:
    origin_regex_parts.append(settings.CORS_LOCALHOST_REGEX)

# Allow Vercel preview/production domains so fresh deploy URLs work
# without manually updating CORS_ORIGINS on every frontend redeploy.
if settings.APP_ENV == "production":
    origin_regex_parts.append(r"^https://[a-zA-Z0-9-]+\.vercel\.app$")

if origin_regex_parts:
    cors_kwargs["allow_origin_regex"] = "|".join(origin_regex_parts)

app.add_middleware(CORSMiddleware, **cors_kwargs)


# ── Sample Profile ──

SAMPLE_PROFILE = {
    "monthly_income": 7500,
    "expenses": {
        "Housing": 2100,
        "Food": 650,
        "Transport": 400,
        "Subscriptions": 180,
        "Shopping": 520,
        "Utilities": 220,
        "Entertainment": 310,
        "Insurance": 280,
        "Miscellaneous": 190,
    },
    "debts": [
        {
            "name": "Student Loan",
            "balance": 28000,
            "interest_rate": 5.5,
            "minimum_payment": 320,
        },
        {
            "name": "Credit Card",
            "balance": 4200,
            "interest_rate": 22.9,
            "minimum_payment": 120,
        },
        {
            "name": "Car Loan",
            "balance": 12000,
            "interest_rate": 6.2,
            "minimum_payment": 280,
        },
    ],
    "savings": 8500,
    "investments": 15000,
    "retirement_contributions": 500,
    "tax_filing_status": "single",
    "annual_income": 90000,
    "goal": "Buy a house in 3 years",
    "goal_amount": 60000,
    "goal_timeline_months": 36,
    "age": 30,
    "risk_tolerance": "moderate",
    "employer_401k_match": 4.0,
    "currency": "USD",
}


class ProfileFromTextRequest(BaseModel):
    text: str


def _extract_number(raw: str) -> float:
    cleaned = raw.replace(",", "").strip()
    return float(cleaned)


def _apply_prompt_heuristics(prompt: str, profile: dict) -> dict:
    """
    Improve parsing for short informal prompts where users omit keywords.
    """
    prompt_lower = prompt.lower()

    # If user says "I have <amount> rupees" without saying savings/balance,
    # treat it as monthly income for goal planning.
    have_amount_match = re.search(
        r"\bi\s+have\s+(?:₹|rs\.?|inr|rupees?)?\s*([0-9][0-9,]*(?:\.[0-9]+)?)",
        prompt_lower,
    )
    if have_amount_match and not any(token in prompt_lower for token in ("saving", "saved", "balance", "in bank")):
        profile["monthly_income"] = _extract_number(have_amount_match.group(1))
        profile["annual_income"] = profile["monthly_income"] * 12

    # Parse "buy <item> <amount> ... in <n> months/years"
    buy_goal_match = re.search(
        r"\bbuy(?:\s+a|\s+an|\s+the)?\s+([a-zA-Z ]{1,40}?)\s+(?:for\s+)?(?:₹|rs\.?|inr|rupees?)?\s*([0-9][0-9,]*(?:\.[0-9]+)?)",
        prompt_lower,
    )
    if buy_goal_match:
        item = buy_goal_match.group(1).strip()
        profile["goal"] = f"Buy {item.upper()}" if len(item) <= 4 else f"Buy {item.title()}"
        profile["goal_amount"] = _extract_number(buy_goal_match.group(2))

    timeline_match = re.search(r"\bin\s+([0-9]{1,3})\s*(month|months|year|years)\b", prompt_lower)
    if timeline_match:
        qty = int(timeline_match.group(1))
        unit = timeline_match.group(2)
        profile["goal_timeline_months"] = qty * 12 if "year" in unit else qty

    return profile


def _extract_json_object(text: str) -> dict:
    """Extract and parse a JSON object from LLM output."""
    raw = text.strip()

    # Handle fenced markdown output.
    if raw.startswith("```"):
        raw = re.sub(r"^```[a-zA-Z]*\s*", "", raw)
        raw = re.sub(r"\s*```$", "", raw)

    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", raw, re.DOTALL)
        if not match:
            raise
        return json.loads(match.group(0))


# ── REST Endpoints ──


@app.get("/")
async def root():
    return {
        "name": "Finance War Room API",
        "version": "1.0.0",
        "app_env": settings.APP_ENV,
        "agents": [
            "Budget Analyst",
            "Debt Strategist",
            "Investment Advisor",
            "Tax Optimizer",
            "Goal Planner",
        ],
        "pipeline": "intake → budget → debt → invest → tax → roadmap",
    }


@app.get("/sample-profile")
async def get_sample_profile():
    """Return a sample financial profile for testing."""
    return SAMPLE_PROFILE


@app.post("/analyze")
async def analyze(profile: FinancialProfile):
    """
    Run the full analysis pipeline synchronously.
    Returns complete results from all agents.
    """
    try:
        initial_state = get_initial_state(profile.model_dump())
        result = langgraph_app.invoke(initial_state)

        return {
            "status": "complete",
            "budget": result.get("budget_report"),
            "debt": result.get("debt_report"),
            "investment": result.get("investment_report"),
            "tax": result.get("tax_report"),
            "goal": result.get("goal_report"),
            "events": result.get("events", []),
            "errors": result.get("errors", []),
        }
    except Exception as e:
        traceback.print_exc()
        return {"status": "error", "message": str(e)}


@app.post("/analyze/sample")
async def analyze_sample():
    """Run analysis on the sample profile."""
    profile = FinancialProfile(**SAMPLE_PROFILE)
    return await analyze(profile)


@app.post("/profile/from-text")
async def profile_from_text(payload: ProfileFromTextRequest):
    """
    Convert natural language financial details into a validated FinancialProfile.
    """
    try:
        llm = get_llm()
        prompt = payload.text.strip()
        if not prompt:
            return {"status": "error", "message": "Please provide some financial details."}

        schema_hint = {
            "monthly_income": 7500,
            "expenses": {"Housing": 2100, "Food": 650},
            "debts": [
                {
                    "name": "Credit Card",
                    "balance": 4200,
                    "interest_rate": 22.9,
                    "minimum_payment": 120,
                }
            ],
            "savings": 8500,
            "investments": 15000,
            "retirement_contributions": 500,
            "tax_filing_status": "single",
            "annual_income": 90000,
            "goal": "Buy a house in 3 years",
            "goal_amount": 60000,
            "goal_timeline_months": 36,
            "age": 30,
            "risk_tolerance": "moderate",
            "employer_401k_match": 4.0,
            "currency": "USD",
        }

        messages = [
            SystemMessage(
                content=(
                    "You are a financial intake parser. Convert the user's message to a single JSON "
                    "object matching the required schema. Return ONLY raw JSON with no markdown. "
                    "Use numeric values for numeric fields. If a field is missing, infer a conservative "
                    "default. Keep expenses as an object of category->monthly amount and debts as a list. "
                    "Include a 'currency' field using a 3-letter code (e.g., USD, AED) inferred from user text."
                )
            ),
            HumanMessage(
                content=(
                    "User details:\n"
                    f"{prompt}\n\n"
                    "Required JSON shape:\n"
                    f"{json.dumps(schema_hint)}"
                )
            ),
        ]

        response = llm.invoke(messages)
        text = response.content if isinstance(response.content, str) else str(response.content)
        parsed = _extract_json_object(text)

        # Merge with defaults so optional gaps still validate.
        merged_profile = {**SAMPLE_PROFILE, **parsed}
        prompt_lower = prompt.lower()
        if any(token in prompt_lower for token in ("aed", "dirham", "dubai", "د.إ")):
            merged_profile["currency"] = "AED"
        elif any(token in prompt_lower for token in ("inr", "rs", "rupee", "rupees", "₹")):
            merged_profile["currency"] = "INR"
        elif "usd" in prompt_lower or "$" in prompt_lower:
            merged_profile["currency"] = "USD"
        merged_profile = _apply_prompt_heuristics(prompt, merged_profile)
        profile = FinancialProfile(**merged_profile)

        return {"status": "ok", "profile": profile.model_dump()}
    except Exception as e:
        traceback.print_exc()
        return {"status": "error", "message": f"Could not parse profile from text: {str(e)}"}


# ── WebSocket for Real-Time Streaming ──


@app.websocket("/ws/analyze")
async def websocket_analyze(websocket: WebSocket):
    """
    WebSocket endpoint for real-time agent streaming.
    
    Client sends: {"profile": {...}} or {"use_sample": true}
    Server streams: {"step": "...", "type": "thinking|result|done|error", "text": "..."}
    Final message: {"type": "complete", "results": {...}}
    """
    await websocket.accept()

    try:
        # Receive profile
        data = await websocket.receive_json()

        if data.get("use_sample"):
            profile_dict = SAMPLE_PROFILE
        else:
            profile_dict = data.get("profile", SAMPLE_PROFILE)

        # Validate
        profile = FinancialProfile(**profile_dict)
        initial_state = get_initial_state(profile.model_dump())

        # Stream events as nodes execute.
        prev_event_count = 0
        final_state = initial_state

        # Use stream to get state updates after each node
        for state_update in langgraph_app.stream(initial_state):
            # state_update is {node_name: updated_state}
            for node_name, node_state in state_update.items():
                final_state = node_state
                events = node_state.get("events", [])
                new_events = events[prev_event_count:]
                prev_event_count = len(events)

                for event in new_events:
                    await websocket.send_json(event)
                    await asyncio.sleep(0.15)  # Pacing for visual effect

        # Send final results from the streamed run.
        await websocket.send_json({
            "type": "complete",
            "results": {
                "budget": final_state.get("budget_report"),
                "debt": final_state.get("debt_report"),
                "investment": final_state.get("investment_report"),
                "tax": final_state.get("tax_report"),
                "goal": final_state.get("goal_report"),
                "errors": final_state.get("errors", []),
            },
        })

    except WebSocketDisconnect:
        print("Client disconnected")
    except Exception as e:
        traceback.print_exc()
        try:
            await websocket.send_json({
                "type": "error",
                "text": f"Pipeline error: {str(e)}",
            })
        except Exception:
            pass


# ── Run Server ──

if __name__ == "__main__":
    import uvicorn

    print(
        f"\n"
        f"==============================================\n"
        f"FINANCE WAR ROOM - Multi-Agent Advisor\n"
        f"REST: http://localhost:{settings.PORT}\n"
        f"WS:   ws://localhost:{settings.PORT}/ws/analyze\n"
        f"Docs: http://localhost:{settings.PORT}/docs\n"
        f"==============================================\n"
    )

    uvicorn.run(
        "main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=settings.RELOAD,
    )
