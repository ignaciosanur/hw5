"""Data types shared by the Campus Customs agent team."""
from dataclasses import dataclass, field
from typing import Literal

from pydantic import BaseModel, Field
from pydantic_ai.usage import RunUsage

AgentName = Literal["boss", "inventory", "accounting", "facilities", "customer_service"]
TicketStatus = Literal["open", "in_progress", "waiting_approval", "blocked", "resolved"]


# ---------------------------------------------------------------- run state (agent deps)

@dataclass
class RunState:
    """One ticket run. Shared by every agent the run touches."""
    run_id: str
    ticket_id: int | None
    usage: RunUsage = field(default_factory=RunUsage)
    delegations: int = 0


@dataclass
class TeamDeps:
    """What each agent gets in RunContext.deps: who it is and who asked it."""
    run: RunState
    agent: AgentName
    chain: list[str]          # e.g. ["boss", "accounting"]; last item is this agent

    @property
    def depth(self) -> int:
        return len(self.chain) - 1


# ---------------------------------------------------------------- agent outputs

class SpecialistReport(BaseModel):
    """What a specialist hands back to whoever delegated to it."""
    agent: AgentName
    summary: str = Field(description="Two or three sentences answering the task you were given.")
    facts: list[str] = Field(default_factory=list,
                             description="Facts with numbers, each taken from a tool result (say which tool).")
    actions_taken: list[str] = Field(default_factory=list,
                                     description="Things you changed, e.g. 'filed payment request 3 for $840'.")
    payment_request_ids: list[int] = Field(default_factory=list)
    draft_ids: list[int] = Field(default_factory=list)
    needs_human_approval: list[str] = Field(default_factory=list)
    blockers: list[str] = Field(default_factory=list)
    recommendation: str = Field(description="What you think the team should do next, and why.")


class TicketDecision(BaseModel):
    """The Boss's final call on one ticket."""
    ticket_id: int
    status: TicketStatus
    decision: str = Field(description="The call in one or two sentences.")
    reasoning: str = Field(description="Why, citing the facts and shop rules that drove it.")
    payment_request_ids: list[int] = Field(default_factory=list)
    draft_ids: list[int] = Field(default_factory=list)
    waiting_on_human: list[str] = Field(default_factory=list,
                                        description="Each approval or decision a person must make.")
    next_steps: list[str] = Field(default_factory=list)


# ---------------------------------------------------------------- API (backend/main.py)

class TicketOut(BaseModel):
    id: int
    type: str
    requester: str
    subject: str
    description: str = Field(description="The original request text.")
    status: str = Field(description="Live status from the tickets table.")
    is_resolved: bool
    sku: str | None = None
    size: str | None = None
    qty: int | None = None
    lease_id: int | None = None
    invoice_id: int | None = None
    created_at: str
    decision_notes: list[str] = Field(default_factory=list, description="Dated notes the Boss appended.")
    pending_approval_ids: list[int] = Field(default_factory=list)
    draft_ids: list[int] = Field(default_factory=list)
    running: bool = False
    last_run_id: str | None = None
    last_run: "RunSummary | None" = None


class RunSummary(BaseModel):
    """The ticket's latest run since the last reset, rebuilt from the audit trail (survives restarts)."""
    run_id: str
    status: Literal["running", "finished", "failed", "interrupted"]
    started_at: str
    finished_at: str | None = None
    decision: dict | None = None
    error: str | None = None


class RunAccepted(BaseModel):
    run_id: str
    ticket_id: int
    status: Literal["running"] = "running"
    events_url: str


class RunOut(BaseModel):
    run_id: str
    ticket_id: int
    status: Literal["running", "finished", "failed"]
    started_at: str
    finished_at: str | None = None
    result: dict | None = None


class EventOut(BaseModel):
    seq: int
    ts: str
    run_id: str | None
    ticket_id: int | None
    agent: str | None
    depth: int | None
    event: str
    summary: str
    detail: dict


class CashAccountOut(BaseModel):
    name: str
    balance: float
    as_of: str


class CashOut(BaseModel):
    account: str
    balance: float
    currency: str | None = Field(None, description="Not stored in the DB; amounts are dollars by context.")
    as_of: str
    accounts: list[CashAccountOut]
    pending_approvals_total: float
    balance_if_all_pending_approved: float


class ApprovalOut(BaseModel):
    id: int
    kind: str
    ref_id: int | None
    vendor_id: int | None
    sku: str | None
    size: str | None
    qty: int | None
    amount: float
    account: str
    reason: str
    ticket_id: int | None
    requested_by: str
    status: str
    created_at: str
    decided_by: str | None
    decided_at: str | None
    decision_note: str | None
    payment_id: int | None
    payee: str | None = Field(None, description="Vendor or landlord name from the DB.")
    description: str | None = Field(None, description="What the money is for, from the DB.")


class ApproveIn(BaseModel):
    approved_by: str = Field(min_length=1, max_length=80, description="Name of the human approving.")


class RejectIn(BaseModel):
    rejected_by: str = Field(min_length=1, max_length=80)
    reason: str = Field(min_length=1, max_length=500)


class ApprovalResult(BaseModel):
    approval: ApprovalOut
    payment: dict
    cash: CashOut


class ResetOut(BaseModel):
    ok: bool
    tickets: list[dict]
    cash: CashOut
    payments: int
    pending_approvals: int
    drafts: int
    events_marker_seq: int

TicketOut.model_rebuild()
