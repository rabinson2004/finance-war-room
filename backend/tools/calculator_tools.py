"""Financial calculator tools for CrewAI agents."""

from __future__ import annotations

import json
import math
from crewai.tools import tool


@tool("expense_benchmark")
def expense_benchmark(category: str, monthly_income: float, current_amount: float) -> str:
    """
    Compare a spending category against recommended benchmarks for the income level.
    Returns severity (red/yellow/green) and recommended amount.
    """
    # Standard benchmarks as % of gross income
    benchmarks = {
        "Housing": (0.25, 0.30),
        "Food": (0.05, 0.10),
        "Transport": (0.05, 0.10),
        "Transportation": (0.05, 0.10),
        "Subscriptions": (0.01, 0.03),
        "Shopping": (0.03, 0.05),
        "Utilities": (0.03, 0.05),
        "Entertainment": (0.02, 0.05),
        "Insurance": (0.03, 0.06),
        "Healthcare": (0.03, 0.08),
        "Miscellaneous": (0.01, 0.03),
    }

    low, high = benchmarks.get(category, (0.02, 0.05))
    recommended_max = monthly_income * high
    recommended_ideal = monthly_income * ((low + high) / 2)
    pct_of_income = current_amount / monthly_income

    if current_amount > recommended_max * 1.3:
        severity = "red"
    elif current_amount > recommended_max:
        severity = "yellow"
    else:
        severity = "green"

    return json.dumps({
        "category": category,
        "current": current_amount,
        "benchmark_range": [round(monthly_income * low, 2), round(recommended_max, 2)],
        "recommended": round(recommended_ideal, 2),
        "pct_of_income": round(pct_of_income * 100, 1),
        "severity": severity,
        "potential_savings": round(max(0, current_amount - recommended_ideal), 2),
    })


@tool("debt_avalanche_calculator")
def debt_avalanche_calculator(debts_json: str, extra_monthly: float) -> str:
    """
    Calculate optimal debt payoff using the avalanche method (highest interest first).
    debts_json: JSON array of {name, balance, rate, min_payment}.
    extra_monthly: Extra dollars available per month beyond minimums.
    """
    debts = json.loads(debts_json)
    # Sort by interest rate descending (avalanche)
    debts_sorted = sorted(debts, key=lambda d: d["rate"], reverse=True)

    results = []
    remaining_extra = extra_monthly
    total_interest_saved = 0
    month = 0

    # Simulate payoff
    active_debts = [
        {**d, "remaining": d["balance"], "paid_off_month": 0}
        for d in debts_sorted
    ]

    while any(d["remaining"] > 0 for d in active_debts) and month < 360:
        month += 1
        extra_this_month = extra_monthly

        for debt in active_debts:
            if debt["remaining"] <= 0:
                continue

            # Add monthly interest
            monthly_rate = debt["rate"] / 100 / 12
            interest = debt["remaining"] * monthly_rate
            debt["remaining"] += interest

            # Pay minimum
            payment = min(debt["min_payment"], debt["remaining"])
            debt["remaining"] -= payment

            # Apply extra to highest-rate debt first
            if extra_this_month > 0 and debt == next(
                (d for d in active_debts if d["remaining"] > 0), None
            ):
                extra_payment = min(extra_this_month, debt["remaining"])
                debt["remaining"] -= extra_payment
                extra_this_month -= extra_payment
                total_interest_saved += extra_payment * monthly_rate

            if debt["remaining"] <= 0.01:
                debt["remaining"] = 0
                debt["paid_off_month"] = month

    phases = []
    for i, debt in enumerate(active_debts):
        phases.append({
            "phase": i + 1,
            "debt_name": debt["name"],
            "interest_rate": debt["rate"],
            "original_balance": debt["balance"],
            "paid_off_month": debt["paid_off_month"],
            "monthly_payment": debt["min_payment"] + (
                extra_monthly if i == 0 else 0
            ),
        })

    return json.dumps({
        "strategy": "avalanche",
        "phases": phases,
        "total_months": month,
        "total_interest_saved": round(total_interest_saved, 2),
    })


