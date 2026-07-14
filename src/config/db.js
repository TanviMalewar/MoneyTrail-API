const mongoose = require('mongoose')

async function connectToDB(){
    try{await mongoose.connect(process.env.MONGO_URI)
    console.log("Database connected successfully")
    //console.log(process.env.MONGO_URI); 
    }
    catch(err){
        console.error("Error is: ",err.message)
        process.exit(1)
    }
}


module.exports = connectToDB;

