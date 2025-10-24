const express = require("express");
const router = express.Router();
const { protectRoute, adminRoute } = require("../middleware/protect.route");
const {
  login,
  googleLogin, 
  completeGoogleProfile,
  initiateSignup,
  verifySignup,
  resendOtp,
  logout,
  refreshToken,
  getProfile,
  updateProfile,
  updatePassword,
  getAllUser,
  deleteUser,
  updateUserRole,
  requestPasswordReset,
  verifyPasswordResetOtp,
  completePasswordReset,
} = require("../controller/Auth.controller");


router.post("/signup/initiate", initiateSignup);
router.post("/signup/verify", verifySignup);
router.put("/signup/resend-otp", resendOtp);

router.post("/login", login);
router.post("/logout", logout);
router.get("/refresh-token", refreshToken);
router.get("/profile", protectRoute, getProfile);
router.put("/updateprofile", protectRoute, updateProfile);
router.put("/updatepassword", protectRoute, updatePassword);
router.post("/google", googleLogin);
// Complete profile for Google users
router.post("/google/complete-profile", protectRoute, completeGoogleProfile);

// // Admin routes
router.get("/getallusers", protectRoute, adminRoute, getAllUser);
router.delete("/deleteuser/:id", protectRoute, adminRoute, deleteUser);
router.put("/updateuserrole/:id", protectRoute, adminRoute, updateUserRole);

// Password reset
router.post("/password/reset/request", requestPasswordReset);
router.post("/password/reset/verify", verifyPasswordResetOtp);
router.post("/password/reset/complete", completePasswordReset);

module.exports = router;
