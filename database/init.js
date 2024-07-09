const mongoose = require('mongoose');
require('dotenv').config();



const connectToDb= ()=>{
    mongoose.connect(process.env.MONGODB_URL).then(()=>{
        console.log("connected to database successfully");
    }).catch((e)=>{
        console.log("Something went wrong");
    })
}

module.exports = connectToDb;
