"""Inventory agent: see backend/prompts/inventory.md for its scope and rules."""
from backend.agents.base import make_agent
from backend.models import SpecialistReport

inventory_agent = make_agent("inventory", SpecialistReport)
