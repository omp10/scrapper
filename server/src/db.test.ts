/**
 * Integration tests against a real MongoDB (in-process, ephemeral).
 *
 * These cover the things that only break once a database is involved: the
 * dedupe guarantee, enrichment across searches, and whether the quota can be
 * raced past its limit.
 */
import { test, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'

process.env.GOOGLE_MAPS_API_KEY ??= 'test-key'

const { Lead, Usage, User } = await import('./db/models.ts')
const { mergeAll, ledgerStats } = await import('./lib/leads.ts')
const { enforceQuota, recordSpend, PLAN_LIMITS, today } = await import('./lib/quota.ts')
const { hashPassword, verifyPassword } = await import('./lib/auth.ts')

let mem: MongoMemoryServer
const USER = new mongoose.Types.ObjectId().toString()

const biz = (o: Record<string, unknown>) => ({
  placeId: 'x',
  name: 'X',
  address: null,
  phone: null,
  internationalPhone: null,
  website: null,
  rating: null,
  reviews: 0,
  types: [] as string[],
  primaryType: null,
  openingHours: null,
  openNow: null,
  lat: null,
  lng: null,
  mapsUrl: null,
  priceLevel: null,
  status: null,
  ...o,
}) as never

before(async () => {
  mem = await MongoMemoryServer.create()
  await mongoose.connect(mem.getUri('leadfinder-test'))
})

after(async () => {
  await mongoose.disconnect()
  await mem.stop()
})

beforeEach(async () => {
  await Promise.all([Lead.deleteMany({}), Usage.deleteMany({}), User.deleteMany({})])
})

test('same place from two searches is one enriched lead', async () => {
  const first = await mergeAll(USER, [biz({ placeId: 'dup', name: 'Cafe', reviews: 10 })], 'search A')
  assert.equal(first[0]!.timesSeen, 1)

  const second = await mergeAll(USER, [biz({ placeId: 'dup', name: 'Cafe', phone: '999', reviews: 12 })], 'search B')
  assert.equal(second[0]!.timesSeen, 2)
  // Enrichment: the phone from the later search fills the earlier gap.
  assert.equal(second[0]!.phone, '999')
  assert.equal(second[0]!.reviews, 12)
  assert.deepEqual(second[0]!.foundVia, ['search A', 'search B'])

  // One document, not two — the unique index is the real guarantee.
  assert.equal(await Lead.countDocuments({ user: USER, placeId: 'dup' }), 1)
})

test('merging never walks a review count backwards', async () => {
  await mergeAll(USER, [biz({ placeId: 'rev', reviews: 500 })], 'A')
  const stale = await mergeAll(USER, [biz({ placeId: 'rev', reviews: 3 })], 'B')
  assert.equal(stale[0]!.reviews, 500)
})

test('merging never overwrites a real value with null', async () => {
  await mergeAll(USER, [biz({ placeId: 'keep', website: 'http://x.com' })], 'A')
  const next = await mergeAll(USER, [biz({ placeId: 'keep', website: null })], 'B')
  assert.equal(next[0]!.website, 'http://x.com')
})

test('one user cannot see another user\'s leads', async () => {
  const other = new mongoose.Types.ObjectId().toString()
  await mergeAll(USER, [biz({ placeId: 'mine' })], 'A')
  await mergeAll(other, [biz({ placeId: 'theirs' })], 'A')

  assert.deepEqual(await ledgerStats(USER), { uniqueLeads: 1, savedLeads: 0 })
  assert.deepEqual(await ledgerStats(other), { uniqueLeads: 1, savedLeads: 0 })
})

test('the same place for two different users is two ledger entries', async () => {
  const other = new mongoose.Types.ObjectId().toString()
  await mergeAll(USER, [biz({ placeId: 'shared' })], 'A')
  await mergeAll(other, [biz({ placeId: 'shared' })], 'A')
  assert.equal(await Lead.countDocuments({ placeId: 'shared' }), 2)
})

test('a big batch is deduped within itself', async () => {
  const batch = [biz({ placeId: 'a' }), biz({ placeId: 'b' }), biz({ placeId: 'a' })]
  const merged = await mergeAll(USER, batch, 'tiled')
  // Three inputs, two real businesses.
  assert.equal(await Lead.countDocuments({ user: USER }), 2)
  assert.equal(merged.length, 2)
})

/** Drive the middleware without spinning up Express. */
async function attemptSearch(userId: string, plan = 'free') {
  const req = { user: { id: userId, plan, email: 'a@b.c', role: 'user' } } as never
  return new Promise<string | null>((resolve) => {
    Promise.resolve(enforceQuota(req, {} as never, () => resolve(null))).catch((err) =>
      resolve((err as Error).message),
    )
  })
}

test('quota blocks the search after the limit and not before', async () => {
  const limit = PLAN_LIMITS.free.searchesPerDay
  for (let i = 0; i < limit; i++) {
    assert.equal(await attemptSearch(USER), null, `search ${i + 1} should be allowed`)
  }
  const blocked = await attemptSearch(USER)
  assert.match(String(blocked), /Daily search limit reached/)

  const usage = await Usage.findOne({ user: USER, day: today() })
  // The rejected attempt must not have consumed quota.
  assert.equal(usage!.searches, limit)
})

test('concurrent searches cannot race past the limit', async () => {
  const limit = PLAN_LIMITS.free.searchesPerDay
  const results = await Promise.all(Array.from({ length: limit + 15 }, () => attemptSearch(USER)))
  const allowed = results.filter((r) => r === null).length
  assert.equal(allowed, limit, `exactly ${limit} should get through, got ${allowed}`)
})

test('spend is recorded against the day', async () => {
  await attemptSearch(USER)
  await recordSpend(USER, 38, 1.33)
  const usage = await Usage.findOne({ user: USER, day: today() })
  assert.equal(usage!.calls, 38)
  assert.ok(Math.abs(usage!.costUsd - 1.33) < 1e-9)
})

test('a pro plan gets a bigger allowance than free', async () => {
  assert.ok(PLAN_LIMITS.pro.searchesPerDay > PLAN_LIMITS.free.searchesPerDay)
  assert.ok(PLAN_LIMITS.pro.callsPerDay > PLAN_LIMITS.free.callsPerDay)
})

test('passwords are hashed, never stored, and verify correctly', async () => {
  const hash = await hashPassword('correct horse battery')
  assert.notEqual(hash, 'correct horse battery')
  assert.ok(await verifyPassword('correct horse battery', hash))
  assert.equal(await verifyPassword('wrong password', hash), false)
})

test('the password hash never reaches JSON', async () => {
  const user = await User.create({ email: 'a@b.co', passwordHash: await hashPassword('secret123') })
  const json = JSON.stringify(user.toJSON())
  assert.ok(!json.includes('passwordHash'), 'passwordHash must not serialise')
  assert.ok(!json.includes('$2'), 'no bcrypt hash in the payload')
})

test('emails are unique regardless of case', async () => {
  await User.create({ email: 'Dup@Example.com', passwordHash: 'x' })
  await assert.rejects(() => User.create({ email: 'dup@example.com', passwordHash: 'y' }))
})
