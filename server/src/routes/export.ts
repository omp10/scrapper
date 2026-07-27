import { Router } from 'express'
import Papa from 'papaparse'
import ExcelJS from 'exceljs'
import { z } from 'zod'
import { requireAuth } from '../lib/auth.js'
import { ExportLog } from '../db/models.js'

export const exportRouter = Router()
exportRouter.use(requireAuth)

/** Every column that may be exported, and the header it gets in the file. */
const COLUMN_LABELS = {
  name: 'Business Name',
  phone: 'Phone',
  internationalPhone: 'Phone (International)',
  website: 'Website',
  address: 'Address',
  rating: 'Rating',
  reviews: 'Reviews',
  primaryType: 'Business Type',
  types: 'All Types',
  openingHours: 'Opening Hours',
  status: 'Status',
  priceLevel: 'Price Level',
  distanceKm: 'Distance (km)',
  leadScore: 'Lead Score',
  lat: 'Latitude',
  lng: 'Longitude',
  mapsUrl: 'Google Maps URL',
  placeId: 'Google Place ID',
  timesSeen: 'Times Seen',
} as const

type Column = keyof typeof COLUMN_LABELS
const ALL_COLUMNS = Object.keys(COLUMN_LABELS) as Column[]

const Body = z.object({
  format: z.enum(['csv', 'json', 'xlsx']),
  filename: z.string().trim().default('leads'),
  // Whitelisted against the known set — an arbitrary string here would let a
  // caller pull any field off the objects, including ones we don't intend.
  columns: z.array(z.enum(ALL_COLUMNS as [Column, ...Column[]])).min(1).optional(),
  businesses: z.array(z.record(z.any())).min(1, 'Nothing to export'),
})

/** Arrays don't fit in a spreadsheet cell; flatten them. */
function flatten(b: Record<string, any>, columns: Column[]) {
  const row: Record<string, unknown> = {}
  for (const c of columns) {
    const v = b[c]
    row[COLUMN_LABELS[c]] = Array.isArray(v) ? v.join('; ') : (v ?? '')
  }
  return row
}

/**
 * ponytail: the client POSTs the rows back, so express.json() still holds the
 * full set in memory before we stream it out — streaming halves peak memory,
 * it doesn't remove the ceiling. If exports ever exceed ~50k rows, switch to
 * POSTing the *search params* and streaming straight from the ledger/cache.
 */
exportRouter.post('/', async (req, res) => {
  const { format, filename, businesses, columns } = Body.parse(req.body)
  // Preserve the canonical column order regardless of the order they were picked.
  const chosen = columns ? ALL_COLUMNS.filter((c) => columns.includes(c)) : ALL_COLUMNS
  const headers = chosen.map((c) => COLUMN_LABELS[c])
  const rows = businesses.map((b) => flatten(b, chosen))
  const safeName = filename.replace(/[^a-z0-9_-]/gi, '_')

  // Logged before streaming — once bytes are flowing the status is already sent.
  await ExportLog.create({
    user: req.user!.id,
    format,
    rows: rows.length,
    filename: `${safeName}.${format}`,
  })

  if (format === 'json') {
    res.attachment(`${safeName}.json`).type('application/json')
    // Honour the column choice here too — otherwise JSON quietly ignores it.
    return res.send(JSON.stringify(rows, null, 2))
  }

  if (format === 'csv') {
    res.attachment(`${safeName}.csv`).type('text/csv')
    // Written in chunks rather than one giant string — a 10k-row export never
    // materialises the whole file in memory, and bytes start flowing at once.
    res.write(`${Papa.unparse([headers])}\n`)
    for (let i = 0; i < rows.length; i += 500) {
      const chunk = Papa.unparse(rows.slice(i, i + 500), {
        columns: headers,
        header: false,
      })
      // Respect backpressure: if the socket is full, wait for it to drain.
      if (!res.write(`${chunk}\n`)) {
        await new Promise((resolve) => res.once('drain', resolve))
      }
    }
    return res.end()
  }

  res
    .attachment(`${safeName}.xlsx`)
    .type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')

  // The streaming writer flushes rows to the socket instead of building the
  // whole workbook in memory first.
  const wb = new ExcelJS.stream.xlsx.WorkbookWriter({ stream: res, useSharedStrings: false })
  const ws = wb.addWorksheet('Leads')
  ws.columns = headers.map((h) => ({ header: h, key: h, width: 22 }))
  ws.getRow(1).font = { bold: true }
  for (const row of rows) ws.addRow(row).commit()
  ws.commit()
  await wb.commit()
})
