const userModel=require('../models/user.model')
const jwt=require('jsonwebtoken')
const emailService=require('../services/email.service')
const tokenBlackListModel=require('../models/blackList.model')


async function userRegisterController(req, res) {

    try {

        const { email, password, name } = req.body;
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
        console.error(err);
        return res.status(500).json({
            error: err.message
        });
    }
}


async function userLoginController(req,res) {
    const{email,password}=req.body
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

    

    await tokenBlackListModel.create({
        token:token
    })
    res.clearCookie("token")

    return res.status(200).json({
            message:"User logged out successfully "
    })

}






module.exports={userRegisterController,userLoginController,userLogoutController}