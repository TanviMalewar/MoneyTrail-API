const mongoose=require('mongoose')
const transactionModel=require('../models/transaction.model')
const ledgerModel=require('../models/ledger.model')
const accountModel=require('../models/account.model')
const emailService=require('../services/email.service')




async function createTransaction(req,res) {
    
//1.Validate request
    const {fromAccount,toAccount,amount,idempotencyKey}=req.body

    if(!fromAccount || !toAccount || !amount || !idempotencyKey){
        return res.status(400).json({
            message:"Missing fields are required"
        })
    }

    const fromUserAccount=await accountModel.findOne({
        _id:fromAccount
    })

    const toUserAccount=await accountModel.findOne({
        _id:toAccount
    })

    if(!fromUserAccount || !toUserAccount){
        return res.status(400).json({
            message:"Invalid from or to account"
        })
    }


//2. Validate idempotency key

const isTransactionAlreadyExists=await transactionModel.findOne({
    idempotencyKey:idempotencyKey
})

if(isTransactionAlreadyExists){
    if(isTransactionAlreadyExists.status==="COMPLETED"){
        return res.status(200).json({
        message:"Transaction already processed",
        transaction:isTransactionAlreadyExists
    })
    }
    if(isTransactionAlreadyExists.status==="PENDING"){
        return res.status(200).json({
        message:"Transaction is still processing"
    })
    }
    if(isTransactionAlreadyExists.status==="FAILED"){
        return res.status(500).json({
        message:"Transaction failed"
    })
    }
    if(isTransactionAlreadyExists.status==="REVERSED"){
        return res.status(500).json({
        message:"Transaction was reversed,please retry"
    })
    }
}


//3.Check Account status
if(fromUserAccount.status!="ACTIVE" || toUserAccount.status!="ACTIVE"){
    return res.status(400).json({
        message:"Both from account and to account must be active"
    })
}


//4.Derive sender balance from ledger
const balance=await fromUserAccount.getBalance()
if(balance<amount){
    return res.status(400).json({
        message:`Insufficient balance in fromAccount.\nCurrent Balance is ${balance}`
    })
}



//5.Create transaction(PENDING)
const session=await mongoose.startSession()
session.startTransaction()

const transaction=new transactionModel.create({
    fromAccount,
    toAccount,
    amount,
    idempotencyKey,
    status:"PENDING"
},{session})


//6.Create debit ledger entry
const debitLedgerEntry=new ledgerModel.create({
    account:fromAccount,
    amount:amount,
    transaction:transaction._id,
    type:"DEBIT"
},{session})


//7.Create credit ledger entry
const creditLedgerEntry=new ledgerModel.create({
    account:toAccount,
    amount:amount,
    transaction:transaction._id,
    type:"CREDIT"
},{session})


//8.Transaction completed
transaction.status="COMPLETED"

//9.commit mongo-db session
await transaction.save({session})


//10.send email notification
await emailService.sendTransactionEmail(req.user.email,req.user.name, req.user.amount,req.user.toAccount)


return res.status(201).json({
    message:"Transaction completed successfully "
})
}


async function createInitialFundsTransaction(req,res) {
    const {toAccount,amount,idempotencyKey}=req.body
    if(!toAccount || !amount || !idempotencyKey){
        return res.status(400).json({
            message:"Required field not filled"
        })
    }

    const toUserAccount=await accountModel.findOne({
        _id:toAccount
    })
    if(!toUserAccount){
        return res.status(400).json({
            message:"Invalid toAccount"
        })
    }

    const fromUserAccount=await accountModel.findOne({
        //systemUser:true,
        user:req.user._id
    })
    if(!fromUserAccount){
        return res.status(400).json({
            message:"System user account not found"
        })
    }

    const session=await mongoose.startSession()
    session.startTransaction()

    const transaction=new transactionModel({
        fromAccount:fromUserAccount._id,
        toAccount,
        amount,
        idempotencyKey,
        status:"PENDING"
    })

    const debitLedgerEntry=await ledgerModel.create([{
        account:fromUserAccount._id,
        amount:amount,
        transaction:transaction._id,
        type:"DEBIT"
    }],{session})

    const creitLedgerEntry=await ledgerModel.create([{
        account:toAccount,
        amount:amount,
        transaction:transaction._id,
        type:"CREDIT"
    }],{session})

    transaction.status="COMPLETED"
    await transaction.save({session})

    await session.commitTransaction()
    session.endSession()

    return res.status(201).json({
        message:"Initial funds transaction completed successfully",
        transaction:transaction
    })
    

}


module.exports={createTransaction,createInitialFundsTransaction}