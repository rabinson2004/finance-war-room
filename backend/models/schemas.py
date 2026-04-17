"""Pydantic schemas for financial data and agent outputs."""

from __future__ import annotations

from pydantic import BaseModel, Field


# ── User Input Models ──


class DebtItem(BaseModel):
    name: str = Field(..., description="Name of the debt (e.g., 'Credit Card')")
    balance: float = Field(..., description="Current balance in account currency")
    interest_rate: float = Field(..., description="Annual interest rate as %")
    minimum_payment: float = Field(..., description="Minimum monthly payment")


class FinancialProfile(BaseModel):
    """Complete financial snapshot provided by the user."""

    monthly_income: float = Field(..., description="Gross monthly income")
    expenses: dict[str, float] = Field(
        ..., description="Category -> monthly amount"
    )
    debts: list[DebtItem] = Field(default_factory=list)
    savings: float = Field(0, description="Total liquid savings")
    investments: float = Field(0, description="Total investment portfolio value")
    retirement_contributions: float = Field(
        0, description="Monthly 401k/IRA contributions"
    )
    tax_filing_status: str = Field("single", description="single/married/head_of_household")
    annual_income: float = Field(0, description="Gross annual income (auto-calc if 0)")
    goal: str = Field("", description="Primary financial goal in plain English")
    goal_amount: float = Field(0, description="Target amount for the goal")
    goal_timeline_months: int = Field(36, description="Months to achieve the goal")
    age: int = Field(30, description="User's age")
    risk_tolerance: str = Field("moderate", description="low/moderate/high")
    employer_401k_match: float = Field(
        0, description="Employer 401k match percentage"
    )
    currency: str = Field("USD", description="ISO currency code like USD, AED, EUR")

    @property
    def total_expenses(self) -> float:
        return sum(self.expenses.values())

    @property
    def free_cash_flow(self) -> float:
        return self.monthly_income - self.total_expenses

    @property
    def total_debt(self) -> float:
        return sum(d.balance for d in self.debts)

    @property
    def total_min_payments(self) -> float:
        return sum(d.minimum_payment for d in self.debts)

    @property
    def computed_annual_income(self) -> float:
        return self.annual_income if self.annual_income > 0 else self.monthly_income * 12


# ── Agent Output Models ──


class BudgetFinding(BaseModel):
    category: str
    current_amount: float
    recommended_amount: float
    severity: str = Field(..., description="red/yellow/green")
    explanation: str


class BudgetReport(BaseModel):
    findings: list[BudgetFinding]
    total_recoverable_monthly: float
    recommended_split: dict[str, float] = Field(
        ..., description="needs/wants/savings percentages"
    )
    summary: str


class DebtPayoffStep(BaseModel):
    phase: int
    debt_name: str
    monthly_payment: float
    months_to_payoff: int
    interest_saved: float
    description: str


class DebtReport(BaseModel):
    strategy: str = Field(..., description="avalanche or snowball")
    steps: list[DebtPayoffStep]
    total_interest_saved: float
    debt_free_months: int
    summary: str


class InvestmentAllocation(BaseModel):
    asset_class: str
    percentage: float
    rationale: str


class InvestmentReport(BaseModel):
    risk_assessment: str
    goal_fund_strategy: str
    allocations: list[InvestmentAllocation]
    monthly_investment_target: float
    summary: str


class TaxStrategy(BaseModel):
    strategy: str
    annual_savings: float
    description: str


class TaxReport(BaseModel):
    strategies: list[TaxStrategy]
    total_annual_savings: float
    summary: str


class RoadmapMilestone(BaseModel):
    month_start: int
    month_end: int
    title: str
    actions: list[str]
    monthly_savings: float
    cumulative_saved: float


class GoalReport(BaseModel):
    feasible: bool
    milestones: list[RoadmapMilestone]
    projected_total: float
    buffer_amount: float
    summary: str


class WarRoomOutput(BaseModel):
    """Combined output from all agents."""

    profile_summary: dict
    budget: BudgetReport | None = None
    debt: DebtReport | None = None
    investment: InvestmentReport | None = None
    tax: TaxReport | None = None
    goal: GoalReport | None = None
    errors: list[str] = Field(default_factory=list)
