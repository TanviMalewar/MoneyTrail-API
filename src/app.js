const express = require("express");
const cookieParser = require("cookie-parser");

const authRouter = require("./routes/auth.routes");
const accountRouter = require("./routes/account.routes");
const transactionRoutes= require('./routes/transaction.routes');

const app = express();

app.use(express.json());
app.use(cookieParser());

app.get("/",(req,res)=>{
    res.send("Ledger service is up and running")
})
app.use("/api/auth", authRouter);
app.use("/api/accounts", accountRouter);
app.use("/api/transactions",transactionRoutes)

// Safety net: any error a controller doesn't handle ends up here and becomes clean JSON
app.use((err, req, res, next) => {
    const status = err.status || err.statusCode
    // e.g. malformed JSON body -> body-parser already sets status 400
    if (status >= 400 && status < 500) {
        return res.status(status).json({ message: err.message })
    }
    if (err.name === "CastError" || err.name === "ValidationError") {
        return res.status(400).json({ message: err.message })
    }
    console.error(err)
    return res.status(500).json({ message: "Internal server error" })
})

module.exports = app;