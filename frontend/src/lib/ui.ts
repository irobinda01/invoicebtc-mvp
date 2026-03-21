export function cn(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(' ')
}

export function formatCompactAddress(address: string | null | undefined, lead = 6, tail = 4) {
  if (!address) return 'Not connected'
  if (address.length <= lead + tail) return address
  return `${address.slice(0, lead)}...${address.slice(-tail)}`
}
