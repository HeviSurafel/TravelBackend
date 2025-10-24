const mongoose = require("mongoose");

const eventSchema = new mongoose.Schema({
  title: { type: String, required: [true, "Title is required"] },
  description: { type: String, required: [true, "Description is required"] },
  date: { type: Date, required: [true, "Date is required"] },
  time: { type: String },
  location: { type: String, required: [true, "Location is required"] },
  price: { type: Number, required: [true, "Price is required"] },
  capacity: { type: Number, required: [true, "Capacity is required"] },
  category: { type: String },
  organizer: { type: String },
  contactEmail: { type: String },
  contactPhone: { type: String },
  inclusions: [{ type: String }],
  requirements: [{ type: String }],
  highlights: [{ type: String }],
  image: [{ type: String }],
  user: { type: mongoose.Schema.Types.ObjectId, ref: "user", required: [true, "User is required"] }
}, { timestamps: true });

module.exports = mongoose.model("Event", eventSchema);
