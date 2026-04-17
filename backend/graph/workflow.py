"""LangGraph workflow builder — assembles the stateful financial analysis pipeline."""

from __future__ import annotations

from langgraph.graph import StateGraph, END

from graph.state import WarRoomState
from graph.nodes import (
    intake_node,
    budget_node,
    debt_node,
    investment_node,
    tax_node,
    goal_node,
)


def should_continue_after_debt(state: WarRoomState) -> str:
    """Conditional edge: skip investment if critical errors occurred."""
    if len(state.get("errors", [])) > 2:
        return "goal"  # Skip to goal with whatever we have
    return "invest"


def build_workflow() -> StateGraph:
    """
    Build the LangGraph workflow for the Finance War Room.

    Pipeline:
        intake → budget → debt → invest → tax → goal → END
                                  ↓ (if errors)
                                 goal → END

    Each node:
    1. Reads shared state (profile + previous agent findings)
    2. Runs its analysis (tools + optional LLM)
    3. Writes results back to state
    4. Emits streaming events for the frontend
    """

    workflow = StateGraph(WarRoomState)

    # ── Add Nodes ──
    workflow.add_node("intake", intake_node)
    workflow.add_node("budget", budget_node)
    workflow.add_node("debt", debt_node)
    workflow.add_node("invest", investment_node)
    workflow.add_node("tax", tax_node)
    workflow.add_node("goal", goal_node)

    # ── Add Edges (Sequential Pipeline) ──
    workflow.set_entry_point("intake")
    workflow.add_edge("intake", "budget")
    workflow.add_edge("budget", "debt")

    # Conditional: skip investment if too many errors
    workflow.add_conditional_edges(
        "debt",
        should_continue_after_debt,
        {
            "invest": "invest",
            "goal": "goal",
        },
    )

    workflow.add_edge("invest", "tax")
    workflow.add_edge("tax", "goal")
    workflow.add_edge("goal", END)

    return workflow


def create_app():
    """Compile the workflow into a runnable app."""
    workflow = build_workflow()
    app = workflow.compile()
    return app


def get_initial_state(profile_dict: dict) -> WarRoomState:
    """Create the initial state for a new pipeline run."""
    return WarRoomState(
        profile=profile_dict,
        budget_report=None,
        debt_report=None,
        investment_report=None,
        tax_report=None,
        goal_report=None,
        current_step="",
        completed_steps=[],
        errors=[],
        events=[],
    )
