"""Data analysis utility tools for CrewAI agents."""

from __future__ import annotations

import json
from crewai.tools import tool


@tool("spending_categorizer")
def spending_categorizer(expenses_json: str) -> str:
    """
    Categorize expenses into needs, wants, and savings using the 50/30/20 rule.
    expenses_json: JSON dict of {category: amount}.
    """
    expenses = json.loads(expenses_json)

    needs_categories = {"Housing", "Utilities", "Insurance", "Healthcare", "Transport", "Transportation"}
    savings_categories = {"Savings", "Investments", "Retirement"}

    needs = {}
    wants = {}
    savings = {}

    for cat, amount in expenses.items():
        if cat in needs_categories:
            needs[cat] = amount
        elif cat in savings_categories:
            savings[cat] = amount
        else:
            wants[cat] = amount

    total = sum(expenses.values())
    needs_total = sum(needs.values())
    wants_total = sum(wants.values())
    savings_total = sum(savings.values())

    return json.dumps({
        "needs": {"items": needs, "total": needs_total, "pct": round(needs_total / total * 100, 1) if total else 0},
        "wants": {"items": wants, "total": wants_total, "pct": round(wants_total / total * 100, 1) if total else 0},
        "savings": {"items": savings, "total": savings_total, "pct": round(savings_total / total * 100, 1) if total else 0},
        "total_expenses": total,
        "ideal_split": {"needs": 50, "wants": 30, "savings": 20},
    })


@tool("net_worth_calculator")
def net_worth_calculator(
    savings: float,
    investments: float,
    other_assets: float,
    total_debt: float,
) -> str:
    """Calculate current net worth and categorize financial health."""
    net_worth = savings + investments + other_assets - total_debt
    total_assets = savings + investments + other_assets

    if net_worth > 0:
        health = "positive"
    elif net_worth > -10000:
        health = "slightly_negative"
    else:
        health = "needs_attention"

    debt_to_asset = total_debt / total_assets if total_assets > 0 else float("inf")

    return json.dumps({
        "net_worth": round(net_worth, 2),
        "total_assets": round(total_assets, 2),
        "total_debt": round(total_debt, 2),
        "debt_to_asset_ratio": round(debt_to_asset, 2),
        "financial_health": health,
    })


@tool("emergency_fund_analyzer")
def emergency_fund_analyzer(
    monthly_expenses: float,
    current_savings: float,
) -> str:
    """Assess emergency fund adequacy (recommended: 3-6 months of expenses)."""
    months_covered = current_savings / monthly_expenses if monthly_expenses > 0 else 0
    target_3mo = monthly_expenses * 3
    target_6mo = monthly_expenses * 6

    if months_covered >= 6:
        status = "excellent"
        recommendation = "Emergency fund is fully funded. Excess can be invested."
    elif months_covered >= 3:
        status = "adequate"
        recommendation = f"Build to 6-month target (${target_6mo:,.0f}). Need ${target_6mo - current_savings:,.0f} more."
    elif months_covered >= 1:
        status = "insufficient"
        recommendation = f"Priority: Build to 3-month minimum (${target_3mo:,.0f}). Need ${target_3mo - current_savings:,.0f} more."
    else:
        status = "critical"
        recommendation = f"URGENT: Less than 1 month of expenses saved. Target ${target_3mo:,.0f} ASAP."

    return json.dumps({
        "months_covered": round(months_covered, 1),
        "current_savings": current_savings,
        "target_3_months": round(target_3mo, 2),
        "target_6_months": round(target_6mo, 2),
        "status": status,
        "recommendation": recommendation,
    })
