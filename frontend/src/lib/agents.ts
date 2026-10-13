import { Building2, Calculator, Crown, MessageSquareText, Package, UserRound, type LucideIcon } from "lucide-react";

export interface AgentIdentity {
  key: string;
  name: string;
  role: string;
  /** CSS custom-property suffix: var(--agent-<tone>) */
  tone: string;
  icon: LucideIcon;
}

// The five real agents from backend/agents, plus the human approver.
export const AGENTS: Record<string, AgentIdentity> = {
  boss: { key: "boss", name: "Boss", role: "Routes tickets · final call", tone: "boss", icon: Crown },
  inventory: { key: "inventory", name: "Inventory", role: "Stock, shortfalls, vendors", tone: "inventory", icon: Package },
  accounting: { key: "accounting", name: "Accounting", role: "Cash, invoices, pricing", tone: "accounting", icon: Calculator },
  facilities: { key: "facilities", name: "Facilities", role: "Lease and rent", tone: "facilities", icon: Building2 },
  customer_service: { key: "customer_service", name: "Customer Service", role: "Drafts replies", tone: "service", icon: MessageSquareText },
  human: { key: "human", name: "You", role: "Human approver", tone: "human", icon: UserRound },
};

export function agentOf(key: string | null | undefined): AgentIdentity {
  return AGENTS[key ?? ""] ?? { key: key ?? "system", name: key ?? "System", role: "", tone: "system", icon: UserRound };
}
