const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: "surafelwondu5647@gmail.com", // Gmail account
    pass: "eejwzofewjvunsgq", // App password without spaces
  },
});

module.exports = transporter;