import mongoose from 'mongoose'
import { log } from '../lib/log.js'

/**
 * Connect to MONGO_URI when set. When it isn't, spin up an in-process MongoDB
 * so the app runs on a fresh clone with no infrastructure — a real mongod,
 * just ephemeral. Production always sets MONGO_URI.
 */
export async function connectDb(): Promise<string> {
  // Accept either spelling — silently falling back to an ephemeral database
  // because of a variable-name mismatch would look like data loss.
  let uri = process.env.MONGO_URI ?? process.env.MONGODB_URI

  if (!uri) {
    const { MongoMemoryServer } = await import('mongodb-memory-server')
    const mem = await MongoMemoryServer.create()
    uri = mem.getUri('leadfinder')
    log.warn('MONGO_URI unset — using an ephemeral in-process MongoDB. Data resets on restart.')
  }

  mongoose.set('strictQuery', true)
  await mongoose.connect(uri)
  log.info({ host: mongoose.connection.host }, 'mongo connected')
  return uri
}

export async function disconnectDb() {
  await mongoose.disconnect()
}
