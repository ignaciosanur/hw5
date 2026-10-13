"""Facilities agent: see backend/prompts/facilities.md for its scope and rules."""
from backend.agents.base import make_agent
from backend.models import SpecialistReport

facilities_agent = make_agent("facilities", SpecialistReport)
