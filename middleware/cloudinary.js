const cloduinary = require("cloudinary").v2;
const dotenv=require("dotenv");
dotenv.config();
cloduinary.config({
    cloud_name: "dl54bpnzx",
    api_key: "619498373157961",
    api_secret:"_mDnBoZQfn5l8c-J5iMUWCMSa-Y",
    secure: true,
});

module.exports = cloduinary;