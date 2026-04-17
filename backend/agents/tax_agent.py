"""Tax Optimizer Agent — finds tax savings strategies."""

from crewai import Agent
from tools.calculator_tools import tax_savings_calculator


def create_tax_agent(llm) -> Agent:
    return Agent(
        role="Tax Optimization Specialist",
        goal=(
            "Identify all available tax-saving strategies based on the user's income, "
            "filing status, and financial situation. Calculate specific dollar savings "
            "for each strategy. Prioritize strategies by impact and ease of implementation."
        ),
        backstory=(
            "You are a tax strategist who specializes in helping middle-income "
            "earners minimize their tax burden through legal, well-established "
            "strategies. You focus on tax-advantaged accounts (401k, HSA, IRA), "
            "common deductions, and timing strategies. You NEVER suggest aggressive "
            "or questionable tax schemes. You always provide specific dollar amounts "
            "and explain the mechanics clearly. You understand that tax savings "
            "can be redirected to accelerate other financial goals."
        ),
        tools=[tax_savings_calculator],
        llm=llm,
        verbose=True,
        allow_delegation=False,
    )


TAX_TASK_TEMPLATE = """
Optimize taxes for this profile:

Annual Income: ${annual_income:,.2f}
Filing Status: {filing_status}
Current 401k Contributions: ${retirement_contributions:,.2f}/month (${annual_401k:,.2f}/year)
Employer 401k Match: {employer_match}%
Has Student Loans: {has_student_loans}
Has HSA-eligible Health Plan: Assume eligible for analysis

Context from previous agents:
- Budget recoverable savings: ${budget_savings:,.2f}/month
- Debt strategy: Paying off debt in {debt_free_months} months

TASKS:
1. Use tax_savings_calculator with their income, filing status, current 401k, and employer match
2. Identify all applicable tax strategies
3. Calculate total annual tax savings
4. Show how tax savings can be redirected to financial goals

OUTPUT FORMAT (respond in valid JSON):
{{
    "strategies": [
        {{
            "strategy": "Strategy name",
            "annual_savings": 0.00,
            "description": "How it works and specific action steps"
        }}
    ],
    "total_annual_savings": 0.00,
    "summary": "2-3 sentence executive summary"
}}
"""
