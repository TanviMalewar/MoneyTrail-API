const mongoose = require('mongoose')
const transactionModel = require('../models/transaction.model')
const ledgerModel = require('../models/ledger.model')
const accountModel = require('../models/account.model')
const emailService = require('../services/email.service')


// Business-rule failure that should be sent to the client with a specific status
class TransferError extends Error {
    constructor(status, message) {
        super(message)
        this.status = status
    }
}

const isValidAmount = (amount) =>
    typeof amount === 'number' && Number.isFinite(amount) && amount > 0


// Reply for a request whose idempotencyKey was already used
function respondForExistingTransaction(res, existing) {
    if (existing.status === "COMPLETED") {
        return res.status(200).json({
            message: "Transaction already processed",
            transaction: existing
        })
    }
    if (existing.status === "PENDING") {
        return res.status(200).json({ message: "Transaction is still processing" })
    }
    if (existing.status === "FAILED") {
        return res.status(500).json({ message: "Transaction failed" })
    }
    return res.status(500).json({ message: "Transaction was reversed, please retry" })
}


/**
 * Moves money between two accounts atomically.
 * Everything (transaction doc + debit + credit + status) commits together or not at all.
 *
 * - ownerId:        if given, fromAccount must belong to this user
 * - requireBalance: false only for system initial-funds
 */
async function executeTransfer({ fromAccount, toAccount, amount, idempotencyKey, ownerId, requireBalance }) {

    return mongoose.connection.transaction(async (session) => {

        await accountModel.updateOne(
            { _id: fromAccount },
            { $inc: { lockVersion: 1 } },
            { session }
        )

        const from = await accountModel.findById(fromAccount).session(session)
        const to = await accountModel.findById(toAccount).session(session)

        if (!from || !to) {
            throw new TransferError(400, "Invalid from or to account")
        }
        if (ownerId && String(from.user) !== String(ownerId)) {
            throw new TransferError(403, "You can only transfer money from your own account")
        }
        if (from.status !== "ACTIVE" || to.status !== "ACTIVE") {
            throw new TransferError(400, "Both from account and to account must be active")
        }

        if (requireBalance) {
            const balance = await from.getBalance(session)
            if (balance < amount) {
                throw new TransferError(400, `Insufficient balance in fromAccount. Current balance is ${balance}`)
            }
        }

        const [transaction] = await transactionModel.create([{
            fromAccount,
            toAccount,
            amount,
            idempotencyKey,
            status: "PENDING"
        }], { session })

        await ledgerModel.create([{
            account: fromAccount,
            amount,
            transaction: transaction._id,
            type: "DEBIT"
        }], { session })

        await ledgerModel.create([{
            account: toAccount,
            amount,
            transaction: transaction._id,
            type: "CREDIT"
        }], { session })

        transaction.status = "COMPLETED"
        await transaction.save({ session })

        return transaction
    })
}


// Shared error handling for both endpoints
async function handleTransferError(err, res, idempotencyKey) {
    if (err instanceof TransferError) {
        return res.status(err.status).json({ message: err.message })
    }

    // Duplicate idempotencyKey => a parallel request with the same key won the race
    if (err && err.code === 11000) {
        const existing = await transactionModel.findOne({ idempotencyKey })
        if (existing) return respondForExistingTransaction(res, existing)
    }

    console.error("Transfer failed:", err)
    return res.status(500).json({
        message: "Transaction failed due to an internal error, please retry after some time."
    })
}


async function createTransaction(req, res) {

    //1. Validate request
    const { fromAccount, toAccount, amount, idempotencyKey } = req.body

    if (!fromAccount || !toAccount || amount === undefined || !idempotencyKey) {
        return res.status(400).json({ message: "fromAccount, toAccount, amount and idempotencyKey are required" })
    }
    if (!mongoose.isValidObjectId(fromAccount) || !mongoose.isValidObjectId(toAccount)) {
        return res.status(400).json({ message: "Invalid account id" })
    }
    if (!isValidAmount(amount)) {
        return res.status(400).json({ message: "Amount must be a number greater than 0" })
    }
    if (String(fromAccount) === String(toAccount)) {
        return res.status(400).json({ message: "Cannot transfer to the same account" })
    }
    if (typeof idempotencyKey !== "string") {
        return res.status(400).json({ message: "idempotencyKey must be a string" })
    }

    //2. Idempotency fast-path
    const existing = await transactionModel.findOne({ idempotencyKey })
    if (existing) {
        return respondForExistingTransaction(res, existing)
    }

    //3-9. Ownership, status, balance and the money movement, all inside one DB transaction
    let transaction
    try {
        transaction = await executeTransfer({
            fromAccount,
            toAccount,
            amount,
            idempotencyKey,
            ownerId: req.user._id,
            requireBalance: true
        })
    } catch (err) {
        return handleTransferError(err, res, idempotencyKey)
    }

    //10. Email notification (sendEmail already swallows and logs its own errors)
    await emailService.sendTransactionEmail(
        req.user.email,
        req.user.name,
        amount,
        toAccount
    )

    return res.status(201).json({
        message: "Transaction completed successfully",
        transaction
    })
}


async function createInitialFundsTransaction(req, res) {

    const { toAccount, amount, idempotencyKey } = req.body

    if (!toAccount || amount === undefined || !idempotencyKey) {
        return res.status(400).json({ message: "toAccount, amount and idempotencyKey are required" })
    }
    if (!mongoose.isValidObjectId(toAccount)) {
        return res.status(400).json({ message: "Invalid toAccount" })
    }
    if (!isValidAmount(amount)) {
        return res.status(400).json({ message: "Amount must be a number greater than 0" })
    }
    if (typeof idempotencyKey !== "string") {
        return res.status(400).json({ message: "idempotencyKey must be a string" })
    }

    // Idempotency fast-path
    const existing = await transactionModel.findOne({ idempotencyKey })
    if (existing) {
        return respondForExistingTransaction(res, existing)
    }

    // The system user's funding account (oldest ACTIVE one, so the choice is deterministic)
    const systemAccount = await accountModel
        .findOne({ user: req.user._id, status: "ACTIVE" })
        .sort({ createdAt: 1 })

    if (!systemAccount) {
        return res.status(400).json({ message: "System user account not found" })
    }
    if (String(systemAccount._id) === String(toAccount)) {
        return res.status(400).json({ message: "Cannot fund the system account from itself" })
    }

    try {
        const transaction = await executeTransfer({
            fromAccount: systemAccount._id,
            toAccount,
            amount,
            idempotencyKey,
            ownerId: req.user._id,
            requireBalance: false   // the system account is the money source
        })

        return res.status(201).json({
            message: "Initial funds transaction completed successfully",
            transaction
        })
    } catch (err) {
        return handleTransferError(err, res, idempotencyKey)
    }
}


module.exports = { createTransaction, createInitialFundsTransaction }