@tool("debt_snowball_calculator")
def debt_snowball_calculator(debts_json: str, extra_monthly: float) -> str:
    """
    Calculate debt payoff using the snowball method (smallest balance first).
    debts_json: JSON array of {name, balance, rate, min_payment}.
    extra_monthly: Extra dollars available per month beyond minimums.
    """
    debts = json.loads(debts_json)
    debts_sorted = sorted(debts, key=lambda d: d["balance"])

    active_debts = [
        {**d, "remaining": d["balance"], "paid_off_month": 0}
        for d in debts_sorted
    ]
    month = 0

    while any(d["remaining"] > 0 for d in active_debts) and month < 360:
        month += 1
        extra = extra_monthly

        for debt in active_debts:
            if debt["remaining"] <= 0:
                continue

            monthly_rate = debt["rate"] / 100 / 12
            debt["remaining"] += debt["remaining"] * monthly_rate

            payment = min(debt["min_payment"], debt["remaining"])
            debt["remaining"] -= payment

            if debt == next(
                (d for d in active_debts if d["remaining"] > 0), None
            ):
                extra_pay = min(extra, debt["remaining"])
                debt["remaining"] -= extra_pay
                extra -= extra_pay

            if debt["remaining"] <= 0.01:
                debt["remaining"] = 0
                debt["paid_off_month"] = month

    phases = []
    for i, debt in enumerate(active_debts):
        phases.append({
            "phase": i + 1,
            "debt_name": debt["name"],
            "original_balance": debt["balance"],
            "paid_off_month": debt["paid_off_month"],
        })

    return json.dumps({
        "strategy": "snowball",
        "phases": phases,
        "total_months": month,
    })


@tool("investment_allocation_calculator")
def investment_allocation_calculator(
    age: int, risk_tolerance: str, goal_timeline_months: int, goal_amount: float
) -> str:
    """
    Calculate recommended portfolio allocation based on age, risk, and goals.
    risk_tolerance: 'low', 'moderate', or 'high'.
    """
    # Base allocation by risk
    allocations = {
        "low": {"stocks": 30, "bonds": 50, "cash": 15, "international": 5},
        "moderate": {"stocks": 55, "bonds": 25, "cash": 10, "international": 10},
        "high": {"stocks": 70, "bonds": 15, "cash": 5, "international": 10},
    }

    base = allocations.get(risk_tolerance, allocations["moderate"])

    # Adjust for age (more conservative as you age)
    age_adjustment = max(0, (age - 25) * 0.5)
    base["stocks"] = max(20, base["stocks"] - age_adjustment)
    base["bonds"] = min(60, base["bonds"] + age_adjustment * 0.7)
    base["cash"] = min(20, base["cash"] + age_adjustment * 0.3)

    # Short-term goals should be in safer assets
    if goal_timeline_months <= 36:
        goal_strategy = "high_yield_savings"
        goal_rationale = "Timeline under 3 years — keep goal funds liquid and safe"
    elif goal_timeline_months <= 60:
        goal_strategy = "conservative_mix"
        goal_rationale = "Timeline 3-5 years — conservative bond/stock mix"
    else:
        goal_strategy = "growth_portfolio"
        goal_rationale = "Timeline 5+ years — can tolerate market volatility"

    # Required monthly savings for goal
    months = max(1, goal_timeline_months)
    # Assume conservative 4% annual return for estimation
    monthly_rate = 0.04 / 12
    if monthly_rate > 0:
        monthly_needed = goal_amount * monthly_rate / (
            (1 + monthly_rate) ** months - 1
        )
    else:
        monthly_needed = goal_amount / months

    return json.dumps({
        "portfolio_allocation": {k: round(v, 1) for k, v in base.items()},
        "goal_fund_strategy": goal_strategy,
        "goal_rationale": goal_rationale,
        "monthly_savings_needed": round(monthly_needed, 2),
        "assumed_annual_return": 4.0,
    })


