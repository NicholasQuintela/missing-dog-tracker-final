export const REWARD_CURRENCIES = [
  ["PHP", "Philippine Peso"], ["USD", "US Dollar"], ["EUR", "Euro"],
  ["GBP", "British Pound"], ["CAD", "Canadian Dollar"], ["AUD", "Australian Dollar"],
  ["JPY", "Japanese Yen"], ["KRW", "South Korean Won"], ["SGD", "Singapore Dollar"],
  ["MYR", "Malaysian Ringgit"], ["THB", "Thai Baht"], ["IDR", "Indonesian Rupiah"],
  ["VND", "Vietnamese Dong"], ["HKD", "Hong Kong Dollar"],
] as const

export function formatReward(amount: number, currency?: string | null) {
  const code = currency || "PHP"
  try {
    return new Intl.NumberFormat("en-PH", { style: "currency", currency: code, maximumFractionDigits: code === "JPY" || code === "KRW" || code === "VND" || code === "IDR" ? 0 : 2 }).format(amount)
  } catch {
    return `${code} ${amount.toLocaleString()}`
  }
}
