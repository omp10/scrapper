/**
 * Promote or demote a user by email.
 *
 * Exists because the first admin of a fresh install can't be created from the
 * UI, and because locking yourself out shouldn't require opening a Mongo shell.
 *
 *   node scripts/set-role.mjs someone@example.com admin
 *   node scripts/set-role.mjs someone@example.com user
 */
import 'dotenv/config'
import mongoose from 'mongoose'

const [email, role = 'admin'] = process.argv.slice(2)

if (!email || !['admin', 'user'].includes(role)) {
  console.error('usage: node scripts/set-role.mjs <email> [admin|user]')
  process.exit(1)
}

const uri = process.env.MONGO_URI ?? process.env.MONGODB_URI
if (!uri) {
  console.error('MONGODB_URI is not set — nothing to connect to.')
  process.exit(1)
}

await mongoose.connect(uri)

// Bypasses the model layer deliberately: this must keep working even if the
// schema changes, and it touches exactly one field.
const result = await mongoose.connection
  .collection('users')
  .findOneAndUpdate(
    { email: email.toLowerCase() },
    { $set: { role } },
    { returnDocument: 'after', projection: { email: 1, role: 1, plan: 1, disabled: 1 } },
  )

if (!result) {
  console.error(`No user with email ${email}. They must register first.`)
  await mongoose.disconnect()
  process.exit(1)
}

console.log(`${result.email} -> role: ${result.role}, plan: ${result.plan}`)
if (result.disabled) console.log('Note: this account is currently disabled.')

await mongoose.disconnect()
