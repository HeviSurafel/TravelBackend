const express = require("express");
const router = express.Router();
const {createBlog,getBlogs,deleteBlog,detailBlog,like,createComment,getComment}=require("../controller/blog.controller")
const {protectRoute,adminRoute}=require("../middleware/protect.route")
const {
  upload,
  uploadImages,
  handleFileUploadErrors
} = require("../config/MulterConfig");
router.post("/create",protectRoute,adminRoute,uploadImages.array("images",5), handleFileUploadErrors, createBlog)
router.post("/like/:id",protectRoute, like)
router.get("/getblogs", getBlogs)
router.get("/detail/:id", detailBlog)
router.get("/detail/comment/:id",getComment)
router.post("/detail/create/comment/:id",protectRoute, createComment)
router.delete("/deleteBlog/:id",protectRoute,adminRoute, deleteBlog)
module.exports = router;