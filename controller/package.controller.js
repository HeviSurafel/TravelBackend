const cloudinary = require("../middleware/cloudinary");
const Package = require("../model/package.model");
const asyncHandler=require("express-async-handler");
const mongoose = require("mongoose");
const createPackage = asyncHandler(async (req, res) => {
  try {
    console.log("Incoming package data:", req.body);

    let {
      name,
      title,
      description,
      destination,
      duration,
      price,
      numberOfPeople,
      inclusions,
      exclusions,
      requirements,
      highlights,
      category,
      dayItinerary,
    } = req.body;

    // Handle title field consistency
    if (!title && name) title = name;

    // Parse JSON strings if they come as stringified arrays
    const parseIfString = (value) => {
      try {
        return typeof value === "string" ? JSON.parse(value) : value;
      } catch {
        return value;
      }
    };

    inclusions = parseIfString(inclusions);
    exclusions = parseIfString(exclusions);
    requirements = parseIfString(requirements);
    highlights = parseIfString(highlights);
    dayItinerary = parseIfString(dayItinerary);

    // Handle image uploads
    let uploadedImages = [];

    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        const uploadResponse = await cloudinary.uploader.upload(file.path, {
          folder: "packages",
        });
        uploadedImages.push(uploadResponse.secure_url);
      }
    } else if (req.body.images && Array.isArray(req.body.images)) {
      for (const image of req.body.images) {
        const uploadResponse = await cloudinary.uploader.upload(image, {
          folder: "packages",
        });
        uploadedImages.push(uploadResponse.secure_url);
      }
    }

    const newPackage = await Package.create({
      title,
      description,
      destination,
      duration,
      price,
      numberOfPeople,
      inclusions,
      exclusions,
      requirements,
      highlights,
      category,
      dayItinerary,
      images: uploadedImages,
    });

    res.status(201).json(newPackage);
  } catch (error) {
    console.log(error)
    console.error("Error in createPackage controller:", error.message);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

const getPackages = asyncHandler(async (req, res) => {
  try {
    const packages = await Package.find({});
    res.json(packages);
  } catch (error) {
    console.log("error in getPackages controller", error.message);
    res.status(500).json({ message: "server error", error: error.message });
  }
});
const deletePackage =asyncHandler(async (req, res) => {
  try {
    const id = req.params.id;
    const package = await Package.findByIdAndDelete(id);
    if (!package) {
      return res.status(404).json({ message: "package not found" });
    }
    if (package.image) {
      const publicId = package.image.split("/").pop().split(".")[0];
      try {
        await cloudinary.uploader.destroy(`packages/${publicId}`);
        console.log("deleted image from cloduinary");
      } catch (error) {
        console.log("error deleting image from cloduinary", error);
      }
    }
    await Package.findByIdAndDelete(id);
    res.json({ message: "package deleted successfully" });
  } catch (error) {
    console.log("error in deletePackage controller", error.message);
    res.status(500).json({ message: "server error", error: error.message });
  }
});
const detailPackage = asyncHandler(async (req, res) => {
  try {
    const id = req.params.id;
    console.log("ID RECEIVED:", id, "Type:", typeof id);

    // Validate if it's a valid ObjectId
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid ID format" });
    }

    const packageData = await Package.findById(id);
    if (!packageData) {
      return res.status(404).json({ message: "Package not found" });
    }

    res.json(packageData);
  } catch (error) {
    console.log("Error in detailPackage controller", error.message);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

const searchByCatagory = asyncHandler(async (req, res) => {
  try {
    const packages = await Package.find({ category: req.params.category });
    res.json(packages);
  } catch (error) {
    console.log("error in searchByCatagory controller", error.message);
    res.status(500).json({ message: "server error", error: error.message });
  }
});
const getRecommendedPackages = asyncHandler(async (req, res) => {
  try {
    const packages = await Package.aggregate([
      {
        $sample: { size: 4 },
      },
      {
        $project: {
          _id: 1,
          title: 1,
          description: 1,
          image: 1,
          price: 1,
        },
      },
    ]);
    res.json(packages);
  } catch (error) {
    console.log("error in getRecommendedPackages controller", error.message);
    res.status(500).json({ message: "server error", error: error.message });
  }
});

module.exports = {
  createPackage,
  getPackages,
  deletePackage,
  detailPackage,
  searchByCatagory,
  getRecommendedPackages,
};
