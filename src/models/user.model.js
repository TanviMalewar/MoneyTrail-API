const mongoose = require('mongoose')
const bcrypt=require('bcryptjs')

const userSchema=new mongoose.Schema({
    email:{
        type:String,
        required:[true,"Email is required for creating a user"],
        trim:true,
        lowercase:true,
        unique:[true,"Email already exists"],
        match:[
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
        "Please enter a valid email address"
        ]
    },
    name:{
        type:String,
        required:[true,"Name is required for creating an acoount"]
    },
    password:{
        type:String,
        required:[true,"Password is required for creating an account "],
        minlength:[6,"Password should have more than 6 characters"],
        select:false
    },
    systemUser:{
        type:Boolean,
        default:false,
        immutable:true,
        select:false
    }
},{
    timestamps:true
})



userSchema.pre("save",async function(next){
    if(!this.isModified("password")){
        return next()
    }
    const hash = await bcrypt.hash(this.password,10)
    this.password=hash
    
})


userSchema.methods.comparePassword=async function(password){
    return await bcrypt.compare(password,this.password )
}


const userModel = mongoose.model("user",userSchema)
module.exports=userModel