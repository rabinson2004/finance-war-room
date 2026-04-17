"""CrewAI Crew definition — orchestrates all 5 financial agents."""

from __future__ import annotations

from crewai import Agent, Crew, Task, Process

from agents.budget_agent import create_budget_agent, BUDGET_TASK_TEMPLATE
from agents.debt_agent import create_debt_agent, DEBT_TASK_TEMPLATE
from agents.investment_agent import create_investment_agent, INVESTMENT_TASK_TEMPLATE
from agents.tax_agent import create_tax_agent, TAX_TASK_TEMPLATE
from agents.goal_agent import create_goal_agent, GOAL_TASK_TEMPLATE
from models.schemas import FinancialProfile


def build_crew(profile: FinancialProfile, llm) -> Crew:
    """
    Build a CrewAI crew with all 5 agents and their tasks,
    configured for sequential execution matching the LangGraph pipeline.
    """

    # ── Create Agents ──
    budget_agent = create_budget_agent(llm)
    debt_agent = create_debt_agent(llm)
    investment_agent = create_investment_agent(llm)
    tax_agent = create_tax_agent(llm)
    goal_agent = create_goal_agent(llm)

    # ── Format Task Descriptions ──
    expenses_breakdown = "\n".join(
        f"  - {cat}: ${amt:,.2f}" for cat, amt in profile.expenses.items()
    )

    debts_breakdown = "\n".join(
        f"  - {d.name}: ${d.balance:,.2f} @ {d.interest_rate}% APR (min: ${d.minimum_payment:,.2f}/mo)"
        for d in profile.debts
    )

    # Estimated values for template (will be refined by agents)
    estimated_budget_savings = profile.total_expenses * 0.07  # ~7% recoverable
    extra_debt_payment = estimated_budget_savings * 0.5
    has_student_loans = any("student" in d.name.lower() for d in profile.debts)

    # ── Create Tasks ──
    budget_task = Task(
        description=BUDGET_TASK_TEMPLATE.format(
            monthly_income=profile.monthly_income,
            expenses_breakdown=expenses_breakdown,
            total_expenses=profile.total_expenses,
            free_cash_flow=profile.free_cash_flow,
            savings=profile.savings,
        ),
        expected_output="JSON object with findings, total_recoverable_monthly, recommended_split, and summary",
        agent=budget_agent,
    )

    debt_task = Task(
        description=DEBT_TASK_TEMPLATE.format(
            debts_breakdown=debts_breakdown,
            total_debt=profile.total_debt,
            total_min_payments=profile.total_min_payments,
            extra_payment=extra_debt_payment,
            budget_savings=estimated_budget_savings,
        ),
        expected_output="JSON object with strategy, steps, total_interest_saved, debt_free_months, and summary",
        agent=debt_agent,
        context=[budget_task],  # Can see budget findings
    )

    investment_task = Task(
        description=INVESTMENT_TASK_TEMPLATE.format(
            age=profile.age,
            risk_tolerance=profile.risk_tolerance,
            investments=profile.investments,
            savings=profile.savings,
            monthly_income=profile.monthly_income,
            employer_match=profile.employer_401k_match,
            retirement_contributions=profile.retirement_contributions,
            goal=profile.goal,
            goal_amount=profile.goal_amount,
            goal_timeline_months=profile.goal_timeline_months,
            available_monthly=profile.free_cash_flow * 0.4,
        ),
        expected_output="JSON object with risk_assessment, goal_fund_strategy, allocations, monthly_investment_target, and summary",
        agent=investment_agent,
        context=[budget_task, debt_task],
    )

    tax_task = Task(
        description=TAX_TASK_TEMPLATE.format(
            annual_income=profile.computed_annual_income,
            filing_status=profile.tax_filing_status,
            retirement_contributions=profile.retirement_contributions,
            annual_401k=profile.retirement_contributions * 12,
            employer_match=profile.employer_401k_match,
            has_student_loans=has_student_loans,
            budget_savings=estimated_budget_savings,
            debt_free_months=24,  # Estimated
        ),
        expected_output="JSON object with strategies, total_annual_savings, and summary",
        agent=tax_agent,
        context=[budget_task, debt_task],
    )

    goal_task = Task(
        description=GOAL_TASK_TEMPLATE.format(
            goal=profile.goal,
            goal_amount=profile.goal_amount,
            goal_timeline_months=profile.goal_timeline_months,
            savings=profile.savings,
            budget_savings=estimated_budget_savings,
            debt_free_months=24,
            debt_freed=profile.total_min_payments,
            goal_fund_strategy="high-yield savings account",
            tax_annual_savings=5000,
            tax_monthly_savings=416,
            debt_phase1_end=8,
            phase1_savings=profile.free_cash_flow * 0.3,
            phase2_savings=profile.free_cash_flow * 0.5,
            phase3_savings=profile.free_cash_flow * 0.8,
        ),
        expected_output="JSON object with feasible, milestones, projected_total, buffer_amount, and summary",
        agent=goal_agent,
        context=[budget_task, debt_task, investment_task, tax_task],
    )

    # ── Assemble Crew ──
    crew = Crew(
        agents=[budget_agent, debt_agent, investment_agent, tax_agent, goal_agent],
        tasks=[budget_task, debt_task, investment_task, tax_task, goal_task],
        process=Process.sequential,  # Matches LangGraph pipeline order
        verbose=True,
    )

    return crew
