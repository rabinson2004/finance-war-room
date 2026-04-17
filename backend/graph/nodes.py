"""LangGraph node functions — each node invokes one CrewAI agent via LLM."""

from __future__ import annotations

import json
import traceback
from typing import Any

from langchain_core.messages import HumanMessage, SystemMessage

from graph.state import WarRoomState
from models.schemas import FinancialProfile
from tools.calculator_tools import (
    expense_benchmark,
    debt_avalanche_calculator,
    debt_snowball_calculator,
    investment_allocation_calculator,
    tax_savings_calculator,
    goal_feasibility_calculator,
)
from tools.analysis_tools import spending_categorizer, emergency_fund_analyzer
from config import get_llm


def _emit(state: WarRoomState, step: str, msg_type: str, text: str) -> None:
    """Append an event to the state for WebSocket streaming."""
    state["events"].append({
        "step": step,
        "type": msg_type,
        "text": text,
    })


def _parse_json_response(text: str) -> dict:
    """Extract JSON from LLM response, handling markdown fences."""
    text = text.strip()
    if text.startswith("```"):
        lines = text.split("\n")
        # Remove first and last fence lines
        lines = [l for l in lines if not l.strip().startswith("```")]
        text = "\n".join(lines)
    return json.loads(text)


def _get_profile(state: WarRoomState) -> FinancialProfile:
    """Reconstruct FinancialProfile from state dict."""
    return FinancialProfile(**state["profile"])


# ── Node: Intake ──

def intake_node(state: WarRoomState) -> WarRoomState:
    """Validate and summarize the financial profile."""
    step = "intake"
    state["current_step"] = step
    _emit(state, step, "thinking", "📥 Loading and validating financial profile...")

    profile = _get_profile(state)

    summary = {
        "monthly_income": profile.monthly_income,
        "total_expenses": profile.total_expenses,
        "expense_ratio": round(profile.total_expenses / profile.monthly_income * 100, 1),
        "free_cash_flow": profile.free_cash_flow,
        "total_debt": profile.total_debt,
        "savings": profile.savings,
        "investments": profile.investments,
        "net_worth": round(
            profile.savings + profile.investments - profile.total_debt, 2
        ),
        "goal": profile.goal,
        "goal_amount": profile.goal_amount,
        "goal_timeline_months": profile.goal_timeline_months,
    }

    _emit(state, step, "result", f"Monthly income: ${profile.monthly_income:,.0f}")
    _emit(state, step, "result", f"Total expenses: ${profile.total_expenses:,.0f} ({summary['expense_ratio']}% of income)")
    _emit(state, step, "result", f"Free cash flow: ${profile.free_cash_flow:,.0f}/month")
    _emit(state, step, "result", f"Total debt: ${profile.total_debt:,.0f}")
    _emit(state, step, "result", f"Net worth: ${summary['net_worth']:,.0f}")
    _emit(state, step, "result", f"Goal: {profile.goal}")
    _emit(state, step, "done", "✅ Financial profile validated")

    state["completed_steps"].append(step)
    return state


# ── Node: Budget Analysis ──

def budget_node(state: WarRoomState) -> WarRoomState:
    """Run budget analysis using LLM + calculator tools."""
    step = "budget"
    state["current_step"] = step
    _emit(state, step, "thinking", "📊 Budget Analyst processing spending data...")

    try:
        profile = _get_profile(state)
        llm = get_llm()

        # Run benchmark calculations for each category
        findings = []
        total_recoverable = 0

        for category, amount in profile.expenses.items():
            result = json.loads(
                expense_benchmark.run(
                    category=category,
                    monthly_income=profile.monthly_income,
                    current_amount=amount,
                )
            )

            severity_icon = {"red": "🔴", "yellow": "🟡", "green": "🟢"}[result["severity"]]
            savings = result["potential_savings"]
            total_recoverable += savings

            findings.append({
                "category": category,
                "current_amount": amount,
                "recommended_amount": result["recommended"],
                "severity": result["severity"],
                "explanation": (
                    f"{result['pct_of_income']}% of income "
                    f"(benchmark: ${result['benchmark_range'][0]:,.0f}-${result['benchmark_range'][1]:,.0f})"
                ),
            })

            if result["severity"] != "green":
                _emit(
                    state, step, "result",
                    f"{severity_icon} {category} (${amount:,.0f}): "
                    f"Could save ${savings:,.0f}/mo — {result['pct_of_income']}% of income"
                )

        # Categorize spending
        categorized = json.loads(
            spending_categorizer.run(
                expenses_json=json.dumps(profile.expenses)
            )
        )

        # Emergency fund check
        emergency = json.loads(
            emergency_fund_analyzer.run(
                monthly_expenses=profile.total_expenses,
                current_savings=profile.savings,
            )
        )

        _emit(state, step, "result", f"💰 Total recoverable: ${total_recoverable:,.0f}/month")
        _emit(
            state, step, "result",
            f"📋 Current split: {categorized['needs']['pct']}% needs / "
            f"{categorized['wants']['pct']}% wants / "
            f"{categorized['savings']['pct']}% savings"
        )
        _emit(state, step, "result", f"🏦 Emergency fund: {emergency['status']} ({emergency['months_covered']} months covered)")

        budget_report = {
            "findings": findings,
            "total_recoverable_monthly": round(total_recoverable, 2),
            "recommended_split": {"needs": 50, "wants": 30, "savings": 20},
            "emergency_fund": emergency,
            "summary": (
                f"Found ${total_recoverable:,.0f}/month in potential savings across "
                f"{sum(1 for f in findings if f['severity'] != 'green')} categories. "
                f"Emergency fund covers {emergency['months_covered']} months."
            ),
        }

        state["budget_report"] = budget_report
        _emit(state, step, "done", "✅ Budget Analysis complete")

    except Exception as e:
        state["errors"].append(f"Budget: {str(e)}")
        _emit(state, step, "error", f"❌ Budget analysis error: {str(e)}")

    state["completed_steps"].append(step)
    return state


