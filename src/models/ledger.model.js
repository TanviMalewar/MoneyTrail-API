const mongoose=require('mongoose')
const { findOneAndUpdate } = require('./account.model')

const ledgerSchema=new mongoose.Schema({
    account:{
        type:mongoose.Schema.Types.ObjectId,
        ref:"account",
        required:[true,"Ledger must be associated with an account"],
        index:true,
        immutable:true
    },
    amount:{
        type:Number,
        required:[true,"Amount is require to create a ledger"],
        immutable:true
    },
    transaction:{
        type:mongoose.Schema.Types.ObjectId,
        ref:"transaction",
        required:[true,"Ledger must be associated with a transaction"],
        immutable:true
    },
    type:{
        type:String,
        enum:{
            values:["CREDIT","DEBIT"],
            message:"Type can be either CREDIT or DEBIT"
        },
        required:[true,"Ledger type is required"],
        immutable:true
    }
})



function preventLedgerModification(){
    throw new Error("Ledges entries are immutable and cannot be modified or deleted")
}


ledgerSchema.pre('findOneAndUpdate',preventLedgerModification)
ledgerSchema.pre('updateOne',preventLedgerModification)
ledgerSchema.pre('deleteOne',preventLedgerModification)
ledgerSchema.pre('remove',preventLedgerModification)
ledgerSchema.pre('deleteMany',preventLedgerModification)
ledgerSchema.pre('findOneAndDelete',preventLedgerModification)
ledgerSchema.pre('findOneAndReplace',preventLedgerModification)
ledgerSchema.pre('updateMany', preventLedgerModification);

const ledgerModel=mongoose.model("ledger",ledgerSchema)
module.exports=ledgerModel