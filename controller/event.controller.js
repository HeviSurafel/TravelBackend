const Event = require("../model/event.model");
const cloudinary = require("../middleware/cloudinary");
const mongoose = require("mongoose");
// Create Event
const createEvent = async (req, res) => {
  try {
    const {
      title,
      date,
      time,
      location,
      price,
      capacity,
      category,
      organizer,
      contactEmail,
      contactPhone,
      description,
      inclusions,
      requirements,
      highlights,
    } = req.body;
    const user=req.user._id;

    // Parse JSON fields (coming as strings from FormData)
    const parsedInclusions = inclusions ? JSON.parse(inclusions) : [];
    const parsedRequirements = requirements ? JSON.parse(requirements) : [];
    const parsedHighlights = highlights ? JSON.parse(highlights) : [];

    // Handle multiple images
    const imageUrls = [];
    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        const uploadedImage = await cloudinary.uploader.upload(file.path, {
          folder: "events",
        });
        imageUrls.push(uploadedImage.secure_url);
      }
    }

    const newEvent = await Event.create({
      title,
      date: date ? new Date(date) : null,
      time,
      location,
      description,
      price,
      capacity,
      category,
      organizer,
      contactEmail,
      contactPhone,
      inclusions: parsedInclusions,
      requirements: parsedRequirements,
      highlights: parsedHighlights,
      image: imageUrls,        // ✅ Now using the array
      user,
    });

    res.status(201).json({
      success: true,
      message: "Event created successfully",
      data: newEvent,
    });
  } catch (error) {
    console.error("Create Event Error:", error);
    res.status(500).json({
      success: false,
      message: "Error creating event",
      error: error.message,
    });
  }
};

// Get latest event
const getEvent = async (req, res) => {
  try {
    const latestEvent = await Event.findOne().sort({ date: 1 }).exec();
    res.status(200).json(latestEvent);
  } catch (error) {
    console.error("Error in getEvent controller:", error.message);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// Get upcoming events
const upcomingEvent = async (req, res) => {
  try {
    const upcomingEvents = await Event.find().sort({ date: 1 }).skip(1).limit(4).exec();
    res.status(200).json(upcomingEvents);
  } catch (error) {
    console.error("Error in upcomingEvent controller:", error.message);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// Get event detail
const detailEvent = async (req, res) => {
  try {
   
    const { id } = req.params; // ✅ get id from params
     console.log(id)
      if (!mongoose.Types.ObjectId.isValid(id)) {
           return res.status(400).json({ message: "Invalid ID format" });
         }
    const event = await Event.findById(id);

    if (!event) {
      return res.status(404).json({ message: "Event not found" });
    }

    res.status(200).json(event);
  } catch (error) {
    console.error("Error in detailEvent controller:", error.message);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};


module.exports = { createEvent, getEvent, upcomingEvent, detailEvent };