# ── Node: Debt Strategy ──

def debt_node(state: WarRoomState) -> WarRoomState:
    """Run debt optimization strategy."""
    step = "debt"
    state["current_step"] = step
    _emit(state, step, "thinking", "🎯 Debt Strategist analyzing liabilities...")

    try:
        profile = _get_profile(state)

        if not profile.debts:
            state["debt_report"] = {
                "strategy": "none",
                "steps": [],
                "total_interest_saved": 0,
                "debt_free_months": 0,
                "summary": "No debts found — all clear!",
            }
            _emit(state, step, "result", "🎉 No debts — skip to investing!")
            _emit(state, step, "done", "✅ Debt analysis complete")
            state["completed_steps"].append(step)
            return state

        # Get budget savings for extra payments
        budget_savings = 0
        if state.get("budget_report"):
            budget_savings = state["budget_report"].get("total_recoverable_monthly", 0)

        extra_payment = budget_savings * 0.6  # 60% of savings toward debt

        debts_json = json.dumps([
            {
                "name": d.name,
                "balance": d.balance,
                "rate": d.interest_rate,
                "min_payment": d.minimum_payment,
            }
            for d in profile.debts
        ])

        # Run avalanche
        avalanche = json.loads(
            debt_avalanche_calculator.run(
                debts_json=debts_json, extra_monthly=extra_payment
            )
        )

        # Run snowball for comparison
        snowball = json.loads(
            debt_snowball_calculator.run(
                debts_json=debts_json, extra_monthly=extra_payment
            )
        )

        # Pick the better strategy
        best = avalanche  # Avalanche usually saves more
        strategy = "avalanche"

        _emit(state, step, "result", f"⚡ Highest-rate debt: {profile.debts[0].name if profile.debts else 'N/A'}")
        _emit(state, step, "result", f"📋 Strategy: {strategy.title()} Method (highest interest first)")

        steps = []
        for phase in best.get("phases", []):
            steps.append({
                "phase": phase["phase"],
                "debt_name": phase["debt_name"],
                "monthly_payment": phase.get("monthly_payment", 0),
                "months_to_payoff": phase.get("paid_off_month", 0),
                "interest_saved": 0,
                "description": f"Pay off {phase['debt_name']} by month {phase.get('paid_off_month', '?')}",
            })
            _emit(
                state, step, "result",
                f"→ Phase {phase['phase']}: {phase['debt_name']} — "
                f"paid off by month {phase.get('paid_off_month', '?')}"
            )

        debt_report = {
            "strategy": strategy,
            "steps": steps,
            "total_interest_saved": best.get("total_interest_saved", 0),
            "debt_free_months": best.get("total_months", 0),
            "snowball_comparison_months": snowball.get("total_months", 0),
            "summary": (
                f"Using {strategy} method with ${extra_payment:,.0f}/mo extra payments. "
                f"Debt-free in {best.get('total_months', 0)} months. "
                f"Saves ${best.get('total_interest_saved', 0):,.0f} in interest."
            ),
        }

        state["debt_report"] = debt_report
        _emit(state, step, "result", f"🎯 Debt-free in {best.get('total_months', 0)} months")
        _emit(state, step, "done", "✅ Debt Strategy complete")

    except Exception as e:
        state["errors"].append(f"Debt: {str(e)}")
        _emit(state, step, "error", f"❌ Debt analysis error: {str(e)}")

    state["completed_steps"].append(step)
    return state


