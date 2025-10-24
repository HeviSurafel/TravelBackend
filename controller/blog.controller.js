const cloudinary = require("../middleware/cloudinary");
const Blog = require("../model/blog.model");
const Like = require("../model/like.model")
const Comment = require("../model/comment.blog")
const asyncHandler = require("express-async-handler");
const createBlog = asyncHandler(async (req, res) => {
  try {
    console.log("Incoming blog data:", req.body);

    let { title, content, featured, status, category, description, tags } = req.body;

    // ✅ Helper to safely parse JSON-like strings
    const parseIfString = (value) => {
      try {
        return typeof value === "string" ? JSON.parse(value) : value;
      } catch {
        return value;
      }
    };

    // ✅ Handle tags properly
    const handleTags = (tags) => {
      tags = parseIfString(tags);
      if (!tags) return [];

      if (Array.isArray(tags)) {
        return [...new Set(tags.map(tag => tag.trim().toLowerCase()))];
      }

      if (typeof tags === "string") {
        return [...new Set(tags.split(",").map(tag => tag.trim().toLowerCase()).filter(Boolean))];
      }

      return [];
    };

    // ✅ Upload images to Cloudinary
    let uploadedImages = [];

    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        const uploadResponse = await cloudinary.uploader.upload(file.path, {
          folder: "blogs",
        });
        uploadedImages.push(uploadResponse.secure_url);
      }
    } else if (req.body.images && Array.isArray(req.body.images)) {
      for (const image of req.body.images) {
        const uploadResponse = await cloudinary.uploader.upload(image, {
          folder: "blogs",
        });
        uploadedImages.push(uploadResponse.secure_url);
      }
    }

    // ✅ Auto-calculate read time (200 words/minute)

    const processedTags = handleTags(tags);
    console.log("Processed Tags:", processedTags);

    const blog = await Blog.create({
      title,
      content,
      featured: featured === "true" || featured === true,
      status: status ? status.toLowerCase() : "draft",
      category,
      description,
      tags: processedTags,
      image: uploadedImages,
      user: req.user._id,
    });

    res.status(201).json(blog);
  } catch (error) {
    console.log(error)
    console.error("Error in createBlog controller:", error.message);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});


