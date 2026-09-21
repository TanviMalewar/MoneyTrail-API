const userModel=require('../models/user.model')
const jwt=require('jsonwebtoken')
const emailService=require('../services/email.service')
const tokenBlackListModel=require('../models/blackList.model')


async function userRegisterController(req, res) {

    try {

        const { email, password, name } = req.body || {};

        if (typeof email !== "string" || typeof password !== "string" || typeof name !== "string") {
            return res.status(400).json({
                message: "name, email and password are required and must be strings"
            });
        }

        const isExists = await userModel.findOne({ email });

        if (isExists) {
            return res.status(422).json({
                message: "User already exists"
            });
        }
        const user = await userModel.create({
            email,
            password,
            name
        });
        const token = jwt.sign(
            { userID: user._id },
            process.env.JWT_SECRET,
            { expiresIn: "3d" }
        );

        res.cookie("token", token);

        await emailService.sendRegistrationEmail(user.email,user.name)
        return res.status(201).json({
            user:{
                _id:user._id,
                email:user.email,
                name:user.name
            },
            token
        });
    } catch (err) {
        // Schema validation failed (bad email, missing name, short password...) -> client's fault
        if (err.name === "ValidationError") {
            return res.status(400).json({
                message: Object.values(err.errors).map((e) => e.message).join(", ")
            });
        }
        // Two requests registered the same email at the same moment
        if (err.code === 11000) {
            return res.status(422).json({
                message: "User already exists"
            });
        }
        console.error(err);
        return res.status(500).json({
            error: err.message
        });
    }
}


async function userLoginController(req,res) {
    const { email, password } = req.body || {}

    if (typeof email !== "string" || typeof password !== "string") {
        return res.status(400).json({
            message: "email and password are required and must be strings"
        })
    }

    const user=await userModel.findOne({email}).select("+password")

    if(!user){
        return res.status(401).json({
            message:"Email not found"
        })
    }

    const isValidPassword=await user.comparePassword(password)

    if(!isValidPassword){
        return res.status(401).json({
            message:"Password is invalid"
        })
    }
    const token = jwt.sign(
            { userID: user._id },
            process.env.JWT_SECRET,
            { expiresIn: "3d" }
        );

        res.cookie("token", token);

        return res.status(200).json({
            user:{
                _id:user._id,
                email:user.email,
                name:user.name
            },
            token
        });
}


async function userLogoutController(req,res) {
    const token=req.cookies.token ||req.headers.authorization?.split(" ")[1]
    if(!token){
        return res.status(200).json({
            message:"User logged out successfully "
        })
    }

    

    try {
        await tokenBlackListModel.create({
            token:token
        })
    } catch (err) {
        // 11000 = duplicate key = this token is already blacklisted, which is exactly what we want
        if (err.code !== 11000) throw err
    }
    res.clearCookie("token")

    return res.status(200).json({
            message:"User logged out successfully "
    })

}






module.exports={userRegisterController,userLoginController,userLogoutController}