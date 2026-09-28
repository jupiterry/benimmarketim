export const NEW_ACTIVITY_YEAR_START = new Date("2026-09-06T00:00:00+03:00");

// End dates are exclusive; all boundaries use the store's Turkey timezone.
export const REVENUE_PERIODS = [
  {
    id: "current",
    label: "Yeni dönem",
    description: "6 Eylül 2026 itibarıyla",
    start: NEW_ACTIVITY_YEAR_START,
  },
  {
    id: "previous",
    label: "Eylül 2025 – Haziran 2026",
    description: "1 Eylül 2025 – 30 Haziran 2026",
    start: new Date("2025-09-01T00:00:00+03:00"),
    end: new Date("2026-07-01T00:00:00+03:00"),
  },
  {
    id: "between",
    label: "Dönem arası",
    description: "1 Temmuz – 5 Eylül 2026",
    start: new Date("2026-07-01T00:00:00+03:00"),
    end: NEW_ACTIVITY_YEAR_START,
  },
  { id: "all", label: "Tüm zamanlar", description: "Tüm kayıtlı satışlar" },
];

export function summarizeRevenue(orders, period) {
  return orders.reduce((summary, order) => {
    const date = new Date(order.createdAt).getTime();
    const amount = Number(order.totalAmount ?? 0);
    if (
      !Number.isFinite(date) ||
      !Number.isFinite(amount) ||
      order.status === "İptal Edildi" ||
      (period.start && date < period.start.getTime()) ||
      (period.end && date >= period.end.getTime())
    ) return summary;
    return { revenue: summary.revenue + amount, count: summary.count + 1 };
  }, { revenue: 0, count: 0 });
}
