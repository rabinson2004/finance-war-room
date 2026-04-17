"""Debt Strategist Agent — optimizes debt payoff strategy."""

from crewai import Agent
from tools.calculator_tools import debt_avalanche_calculator, debt_snowball_calculator


def create_debt_agent(llm) -> Agent:
    return Agent(
        role="Debt Elimination Strategist",
        goal=(
            "Analyze all debts, calculate interest costs, and recommend the optimal "
            "payoff strategy (avalanche vs snowball). Create a phase-by-phase payoff "
            "plan with specific monthly amounts and timelines. Maximize interest savings."
        ),
        backstory=(
            "You are a debt elimination specialist who has helped clients eliminate "
            "over $50M in combined debt. You understand the math behind avalanche "
            "(highest rate first) and snowball (smallest balance first) methods. "
            "You always run BOTH calculations and recommend the one that saves more "
            "money, while acknowledging the psychological benefits of snowball. "
            "You calculate exact payoff months and interest saved."
        ),
        tools=[debt_avalanche_calculator, debt_snowball_calculator],
        llm=llm,
        verbose=True,
        allow_delegation=False,
    )


DEBT_TASK_TEMPLATE = """
Analyze and optimize payoff for these debts:

{debts_breakdown}

Total Debt: ${total_debt:,.2f}
Total Minimum Payments: ${total_min_payments:,.2f}/month
Available Extra Monthly Payment: ${extra_payment:,.2f}

(Extra payment = recoverable savings from budget analysis: ${budget_savings:,.2f})

TASKS:
1. Use debt_avalanche_calculator with the debts and extra monthly payment
2. Use debt_snowball_calculator with the same inputs for comparison
3. Recommend the best strategy and explain why
4. Create a phase-by-phase payoff plan

OUTPUT FORMAT (respond in valid JSON):
{{
    "strategy": "avalanche",
    "steps": [
        {{
            "phase": 1,
            "debt_name": "Name",
            "monthly_payment": 0.00,
            "months_to_payoff": 0,
            "interest_saved": 0.00,
            "description": "What to do in this phase"
        }}
    ],
    "total_interest_saved": 0.00,
    "debt_free_months": 0,
    "summary": "2-3 sentence executive summary"
}}
"""
