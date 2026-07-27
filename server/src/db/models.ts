import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose'

/**
 * One file for all models. They're small, they reference each other, and
 * splitting five short schemas across five files buys nothing.
 *
 * Types are inferred from the schemas rather than hand-written alongside them,
 * so a field can't drift between the type and the database.
 */

export const PLANS = ['free', 'pro', 'unlimited'] as const
export const ROLES = ['user', 'admin'] as const

const userSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    name: { type: String, trim: true },
    role: { type: String, enum: ROLES, default: 'user' },
    plan: { type: String, enum: PLANS, default: 'free' },
    /** Optional per-user Google key. Falls back to the server key when unset. */
    googleApiKey: { type: String, select: false },
    disabled: { type: Boolean, default: false },
    lastLoginAt: Date,
  },
  { timestamps: true },
)

// Never leak the hash, even if a route forgets to project it away.
userSchema.set('toJSON', {
  transform: (_doc, ret: Record<string, unknown>) => {
    delete ret.passwordHash
    delete ret.googleApiKey
    return ret
  },
})

const searchSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    label: String,
    input: { type: Schema.Types.Mixed, required: true },
    location: { lat: Number, lng: Number, label: String },
    total: { type: Number, default: 0 },
    tiles: { type: Number, default: 1 },
    billableCalls: { type: Number, default: 0 },
    costUsd: { type: Number, default: 0 },
    cached: Boolean,
    saved: { type: Boolean, default: false },
  },
  { timestamps: true },
)
searchSchema.index({ user: 1, createdAt: -1 })

/**
 * The lead ledger. One document per (user, place) — place_id is the natural
 * key, and Google's terms allow storing it indefinitely.
 */
const leadSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    placeId: { type: String, required: true },
    name: String,
    address: String,
    phone: String,
    internationalPhone: String,
    website: String,
    rating: Number,
    reviews: { type: Number, default: 0 },
    types: [String],
    primaryType: String,
    openingHours: [String],
    openNow: Boolean,
    lat: Number,
    lng: Number,
    mapsUrl: String,
    priceLevel: String,
    status: String,
    leadScore: { type: Number, default: 0, index: true },
    timesSeen: { type: Number, default: 1 },
    foundVia: [String],
    /** User-curated: explicitly bookmarked, as opposed to merely seen. */
    saved: { type: Boolean, default: false, index: true },
    notes: String,
  },
  { timestamps: true },
)
// The dedupe guarantee, enforced by the database rather than by hope.
leadSchema.index({ user: 1, placeId: 1 }, { unique: true })

const usageSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    day: { type: String, required: true }, // YYYY-MM-DD, UTC
    searches: { type: Number, default: 0 },
    calls: { type: Number, default: 0 },
    costUsd: { type: Number, default: 0 },
  },
  { timestamps: true },
)
usageSchema.index({ user: 1, day: 1 }, { unique: true })

const exportSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    format: { type: String, enum: ['csv', 'xlsx', 'json'] },
    rows: Number,
    filename: String,
  },
  { timestamps: true },
)

export const User = model('User', userSchema)
export const Search = model('Search', searchSchema)
export const Lead = model('Lead', leadSchema)
export const Usage = model('Usage', usageSchema)
export const ExportLog = model('ExportLog', exportSchema)

export type UserDoc = HydratedDocument<InferSchemaType<typeof userSchema>>
export type LeadDoc = HydratedDocument<InferSchemaType<typeof leadSchema>>
export type Plan = (typeof PLANS)[number]
export type Role = (typeof ROLES)[number]
