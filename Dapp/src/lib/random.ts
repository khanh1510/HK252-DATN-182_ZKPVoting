// 31 random bytes = ~248-bit field element, safely below BN254 scalar field order
export function randomFieldElement(): bigint {
  const buf = new Uint8Array(31)
  crypto.getRandomValues(buf)
  const hex = [...buf].map((b) => b.toString(16).padStart(2, '0')).join('')
  return BigInt(`0x${hex}`)
}
