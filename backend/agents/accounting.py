"""Accounting agent: see backend/prompts/accounting.md for its scope and rules."""
from backend.agents.base import make_agent
from backend.models import SpecialistReport

accounting_agent = make_agent("accounting", SpecialistReport)
