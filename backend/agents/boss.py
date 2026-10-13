"""Boss agent: reads each ticket, routes it, makes the final call. See backend/prompts/boss.md."""
from pydantic_ai import ModelRetry, RunContext
from pydantic_ai.messages import ModelResponse, ToolCallPart

from backend.agents.base import make_agent
from backend.models import TeamDeps, TicketDecision

boss_agent = make_agent("boss", TicketDecision)


@boss_agent.output_validator
def must_record_decision(ctx: RunContext[TeamDeps], decision: TicketDecision) -> TicketDecision:
    """The Boss can't finish a ticket without writing its call to the board."""
    recorded = any(isinstance(p, ToolCallPart) and p.tool_name == "update_ticket"
                   and p.args_as_dict().get("ticket_id") == decision.ticket_id
                   for m in ctx.messages if isinstance(m, ModelResponse) for p in m.parts)
    if not recorded:
        raise ModelRetry(f"Record your decision first: call update_ticket(ticket_id={decision.ticket_id}, "
                         f"status='{decision.status}', note=..., updated_by='boss'), then return the decision.")
    return decision
