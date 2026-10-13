"""Shared plumbing for the five agents: build an agent, run its loop with auditing,
and the `delegate` tool that gives every agent a line to every other agent.

Full connectivity, with guards so it can't loop or run up the bill:
- no delegating to yourself or to anyone already up the chain (they are waiting on you)
- at most MAX_DELEGATION_DEPTH hops below the Boss
- at most MAX_DELEGATIONS_PER_TICKET hand-offs per ticket
- every agent in a ticket run shares one RunUsage, so TEAM_LIMITS caps the whole team
"""
from typing import Any

from pydantic_ai import Agent, RunContext
from pydantic_ai.exceptions import UsageLimitExceeded

from backend import audit
from backend.config import (MAX_DELEGATION_DEPTH, MAX_DELEGATIONS_PER_TICKET, PROMPTS_DIR, TEAM_LIMITS,
                            build_model)
from backend.mcp_tools import tools_for
from backend.models import AgentName, TeamDeps

TEAM: dict[str, Agent] = {}  # filled by the role modules


async def delegate(ctx: RunContext[TeamDeps], to_agent: AgentName, task: str, reason: str) -> dict:
    """Hand part of the ticket to a teammate and wait for their report.

    Teammates:
      boss: routes tickets and makes the final call; the only one who updates ticket status.
      inventory: stock by SKU and size, shortfalls, other sizes, which vendor can restock and when.
      accounting: cash, payment priority, vendor invoices, pricing/discounts and margins; the only
        one who files payment and purchase-order requests for human approval.
      facilities: leases and rent: amount, due date, landlord checks.
      customer_service: writes customer/landlord message drafts (never sends them).

    Args:
        to_agent: who should do the work.
        task: a specific instruction with the IDs, SKUs, sizes, quantities and amounts they need.
        reason: one line on why you need this from them.
    """
    d = ctx.deps
    run = d.run
    refusal = None
    if to_agent == d.agent:
        refusal = "You can't delegate to yourself. Do it with your own tools."
    elif to_agent in d.chain:
        refusal = (f"{to_agent} is already up the chain ({' -> '.join(d.chain)}) waiting on your answer. "
                   "Put what you need from them in your report instead.")
    elif d.depth + 1 > MAX_DELEGATION_DEPTH:
        refusal = f"Delegation depth limit ({MAX_DELEGATION_DEPTH}) reached. Finish with what you have."
    elif run.delegations >= MAX_DELEGATIONS_PER_TICKET:
        refusal = f"This ticket already used {MAX_DELEGATIONS_PER_TICKET} hand-offs. Finish with what you have."
    if refusal:
        await audit.append(d, "delegation_refused", to_agent=to_agent, task=task, reason=refusal)
        return {"status": "refused", "reason": refusal}

    run.delegations += 1
    child = TeamDeps(run=run, agent=to_agent, chain=[*d.chain, to_agent])
    await audit.append(d, "delegation_started", to_agent=to_agent, task=task, reason=reason,
                       delegation_number=run.delegations)
    prompt = (f"Ticket {run.ticket_id}. Request from {d.agent} (chain: {' -> '.join(child.chain)}).\n"
              f"Task: {task}\nWhy they need it: {reason}")
    try:
        report = await run_agent(to_agent, prompt, child, usage=ctx.usage)
    except UsageLimitExceeded:
        raise  # the team budget is spent: stop the whole run, don't let the caller retry
    except Exception as exc:  # a teammate failing shouldn't crash the caller
        await audit.append(d, "delegation_failed", to_agent=to_agent, error=audit.clip(str(exc), 500))
        return {"status": "error", "agent": to_agent, "error": str(exc)[:500]}
    result = report.model_dump()
    await audit.append(d, "delegation_done", to_agent=to_agent, report=result)  # whole report, structured
    return {"status": "ok", **result}


def make_agent(role: AgentName, output_type: type) -> Agent:
    agent = Agent(
        None,  # the model is supplied at run time, so the API can start without a Portkey key
        name=role,
        deps_type=TeamDeps,
        output_type=output_type,
        instructions=(PROMPTS_DIR / f"{role}.md").read_text(encoding="utf-8"),
        toolsets=[tools_for(role)],
        tools=[delegate],
        retries=2,
    )
    TEAM[role] = agent
    return agent


async def run_agent(role: str, prompt: str, deps: TeamDeps, usage=None) -> Any:
    """Drive one agent's loop node by node, writing every node to the audit trail."""
    agent = TEAM[role]
    async with agent.iter(prompt, deps=deps, usage=usage or deps.run.usage, usage_limits=TEAM_LIMITS,
                          model=build_model()) as run:
        step = 0
        async for node in run:
            step += 1
            await audit.log_node(deps, step, node)
    return run.result.output
