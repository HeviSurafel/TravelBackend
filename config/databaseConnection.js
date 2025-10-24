const mongoose=require('mongoose');

const db=async()=>{
    try{
     const connect= await mongoose.connect(process.env.MONGODB_URL||"mongodb+srv://admin:admin@travel.xeb3fte.mongodb.net/?retryWrites=true&w=majority&appName=Travel");
        console.log('database connected'+connect.connection.host);
    }catch(err){
        console.log(err.message);
    }
}
module.exports=db