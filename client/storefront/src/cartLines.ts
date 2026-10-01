import type { CartLine, CartPackLine, CartPackMember } from './cart'

/** What `GET /api/cart` answers: every line and the server-computed goods total. */
export type CartSnapshot = {
  lines: CartLine[]
  goodsTotal: number
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function parseMember(value: unknown): CartPackMember | undefined {
  if (!isRecord(value)) return undefined
  if (
    typeof value.bookId !== 'number' ||
    typeof value.included !== 'boolean' ||
    typeof value.quantity !== 'number' ||
    typeof value.title !== 'string' ||
    typeof value.unitPrice !== 'number'
  ) {
    return undefined
  }
  return {
    bookId: value.bookId,
    included: value.included,
    quantity: value.quantity,
    title: value.title,
    unitPrice: value.unitPrice,
  }
}

function parseLine(value: unknown): CartLine | undefined {
  if (!isRecord(value)) return undefined
  if (value.kind === 'pack') {
    if (
      typeof value.id !== 'number' ||
      typeof value.packId !== 'number' ||
      typeof value.sequence !== 'number' ||
      typeof value.gradeName !== 'string' ||
      typeof value.label !== 'string' ||
      typeof value.lineTotal !== 'number' ||
      !Array.isArray(value.members)
    ) {
      return undefined
    }
    const members: CartPackMember[] = []
    for (const entry of value.members) {
      const member = parseMember(entry)
      if (!member) return undefined
      members.push(member)
    }
    return {
      kind: 'pack',
      id: value.id,
      packId: value.packId,
      sequence: value.sequence,
      gradeName: value.gradeName,
      label: value.label,
      members,
      lineTotal: value.lineTotal,
    }
  }
  if (value.kind === 'item') {
    if (
      typeof value.id !== 'number' ||
      typeof value.itemId !== 'number' ||
      typeof value.quantity !== 'number' ||
      typeof value.title !== 'string' ||
      typeof value.unitPrice !== 'number' ||
      typeof value.lineTotal !== 'number'
    ) {
      return undefined
    }
    return {
      kind: 'item',
      id: value.id,
      itemId: value.itemId,
      quantity: value.quantity,
      title: value.title,
      unitPrice: value.unitPrice,
      lineTotal: value.lineTotal,
    }
  }
  return undefined
}

/**
 * Parses a `GET /api/cart` body as a whole. Any malformed line or member, or a
 * missing goods total, fails the parse so the page never shows a partial cart.
 */
export function parseCartBody(body: unknown): CartSnapshot | undefined {
  if (!isRecord(body) || !Array.isArray(body.lines) || typeof body.goodsTotal !== 'number') {
    return undefined
  }
  const lines: CartLine[] = []
  for (const entry of body.lines) {
    const line = parseLine(entry)
    if (!line) return undefined
    lines.push(line)
  }
  return { lines, goodsTotal: body.goodsTotal }
}

/** `6 of 8 titles · Atlas ×2`: included count, then each included title above one copy, in member order. */
export function compositionMeta(line: CartPackLine): string {
  const included = line.members.filter((member) => member.included)
  let meta = `${included.length} of ${line.members.length} titles`
  for (const member of included) {
    if (member.quantity > 1) meta += ` · ${member.title} ×${member.quantity}`
  }
  return meta
}
