export function formatRupees(rupees: number): string {
  const amount = Number.isFinite(rupees) ? Math.trunc(rupees) : 0
  return `Rs. ${amount.toLocaleString('en-US')}`
}
