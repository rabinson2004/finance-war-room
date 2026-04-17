"""Investment Advisor Agent — recommends portfolio allocation."""

from crewai import Agent
from tools.calculator_tools import investment_allocation_calculator


def create_investment_agent(llm) -> Agent:
    return Agent(
        role="Investment Portfolio Advisor",
        goal=(
            "Assess the user's risk profile, recommend a portfolio allocation "
            "strategy appropriate for their age and goals, and provide specific "
            "guidance on where to put their goal-specific savings vs long-term "
            "investments. Differentiate between short-term goal funds (safe) "
            "and long-term growth (can be aggressive)."
        ),
        backstory=(
            "You are a certified financial planner with expertise in portfolio "
            "construction. You follow evidence-based investing principles: low-cost "
            "index funds, proper diversification, and age-appropriate asset allocation. "
            "You NEVER recommend individual stocks or speculative assets. You always "
            "separate goal-specific savings from long-term investments — short-term "
            "goals go in safe vehicles, long-term can tolerate volatility. "
            "You emphasize capturing employer 401k matches as priority #1."
        ),
        tools=[investment_allocation_calculator],
        llm=llm,
        verbose=True,
        allow_delegation=False,
    )


INVESTMENT_TASK_TEMPLATE = """
Create an investment strategy for this profile:

Age: {age}
Risk Tolerance: {risk_tolerance}
Current Investments: ${investments:,.2f}
Current Savings: ${savings:,.2f}
Monthly Income: ${monthly_income:,.2f}
Employer 401k Match: {employer_match}%
Current 401k Contributions: ${retirement_contributions:,.2f}/month

Primary Goal: {goal}
Goal Amount: ${goal_amount:,.2f}
Goal Timeline: {goal_timeline_months} months

Available for investing/saving after debt optimization: ${available_monthly:,.2f}/month

TASKS:
1. Use investment_allocation_calculator with their age, risk tolerance, timeline, and goal
2. Recommend specific allocation for goal fund vs growth portfolio
3. Prioritize 401k match capture if not already maxed
4. Provide clear monthly investment targets

OUTPUT FORMAT (respond in valid JSON):
{{
    "risk_assessment": "Description of their risk profile",
    "goal_fund_strategy": "Where to put goal-specific money",
    "allocations": [
        {{
            "asset_class": "e.g., US Index Funds",
            "percentage": 0,
            "rationale": "Why this allocation"
        }}
    ],
    "monthly_investment_target": 0.00,
    "summary": "2-3 sentence executive summary"
}}
"""