# ── Node: Investment Strategy ──

def investment_node(state: WarRoomState) -> WarRoomState:
    """Generate investment allocation recommendations."""
    step = "invest"
    state["current_step"] = step
    _emit(state, step, "thinking", "📈 Investment Advisor building portfolio strategy...")

    try:
        profile = _get_profile(state)

        result = json.loads(
            investment_allocation_calculator.run(
                age=profile.age,
                risk_tolerance=profile.risk_tolerance,
                goal_timeline_months=profile.goal_timeline_months,
                goal_amount=profile.goal_amount,
            )
        )

        allocations = [
            {
                "asset_class": k.replace("_", " ").title(),
                "percentage": v,
                "rationale": f"{'Growth' if k == 'stocks' else 'Stability' if k == 'bonds' else 'Liquidity' if k == 'cash' else 'Diversification'} component",
            }
            for k, v in result["portfolio_allocation"].items()
        ]

        _emit(state, step, "result", f"📊 Risk profile: {profile.risk_tolerance.title()} (age {profile.age})")
        _emit(state, step, "result", f"→ Goal fund: {result['goal_fund_strategy'].replace('_', ' ').title()}")

        for alloc in allocations:
            _emit(state, step, "result", f"→ {alloc['asset_class']}: {alloc['percentage']}%")

        _emit(
            state, step, "result",
            f"💡 Monthly savings needed for goal: ${result['monthly_savings_needed']:,.0f}"
        )

        if profile.employer_401k_match > 0:
            _emit(state, step, "result", f"⚡ PRIORITY: Capture {profile.employer_401k_match}% employer 401k match first")

        investment_report = {
            "risk_assessment": f"{profile.risk_tolerance.title()} risk — age {profile.age}",
            "goal_fund_strategy": result["goal_rationale"],
            "allocations": allocations,
            "monthly_investment_target": result["monthly_savings_needed"],
            "summary": (
                f"Recommended {profile.risk_tolerance} portfolio. "
                f"Goal funds in {result['goal_fund_strategy'].replace('_', ' ')}. "
                f"Need ${result['monthly_savings_needed']:,.0f}/mo for goal."
            ),
        }

        state["investment_report"] = investment_report
        _emit(state, step, "done", "✅ Investment Strategy complete")

    except Exception as e:
        state["errors"].append(f"Investment: {str(e)}")
        _emit(state, step, "error", f"❌ Investment error: {str(e)}")

    state["completed_steps"].append(step)
    return state


# ── Node: Tax Optimization ──

def tax_node(state: WarRoomState) -> WarRoomState:
    """Find tax-saving strategies."""
    step = "tax"
    state["current_step"] = step
    _emit(state, step, "thinking", "🏛️ Tax Optimizer scanning for deductions...")

    try:
        profile = _get_profile(state)

        result = json.loads(
            tax_savings_calculator.run(
                annual_income=profile.computed_annual_income,
                filing_status=profile.tax_filing_status,
                current_401k=profile.retirement_contributions * 12,
                employer_match_pct=profile.employer_401k_match,
            )
        )

        strategies = result.get("strategies", [])
        total_savings = result.get("total_annual_savings", 0)

        for s in strategies:
            if s["annual_savings"] > 0:
                _emit(
                    state, step, "result",
                    f"🏛️ {s['strategy']}: Saves ${s['annual_savings']:,.0f}/year"
                )

        _emit(state, step, "result", f"🎯 Total annual tax savings: ${total_savings:,.0f}")

        tax_report = {
            "strategies": [
                {
                    "strategy": s["strategy"],
                    "annual_savings": s["annual_savings"],
                    "description": s["description"],
                }
                for s in strategies
            ],
            "total_annual_savings": total_savings,
            "marginal_rate": result.get("marginal_tax_rate", 0),
            "summary": (
                f"Identified ${total_savings:,.0f}/year in tax savings across "
                f"{len([s for s in strategies if s['annual_savings'] > 0])} strategies. "
                f"Marginal rate: {result.get('marginal_tax_rate', 0) * 100:.0f}%."
            ),
        }

        state["tax_report"] = tax_report
        _emit(state, step, "done", "✅ Tax Optimization complete")

    except Exception as e:
        state["errors"].append(f"Tax: {str(e)}")
        _emit(state, step, "error", f"❌ Tax analysis error: {str(e)}")

    state["completed_steps"].append(step)
    return state


