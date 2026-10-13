const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

/** Amounts are dollars by context; the DB stores no currency code. */
export const money = (n: number | null | undefined) => (n == null ? "—" : usd.format(n));

export const clock = (iso: string) =>
  new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });

export const shortDate = (isoDate: string) =>
  new Date(`${isoDate.slice(0, 10)}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

export function duration(fromIso: string, toIso?: string | null) {
  const s = Math.max(0, Math.round(((toIso ? Date.parse(toIso) : Date.now()) - Date.parse(fromIso)) / 1000));
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s`;
}

export const humanize = (s: string) => s.replace(/_/g, " ");

export const TICKET_KIND: Record<string, string> = {
  customer_order: "Customer order",
  rent_notice: "Rent notice",
  price_override: "Discount request",
};

export const APPROVAL_KIND: Record<string, string> = {
  rent: "Rent payment",
  invoice: "Vendor invoice",
  purchase_order: "Restock purchase order",
};

/** Parse a JSON string the audit trail may have stored (older entries were clipped strings). */
export function parseMaybe(v: unknown): any {
  if (typeof v !== "string") return v;
  try {
    return JSON.parse(v);
  } catch {
    return null;
  }
}
