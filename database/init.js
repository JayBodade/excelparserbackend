const mongoose = require('mongoose');

const connectToDb= ()=>{
    mongoose.connect('mongodb+srv://app:jazzapp@cluster0.smim1bv.mongodb.net/').then(()=>{
        console.log("connected to database successfully");
    }).catch((e)=>{
        console.log("Something went wrong");
    })
}

module.exports = connectToDb;