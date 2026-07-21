const express = require("express");
const router = express.Router();

const authMiddleware = require("../middlewares/auth.middleware");
const accountController = require("../controllers/account.controller");

router.post(
    "/",
    authMiddleware.authMiddleware,
    accountController.createAccountController
);


router.get("/",authMiddleware.authMiddleware,accountController.getUserAccountController)

//get-/api/accounts/balance/:accountId
router.get("/balance/:accountId",authMiddleware.authMiddleware,accountController.getAccountBalanceController)

module.exports = router;