"""The agents' only route to shop data: the campus-customs-ops MCP server (stdio).

One MCPToolset (one server process) is shared by the team; each role sees a filtered
slice of it (least privilege). The human-only payment tools are never in any slice.
"""
import sys

from fastmcp.client.transports import PythonStdioTransport
from pydantic_ai.mcp import MCPToolset

from backend.config import MCP_SERVER_SCRIPT

HUMAN_ONLY_TOOLS = {"approve_and_pay", "reject_payment_request"}

ROLE_TOOLS: dict[str, set[str]] = {
    "boss": {"list_open_tickets", "get_ticket", "update_ticket", "get_cash_position",
             "list_payment_requests", "list_drafts"},
    "inventory": {"get_ticket", "check_stock", "list_inventory", "get_vendor_status"},
    "accounting": {"get_ticket", "get_cash_position", "get_vendor_status", "get_pricing",
                   "get_rent_status", "request_payment", "list_payment_requests"},
    "facilities": {"get_ticket", "get_rent_status", "get_cash_position", "list_payment_requests"},
    "customer_service": {"get_ticket", "get_pricing", "save_customer_draft", "list_drafts"},
}
assert not any(tools & HUMAN_ONLY_TOOLS for tools in ROLE_TOOLS.values()), "agents must never pay"

shop_mcp = MCPToolset(PythonStdioTransport(script_path=MCP_SERVER_SCRIPT, python_cmd=sys.executable),
                      id="campus-customs-ops")


def tools_for(role: str):
    allowed = ROLE_TOOLS[role]
    return shop_mcp.filtered(lambda ctx, tool_def: tool_def.name in allowed)