@tool("tax_savings_calculator")
def tax_savings_calculator(
    annual_income: float,
    filing_status: str,
    current_401k: float,
    employer_match_pct: float,
) -> str:
    """
    Calculate potential tax savings from various strategies.
    annual_income: Gross annual income.
    filing_status: 'single', 'married', or 'head_of_household'.
    current_401k: Current annual 401k contribution.
    employer_match_pct: Employer match percentage.
    """
    # 2024 tax brackets (simplified)
    brackets_single = [
        (11600, 0.10), (47150, 0.12), (100525, 0.22),
        (191950, 0.24), (243725, 0.32), (609350, 0.35), (float("inf"), 0.37),
    ]

    def estimate_marginal_rate(income: float) -> float:
        remaining = income
        rate = 0.10
        for ceiling, bracket_rate in brackets_single:
            if remaining <= 0:
                break
            rate = bracket_rate
            remaining -= ceiling
        return rate

    marginal_rate = estimate_marginal_rate(annual_income)
    strategies = []

    # 401k optimization
    max_401k = 23000  # 2024 limit
    additional_401k = max(0, max_401k - current_401k)
    if additional_401k > 0:
        savings = additional_401k * marginal_rate
        strategies.append({
            "strategy": "Max 401(k) contributions",
            "annual_savings": round(savings, 2),
            "description": f"Increase 401k by ${additional_401k:,.0f}/yr to reach ${max_401k:,} limit. "
                          f"Reduces taxable income at {marginal_rate*100:.0f}% marginal rate.",
        })

    # Employer match
    if employer_match_pct > 0:
        match_value = annual_income * (employer_match_pct / 100)
        strategies.append({
            "strategy": "Capture full employer match",
            "annual_savings": round(match_value, 2),
            "description": f"Employer matches {employer_match_pct}% — that's ${match_value:,.0f}/yr in free money.",
        })

    # HSA
    hsa_limit = 4150
    hsa_savings = hsa_limit * marginal_rate
    strategies.append({
        "strategy": "HSA contributions (if eligible)",
        "annual_savings": round(hsa_savings, 2),
        "description": f"Max HSA at ${hsa_limit:,}/yr — triple tax advantage (deductible, grows tax-free, tax-free withdrawals).",
    })

    # Roth IRA
    roth_limit = 7000
    strategies.append({
        "strategy": "Roth IRA contributions",
        "annual_savings": 0,  # No immediate tax savings, but tax-free growth
        "description": f"Contribute up to ${roth_limit:,}/yr for tax-free growth. "
                       "No upfront deduction but withdrawals in retirement are tax-free.",
    })

    # Student loan interest
    student_loan_deduction = min(2500, annual_income * 0.01)
    if student_loan_deduction > 0:
        strategies.append({
            "strategy": "Student loan interest deduction",
            "annual_savings": round(student_loan_deduction * marginal_rate, 2),
            "description": f"Deduct up to $2,500 of student loan interest annually.",
        })

    total = sum(s["annual_savings"] for s in strategies)

    return json.dumps({
        "marginal_tax_rate": marginal_rate,
        "strategies": strategies,
        "total_annual_savings": round(total, 2),
    })


@tool("goal_feasibility_calculator")
def goal_feasibility_calculator(
    goal_amount: float,
    timeline_months: int,
    current_savings: float,
    monthly_savings_capacity: float,
    annual_return_rate: float = 4.0,
) -> str:
    """
    Calculate whether a financial goal is achievable and create milestones.
    """
    monthly_rate = annual_return_rate / 100 / 12
    months = max(1, timeline_months)

    # Project savings with compound growth
    projected = current_savings
    milestones = []
    phase_size = max(1, months // 4)  # 4 phases

    for m in range(1, months + 1):
        projected += monthly_savings_capacity
        projected *= (1 + monthly_rate)

        if m % phase_size == 0 or m == months:
            milestones.append({
                "month": m,
                "projected_savings": round(projected, 2),
                "pct_of_goal": round(projected / goal_amount * 100, 1),
            })

    feasible = projected >= goal_amount
    shortfall = max(0, goal_amount - projected)
    buffer = max(0, projected - goal_amount)

    # Calculate required monthly savings if current isn't enough
    if not feasible:
        required = (goal_amount - current_savings * (1 + monthly_rate) ** months) / (
            ((1 + monthly_rate) ** months - 1) / monthly_rate
        )
    else:
        required = monthly_savings_capacity

    return json.dumps({
        "feasible": feasible,
        "projected_total": round(projected, 2),
        "goal_amount": goal_amount,
        "shortfall": round(shortfall, 2),
        "buffer": round(buffer, 2),
        "required_monthly_savings": round(required, 2),
        "milestones": milestones,
    })
