const express = require("express");
const router = express.Router();

const authMiddleware = require("../middlewares/auth.middleware");
const accountController = require("../controllers/account.controller");

router.post(
    "/",
    authMiddleware.authMiddleware,
    accountController.createAccountController
);

module.exports = router;