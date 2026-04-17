"""LangGraph state definition — shared state across all pipeline nodes."""

from __future__ import annotations

from typing import Any, TypedDict
from models.schemas import FinancialProfile


class WarRoomState(TypedDict):
    """Shared state that flows through the LangGraph pipeline.
    
    Each node reads from previous results and writes its own findings.
    This is the backbone of inter-agent communication.
    """

    # Input
    profile: dict  # Serialized FinancialProfile
    
    # Agent outputs (populated by each node)
    budget_report: dict | None
    debt_report: dict | None
    investment_report: dict | None
    tax_report: dict | None
    goal_report: dict | None
    
    # Pipeline metadata
    current_step: str
    completed_steps: list[str]
    errors: list[str]
    
    # Streaming events for WebSocket
    events: list[dict]
