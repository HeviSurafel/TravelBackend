const express=require("express");
const router=express.Router();
const { createEvent, getEvent, upcomingEvent, detailEvent}=require("../controller/event.controller")
const {protectRoute,adminRoute}=require("../middleware/protect.route");
const {
  upload,
  uploadImages,
  handleFileUploadErrors
} = require("../config/MulterConfig");
router.post("/create",protectRoute,adminRoute, uploadImages.array("images", 5),
  handleFileUploadErrors, createEvent)
router.get("/getevent", getEvent)
router.get("/upcommingevent", upcomingEvent)
router.get("/detail/:id", detailEvent)
// router.delete("/deletpackages/:id",protectRoute,adminRoute, deleteEvent)
module.exports = router;