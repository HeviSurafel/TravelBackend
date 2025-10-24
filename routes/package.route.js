const express = require("express");
const router = express.Router();
const {
  createPackage,
  getPackages,
  deletePackage,
  detailPackage,
  searchByCatagory,
  getRecommendedPackages
} = require("../controller/package.controller");

const { adminRoute, protectRoute } = require("../middleware/protect.route");
const {
  upload,
  uploadImages,
  handleFileUploadErrors
} = require("../config/MulterConfig");

// ✅ Create a new travel package (Admin only)
router.post(
  "/createpackage",
  protectRoute,
  adminRoute,
  uploadImages.array("images", 5),
  handleFileUploadErrors,
  createPackage
);

// ✅ Get all packages
router.get("/getpackages", getPackages);

// ✅ Get recommended packages
router.get("/recommendedpackage", getRecommendedPackages);

// ✅ Get package detail by ID
router.get("/detail/:id", detailPackage);

// ✅ Delete a package (Admin only)
router.delete(
  "/deletepackage/:id",
  protectRoute,
  adminRoute,
  deletePackage
);

// ✅ Search by category
router.get("/searchbycatagory/:id", searchByCatagory);

module.exports = router;