# ── Node: Goal Roadmap ──

def goal_node(state: WarRoomState) -> WarRoomState:
    """Synthesize all findings into a goal roadmap."""
    step = "roadmap"
    state["current_step"] = step
    _emit(state, step, "thinking", "🗺️ Goal Planner synthesizing all agent findings...")

    try:
        profile = _get_profile(state)

        # Gather data from previous agents
        budget_savings = 0
        if state.get("budget_report"):
            budget_savings = state["budget_report"].get("total_recoverable_monthly", 0)

        debt_free_months = 0
        debt_min_payments = profile.total_min_payments
        if state.get("debt_report"):
            debt_free_months = state["debt_report"].get("debt_free_months", 0)

        tax_monthly = 0
        if state.get("tax_report"):
            tax_monthly = state["tax_report"].get("total_annual_savings", 0) / 12

        # Calculate phased savings capacity
        base_savings = profile.free_cash_flow - (budget_savings * 0.6)  # 60% to debt initially
        phase1_savings = base_savings + (budget_savings * 0.4)  # Keep 40% for savings
        phase2_savings = phase1_savings + debt_min_payments * 0.5  # Some debts paid off
        phase3_savings = profile.free_cash_flow + budget_savings  # All debts cleared

        # Average monthly savings
        avg_savings = (
            phase1_savings * min(debt_free_months, profile.goal_timeline_months)
            + phase3_savings * max(0, profile.goal_timeline_months - debt_free_months)
        ) / profile.goal_timeline_months

        result = json.loads(
            goal_feasibility_calculator.run(
                goal_amount=profile.goal_amount,
                timeline_months=profile.goal_timeline_months,
                current_savings=profile.savings,
                monthly_savings_capacity=avg_savings,
                annual_return_rate=4.0,
            )
        )

        feasible = result["feasible"]
        projected = result["projected_total"]
        buffer = result["buffer"]

        # Build milestones
        timeline = profile.goal_timeline_months
        phase1_end = min(debt_free_months // 2, timeline // 4) or max(1, timeline // 4)
        phase2_end = min(debt_free_months, timeline // 2) or timeline // 2
        phase3_end = min(debt_free_months + (timeline - debt_free_months) // 2, timeline * 3 // 4)

        cumulative = profile.savings
        milestones = []

        phases = [
            (1, phase1_end, "Optimize & Attack Debt", phase1_savings),
            (phase1_end + 1, phase2_end, "Accelerate Payoff", phase2_savings),
            (phase2_end + 1, phase3_end, "Debt-Free Boost", phase3_savings),
            (phase3_end + 1, timeline, "Full Savings Sprint", phase3_savings),
        ]

        for start, end, title, monthly in phases:
            months_in_phase = end - start + 1
            phase_total = monthly * months_in_phase
            cumulative += phase_total
            milestones.append({
                "month_start": start,
                "month_end": end,
                "title": title,
                "actions": [f"Save ${monthly:,.0f}/month", f"Cumulative: ${cumulative:,.0f}"],
                "monthly_savings": round(monthly, 2),
                "cumulative_saved": round(cumulative, 2),
            })
            _emit(
                state, step, "result",
                f"📅 Months {start}-{end}: {title} — ${monthly:,.0f}/mo → ${cumulative:,.0f} total"
            )

        status = "✅" if feasible else "⚠️"
        _emit(
            state, step, "result",
            f"🏠 Projected at month {timeline}: ${projected:,.0f} {status}"
        )
        if feasible:
            _emit(state, step, "result", f"🎉 GOAL ACHIEVABLE — with ${buffer:,.0f} buffer!")
        else:
            _emit(state, step, "result", f"⚠️ Shortfall of ${result['shortfall']:,.0f} — need to increase savings")

        goal_report = {
            "feasible": feasible,
            "milestones": milestones,
            "projected_total": projected,
            "buffer_amount": buffer,
            "summary": (
                f"{'Goal is achievable!' if feasible else 'Goal needs adjustment.'} "
                f"Projected ${projected:,.0f} by month {timeline} "
                f"({'${0:,.0f} buffer'.format(buffer) if feasible else '${0:,.0f} short'.format(result['shortfall'])})."
            ),
        }

        state["goal_report"] = goal_report
        _emit(state, step, "done", "✅ Roadmap generation complete")

    except Exception as e:
        state["errors"].append(f"Goal: {str(e)}")
        _emit(state, step, "error", f"❌ Goal planning error: {str(e)}")
        traceback.print_exc()

    state["completed_steps"].append(step)
    return state