const getBlogs = async (req, res) => {
  try {
    const blogs = await Blog.find({}).populate({
      path: "user",
      select: "name pic",
      options: { strictPopulate: false },
    });
    res.status(201).json(blogs)
  } catch (error) {
    console.log("error in getBlogs controller", error.message);
    res.status(500).json({ message: "server error", error: error.message })
  }
}
const deleteBlog = asyncHandler(async (req, res) => {
  try {
    const id = req.params.id;
    const blog = await Blog.findByIdAndDelete(id);

    if (!blog) {
      return res.status(404).json({ message: "Blog not found" });
    }

    // blog.image can be an array or a single string -> normalize to array
    const images = Array.isArray(blog.image)
      ? blog.image
      : blog.image
      ? [blog.image]
      : [];

    if (images.length > 0) {
      // Delete all images in parallel
      await Promise.all(
        images.map(async (url) => {
          try {
            if (!url || typeof url !== "string") return;

            // Try to extract public_id robustly.
            // Strategy:
            // 1. Find '/blogs/' in the URL (your upload folder); slice after it.
            // 2. Remove query params, versioning and file extension.
            // 3. Prepend folder name if necessary to form the public_id expected by Cloudinary.

            const folderMarker = "/blogs/";
            let publicId = null;

            const cleanUrl = url.split(/[?#]/)[0]; // remove query string or hash
            const markerIndex = cleanUrl.indexOf(folderMarker);

            if (markerIndex !== -1) {
              // slice the part after '/blogs/'
              let afterFolder = cleanUrl.substring(markerIndex + folderMarker.length);
              // remove file extension if present: 'my-image.jpg' -> 'my-image'
              afterFolder = afterFolder.split(".").slice(0, -1).join(".");
              // if your folder is 'blogs', public_id will be 'blogs/<afterFolder>'
              publicId = `blogs/${afterFolder}`;
            } else {
              // fallback: take last path segment without extension
              const parts = cleanUrl.split("/");
              let last = parts.pop();
              last = last.split(".").slice(0, -1).join(".");
              publicId = last;
            }

            // Destroy image using the derived publicId
            if (publicId) {
              await cloudinary.uploader.destroy(publicId, { resource_type: "image" });
              console.log("Deleted image from Cloudinary:", publicId);
            }
          } catch (err) {
            // Log but don't fail the whole deletion if Cloudinary call fails
            console.error("Error deleting image from Cloudinary:", err.message || err);
          }
        })
      );
    }

    return res.json({ message: "Blog deleted successfully" });
  } catch (error) {
    console.error("Error in deleteBlog controller:", error.message || error);
    return res.status(500).json({ message: "Server error", error: error.message || error });
  }
});
const detailBlog = async (req, res) => {
  try {
    const id = req.params.id.replace(":", "")
    const blog = await Blog.findById(id).populate("user", "name");
    if (!blog) {
      return res.status(404).json({ message: "blog not found" })
    }
    res.status(201).json(blog)
  } catch (error) {
    console.log("error in detailBlog controller", error.message);
    res.status(500).json({ message: "server error", error: error.message })
  }
}
const like = async (req, res) => {
  try {
    const { userId, blogId, itemType } = req.body;

    const blog = await Blog.findById(blogId);
    if (!blog) {
      return res.status(404).json({ message: "Blog not found" });
    }

    // Check if the user has already liked this blog
    const existingLike = await Like.findOne({ user: userId, blog: blogId });

    if (existingLike) {
      // If already liked, remove the like and decrement the like count
      await Like.findByIdAndDelete(existingLike._id);

      blog.likeCount = Math.max(0, blog.likeCount - 1); // Ensure likeCount doesn't go below 0
      await blog.save();

      return res.status(200).json({ message: "Blog unliked", likeCount: blog.likeCount });
    } else {
      // If not liked, add a like and increment the like count
      const newLike = await Like.create({
        user: userId,
        blog: blogId,
        itemType: "blog",
      });

      blog.likeCount += 1;
      await blog.save();

      return res.status(200).json({ message: "Blog liked", likeCount: blog.likeCount });
    }

  } catch (error) {
    // Handle errors
    console.error("Error liking the blog:", error);
    res.status(500).json({ message: "Something went wrong", error: error.message });
  }
};
const createComment = async (req, res) => {
  try {
    const { content, user, blog } = req.body;

    // Create the new comment
    const newComment = await Comment.create({
      content,
      user,
      blog,
    });

    // Find the blog associated with the comment
    const blogDoc = await Blog.findById(blog);
    if (!blogDoc) {
      return res.status(404).json({ message: "Blog not found" });
    }

    // Increment the comment count for the blog
    blogDoc.commentCount += 1;
    await blogDoc.save();

    res.status(201).json({ message: "Comment added", newComment, commentCount: blogDoc.commentCount });
  } catch (error) {
    console.error("Error creating comment:", error);
    res.status(500).json({ message: "Something went wrong", error: error.message });
  }
};

const getComment = async (req, res) => {
  try {
    const { id } = req.params;
    const comments = await Comment.find({ blog: id })
      .populate("user", "name pic") // Adjust fields as needed
    res.status(200).json(comments);
  } catch (error) {
    console.log(error)
    res.status(500).json({ message: "Error fetching comments", error });
  }
}
const updateComment = async (req, res) => {
  try {
    const { id } = req.params;
    const { content } = req.body;
    const updatedComment = await Comment.findByIdAndUpdate(
      id,
      { content },
      { new: true }
    );
    if (!updatedComment) {
      return res.status(404).json({ message: "Comment not found" });
    }
    res.status(200).json(updatedComment);
  } catch (error) {
    res.status(500).json({ message: "Error updating comment", error });
  }
}
const deleteComment = async (req, res) => {
  try {
    const { id } = req.params;
    const deletedComment = await Comment.findByIdAndDelete(id);
    if (!deletedComment) {
      return res.status(404).json({ message: "Comment not found" });
    }
    res.status(200).json({ message: "Comment deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: "Error deleting comment", error });
  }
}
const likeComment = async (req, res) => {
  try {
    const { id } = req.params;
    const { userId } = req.body;
    const comment = await Comment.findById(id);
    if (!comment) {
      return res.status(404).json({ message: "Comment not found" });
    }
    if (!comment.likes.includes(userId)) {
      comment.likes.push(userId);
      comment.likeCount += 1;
      await comment.save();
    }
    res.status(200).json(comment);
  } catch (error) {
    res.status(500).json({ message: "Error liking comment", error });
  }
}
const unlikeComment = async (req, res) => {
  try {
    const { id } = req.params;
    const { userId } = req.body;
    const comment = await Comment.findById(id);
    if (!comment) {
      return res.status(404).json({ message: "Comment not found" });
    }
    if (comment.likes.includes(userId)) {
      comment.likes = comment.likes.filter((like) => like.toString() !== userId);
      comment.likeCount -= 1;
      await comment.save();
    }
    res.status(200).json(comment);
  } catch (error) {
    res.status(500).json({ message: "Error unliking comment", error });
  }
}
module.exports = { createBlog, deleteBlog, getBlogs, detailBlog, like, createComment, getComment }
