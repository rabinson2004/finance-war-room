"""Goal Planner Agent — creates milestone roadmap."""

from crewai import Agent
from tools.calculator_tools import goal_feasibility_calculator


def create_goal_agent(llm) -> Agent:
    return Agent(
        role="Financial Goal Planner",
        goal=(
            "Synthesize findings from ALL previous agents (budget savings, debt timeline, "
            "investment strategy, tax savings) into a unified, month-by-month roadmap "
            "that shows exactly how the user reaches their primary financial goal. "
            "Account for changing cash flow as debts are paid off."
        ),
        backstory=(
            "You are a financial planning synthesizer who excels at creating "
            "actionable roadmaps. You understand that cash flow changes over time — "
            "as debts get paid off, more money becomes available for savings. "
            "You create phased milestones that account for this changing capacity. "
            "You always calculate whether the goal is feasible and by how much "
            "they'll overshoot or undershoot. You provide motivation by showing "
            "progress checkpoints along the way."
        ),
        tools=[goal_feasibility_calculator],
        llm=llm,
        verbose=True,
        allow_delegation=False,
    )


GOAL_TASK_TEMPLATE = """
Create a comprehensive roadmap to achieve this goal:

GOAL: {goal}
Target Amount: ${goal_amount:,.2f}
Timeline: {goal_timeline_months} months
Current Savings: ${savings:,.2f}

CONTEXT FROM PREVIOUS AGENTS:
- Budget Analysis: Can recover ${budget_savings:,.2f}/month from spending optimization
- Debt Strategy: Will be debt-free in {debt_free_months} months, freeing up ${debt_freed:,.2f}/month
- Investment Strategy: Goal fund should go in {goal_fund_strategy}
- Tax Savings: ${tax_annual_savings:,.2f}/year (${tax_monthly_savings:,.2f}/month) redirectable

CASH FLOW PHASES:
- Phase 1 (Months 1-{debt_phase1_end}): Saving ${phase1_savings:,.2f}/month (while paying priority debts)
- Phase 2 (Months {debt_phase1_end}-{debt_free_months}): Saving ${phase2_savings:,.2f}/month (some debts paid off)
- Phase 3 (Months {debt_free_months}-{goal_timeline_months}): Saving ${phase3_savings:,.2f}/month (all debts cleared)

TASKS:
1. Use goal_feasibility_calculator with the savings capacity, timeline, and goal amount
2. Create 3-4 milestone phases showing month ranges, actions, and savings amounts
3. Calculate projected total at the end and whether goal is met
4. Provide a buffer assessment (how much over/under the goal)

OUTPUT FORMAT (respond in valid JSON):
{{
    "feasible": true,
    "milestones": [
        {{
            "month_start": 1,
            "month_end": 12,
            "title": "Phase name",
            "actions": ["Action 1", "Action 2"],
            "monthly_savings": 0.00,
            "cumulative_saved": 0.00
        }}
    ],
    "projected_total": 0.00,
    "buffer_amount": 0.00,
    "summary": "2-3 sentence executive summary with verdict"
}}
"""
