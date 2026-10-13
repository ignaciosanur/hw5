"""Customer Service agent: see backend/prompts/customer_service.md for its scope and rules."""
from backend.agents.base import make_agent
from backend.models import SpecialistReport

customer_service_agent = make_agent("customer_service", SpecialistReport)
