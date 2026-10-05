import { crc32, deflateRawSync } from 'node:zlib'

export type ZipEntry = { name: string; data: Buffer }

const LOCAL_HEADER = 0x04034b50
const CENTRAL_HEADER = 0x02014b50
const END_OF_CENTRAL = 0x06054b50
const VERSION = 20
/** General purpose flag bit 11: names are UTF-8. */
const UTF8_FLAG = 0x0800
const DEFLATE = 8
const MAX_32 = 0xffffffff
const MAX_16 = 0xffff

const COLOMBO_CLOCK = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Colombo',
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  hour: 'numeric',
  minute: 'numeric',
  second: 'numeric',
  hourCycle: 'h23',
})

/** MS-DOS date and time of `at` on the shop's Asia/Colombo wall clock (zip has no time zone). */
function dosDateTime(at: Date): { time: number; date: number } {
  const parts = COLOMBO_CLOCK.formatToParts(at)
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((entry) => entry.type === type)?.value ?? 0)
  const year = Math.min(Math.max(part('year'), 1980), 2107)
  const time = (part('hour') << 11) | (part('minute') << 5) | Math.floor(part('second') / 2)
  const date = ((year - 1980) << 9) | (part('month') << 5) | part('day')
  return { time, date }
}

/**
 * One in-memory zip: every entry deflated, local headers, a central directory and the
 * end record. No Zip64: anything past 4 GiB or 65535 entries is refused.
 */
export function zipFiles(entries: ZipEntry[], at: Date): Buffer {
  if (entries.length > MAX_16) throw new Error('too many zip entries')
  const { time, date } = dosDateTime(at)
  const locals: Buffer[] = []
  const centrals: Buffer[] = []
  let offset = 0

  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8')
    const compressed = deflateRawSync(entry.data)
    const crc = crc32(entry.data) >>> 0
    if (entry.data.length > MAX_32 || compressed.length > MAX_32 || offset > MAX_32) {
      throw new Error('zip entry too large')
    }

    const local = Buffer.alloc(30)
    local.writeUInt32LE(LOCAL_HEADER, 0)
    local.writeUInt16LE(VERSION, 4)
    local.writeUInt16LE(UTF8_FLAG, 6)
    local.writeUInt16LE(DEFLATE, 8)
    local.writeUInt16LE(time, 10)
    local.writeUInt16LE(date, 12)
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(compressed.length, 18)
    local.writeUInt32LE(entry.data.length, 22)
    local.writeUInt16LE(name.length, 26)
    local.writeUInt16LE(0, 28)

    const central = Buffer.alloc(46)
    central.writeUInt32LE(CENTRAL_HEADER, 0)
    central.writeUInt16LE(VERSION, 4)
    central.writeUInt16LE(VERSION, 6)
    central.writeUInt16LE(UTF8_FLAG, 8)
    central.writeUInt16LE(DEFLATE, 10)
    central.writeUInt16LE(time, 12)
    central.writeUInt16LE(date, 14)
    central.writeUInt32LE(crc, 16)
    central.writeUInt32LE(compressed.length, 20)
    central.writeUInt32LE(entry.data.length, 24)
    central.writeUInt16LE(name.length, 28)
    // Extra, comment, disk start, internal and external attributes stay 0.
    central.writeUInt32LE(offset, 42)

    locals.push(local, name, compressed)
    centrals.push(central, name)
    offset += local.length + name.length + compressed.length
  }

  const directory = Buffer.concat(centrals)
  if (offset > MAX_32 || directory.length > MAX_32) throw new Error('zip too large')
  const end = Buffer.alloc(22)
  end.writeUInt32LE(END_OF_CENTRAL, 0)
  end.writeUInt16LE(entries.length, 8)
  end.writeUInt16LE(entries.length, 10)
  end.writeUInt32LE(directory.length, 12)
  end.writeUInt32LE(offset, 16)
  return Buffer.concat([...locals, directory, end])
}
