// Creates the "system" user that is allowed to call /api/transactions/system/initial-funds.
// The API has no way to create one (systemUser is immutable and /register ignores it), so we seed it.
// Safe to run many times: does nothing if the user already exists.
//
// Usage:  npm run seed        (uses MONGO_URI from .env)
//         docker compose exec app node scripts/seed-system-user.js
require('dotenv').config()
const mongoose = require('mongoose')
const User = require('../src/models/user.model')

const email = process.env.SYSTEM_EMAIL || 'system@moneytrail.test'
const password = process.env.SYSTEM_PASSWORD || 'System@1234'

async function main() {
    await mongoose.connect(process.env.MONGO_URI)

    // Safety net: refuse to seed anything except a database that is clearly a test one
    const dbName = mongoose.connection.name
    if (!/test/i.test(dbName) && process.env.ALLOW_SEED !== 'true') {
        console.error(`Refusing to seed database "${dbName}" - its name does not contain "test".`)
        console.error('Point MONGO_URI at a test database (e.g. .../moneytrail_test) or set ALLOW_SEED=true.')
        process.exit(1)
    }

    const existing = await User.findOne({ email })
    if (existing) {
        console.log(`System user ${email} already exists in "${dbName}" - nothing to do`)
    } else {
        await User.create({ name: 'System', email, password, systemUser: true })
        console.log(`Created system user ${email} in "${dbName}"`)
    }
    await mongoose.disconnect()
}

main().catch((err) => {
    console.error(err)
    process.exit(1)
})