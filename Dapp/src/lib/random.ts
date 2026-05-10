/** Phần tử trường ~254 bit (giống generate_input.js: 31 byte ngẫu nhiên) */
export function randomFieldElement(): bigint {
  const buf = new Uint8Array(31)
  crypto.getRandomValues(buf)
  const hex = [...buf].map((b) => b.toString(16).padStart(2, '0')).join('')
  return BigInt(`0x${hex}`)
}
