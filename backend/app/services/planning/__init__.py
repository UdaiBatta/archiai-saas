"""Deterministic spatial-planning primitives (ProgramGraph + scoring).

Building-type-agnostic, no ML. See program_graph.py for the model.
"""
from app.services.planning.program_graph import (
    Edge,
    EngineProgram,
    Node,
    ProgramGraph,
    from_requirements,
    to_engine_program,
)
from app.services.planning.graph_scoring import (
    ConstraintCheck,
    GraphSatisfaction,
    graph_satisfaction_dict,
    score_graph_satisfaction,
)
from app.services.planning.floor_assignment import (
    FloorAssignment,
    FloorAssignmentReason,
    assign_floors,
)

__all__ = [
    "Node",
    "Edge",
    "ProgramGraph",
    "EngineProgram",
    "from_requirements",
    "to_engine_program",
    "ConstraintCheck",
    "GraphSatisfaction",
    "score_graph_satisfaction",
    "graph_satisfaction_dict",
    "FloorAssignment",
    "FloorAssignmentReason",
    "assign_floors",
]
