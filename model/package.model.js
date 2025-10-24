const mongoose = require("mongoose");

const packageSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, "Package title is required"],
    },
    description: {
      type: String,
      required: [true, "Package description is required"],
    },
    destination: {
      type: String,
      required: [true, "Destination is required"],
    },
    duration: {
      type: Number,
      required: [true, "Duration is required"],
    },
    price: {
      type: Number,
      required: [true, "Package price is required"],
    },
    numberOfPeople: {
      type: Number,
      required: [true, "Number of people is required"],
    },
    category: {
      type: String,
      required: [true, "Package category is required"],
    },
    images: [
      {
        type: String,
        required: [true, "Package images are required"],
      },
    ],
    highlights: [{ type: String }],
    inclusions: [{ type: String }],
    exclusions: [{ type: String }],
    requirements: [{ type: String }],
    dayItinerary: [
      {
        title: { type: String, required: true },
        description: { type: String, required: true },
      },
    ],
    // Automatically calculated
    days: {
      type: Number,
      default: 0,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  {
    timestamps: true,
  }
);

// Auto-update days based on dayItinerary length before save
packageSchema.pre("save", function (next) {
  this.days = this.dayItinerary?.length || 0;
  next();
});

module.exports = mongoose.model("Package", packageSchema);
