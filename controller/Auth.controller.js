const crypto = require("crypto");
const { OAuth2Client } = require("google-auth-library");
const jwt = require("jsonwebtoken");
const User = require("../model/user.model");
const redis = require("../config/redis");
const transporter = require("../config/nodemailer");
const asyncHandler = require("express-async-handler");
const Payment = require("../model/Payment");
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// Generate tokens
const generateToken = async (userId) => {
  const accessToken = jwt.sign({ userId }, process.env.accessTokenSecret, {
    expiresIn: "15m",
  });
  const refreshToken = jwt.sign({ userId }, process.env.refreshTokenSecret, {
    expiresIn: "7d",
  });
  return { accessToken, refreshToken };
};

// Store refresh token in Redis
const storeRefreshToken = async (userId, refreshToken) => {
  await redis.set(
    `refresh_token:${userId}`,
    refreshToken,
    "EX",
    7 * 24 * 60 * 60
  );
};

// Store tokens in cookies
const storeCookies = (res, accessToken, refreshToken) => {
  res.cookie("accessToken", accessToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: 15 * 60 * 1000,
  });
  res.cookie("refreshToken", refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
};

// ===== Google Login =====
const googleLogin = async (req, res) => {
  try {
    const { idToken } = req.body;
    if (!idToken) {
      return res.status(400).json({
        success: false,
        message: "Google ID token is required",
        data: null
      });
    }

    // Verify token
    const ticket = await googleClient.verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();

    if (!payload || !payload.email) {
      return res.status(401).json({
        success: false,
        message: "Invalid Google token",
        data: null
      });
    }

    // Find existing user
    let user = await User.findOne({
      $or: [{ googleId: payload.sub }, { email: payload.email }],
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User doesn't exist, please signup first",
        data: null
      });
    }


    // Update user with Google details if missing
    const updates = {};
    if (!user.googleId) updates.googleId = payload.sub;
    if (!user.isVerified) updates.isVerified = true;
    if (!user.profileImage && payload.picture) updates.profileImage = payload.picture;

    if (Object.keys(updates).length > 0) {
      user = await User.findByIdAndUpdate(user._id, updates, { new: true });
    }

    // Generate tokens
    const { accessToken, refreshToken } = await generateToken(user._id);
    await storeRefreshToken(user._id, refreshToken);

    return res.json({
      success: true,
      message: "Google authentication successful",
      data: {
        user: {
          id: user._id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
          badge: user.badge,
          profileImage: user.profileImage,
          totalDonated: user.totalDonated,
        },
        accessToken,
        refreshToken,
      }
    });
  } catch (error) {
    console.error("Google auth error:", error);
    res.status(500).json({
      success: false,
      message: "Authentication failed. Please try again.",
      data: null
    });
  }
};

// ===== Complete Profile for Google Users =====
const completeGoogleProfile = async (req, res) => {
  try {
    const userId = req.user.id;
    const { phoneNumber, address, city, state, zipCode } = req.body;

    if (!phoneNumber || !address || !city || !state || !zipCode) {
      return res.status(400).json({
        success: false,
        message: "All required fields must be provided",
        data: null
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
        data: null
      });
    }

    if (!user.needsProfileCompletion) {
      return res.status(400).json({
        success: false,
        message: "Profile already completed",
        data: null
      });
    }

    user.phoneNumber = phoneNumber;
    user.address = address;
    user.city = city;
    user.state = state;
    user.zipCode = zipCode;
    user.needsProfileCompletion = false;
    await user.save();

    res.json({
      success: true,
      message: "Profile completed successfully",
      data: { user }
    });
  } catch (error) {
    console.error("Profile completion error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to complete profile",
      data: null
    });
  }
};
const initiateSignup = asyncHandler(async (req, res) => {
  const { email, firstName, lastName, phoneNumber, address, password } = req.body;
  try {
    const userExist = await User.findOne({ email });
    if (userExist) {
      return res.status(400).json({
        success: false,
        message: "User already exists",
        data: null,
      });
    }

    // Generate a 6-digit verification code
    const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();

    // Send verification code via email
    const mailOptions = {
      to: email,
      from: process.env.EMAIL_USER || "noreply@yourapp.com",
      subject: "Verify your email - Signup Code",
      text: `Your verification code is: ${verificationCode}`,
    };

    await transporter.sendMail(mailOptions);

    // Save user data temporarily in Redis (stringified JSON)
    const userTempData = {
      firstName,
      lastName,
      phoneNumber,
      address,
      password,
      code: verificationCode,
    };

    // ✅ FIXED Redis set with expiry (works in both ioredis and node-redis)
    await redis.set(
      `verification_code:${email}`,
      JSON.stringify(userTempData),
      "EX",
      5 * 60 // expires in 5 minutes
    );

    res.status(200).json({
      success: true,
      message: "Verification code sent successfully",
      data: { email },
    });
  } catch (error) {
    console.error("Signup Error:", error);
    res.status(500).json({
      success: false,
      message: "Something went wrong while initiating signup",
      data: null,
    });
  }
});

const verifySignup = asyncHandler(async (req, res) => {
  const { otp, email } = req.body;

  try {
    // Retrieve stored data
    const storedData = await redis.get(`verification_code:${email}`);

    if (!storedData) {
      return res.status(400).json({
        success: false,
        message: "Verification code expired or not found",
        data: null,
      });
    }

    const parsedData = JSON.parse(storedData);
    if (parsedData.code !== otp.toString()) {
      return res.status(400).json({
        success: false,
        message: "Invalid verification code",
        data: null,
      });
    }

    const { firstName, lastName, phoneNumber, address, password } = parsedData;

    // Create the new user
    const user = await User.create({
      email,
      firstName,
      lastName,
      phoneNumber,
      address,
      password,
    });

    // Clean up Redis entry after successful signup
    await redis.del(`verification_code:${email}`);

    // OPTIONAL: Associate past donations or actions
    await Payment.updateMany(
      { email: email, userId: null },
      { $set: { userId: user._id } }
    );

    const donations = await Payment.aggregate([
      { $match: { userId: user._id, status: "successful" } },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]);

    const totalDonated = donations.length > 0 ? donations[0].total : 0;

    await User.findByIdAndUpdate(user._id, {
      totalDonated,
      donationCount: donations.length,
      lastDonationDate: donations.length > 0 ? donations[0].createdAt : null,
    });

    // Generate tokens and set cookies
    const { accessToken, refreshToken } = await generateToken(user._id);
    storeCookies(res, accessToken, refreshToken);
    await storeRefreshToken(user._id, refreshToken);

    res.status(201).json({
      success: true,
      message: "User verified and account created successfully",
      data: {
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        role: user.role,
        totalDonated,
      },
    });
  } catch (error) {
    console.error("Verification Error:", error);
    res.status(500).json({
      success: false,
      message: "Something went wrong during verification",
      data: null,
    });
  }
});



const resendOtp = asyncHandler(async (req, res) => {
  const { email } = req.body;
  try {
    // Check whether OTP is already sent
    const storedCode = await redis.get(`verification_code:${email}`);
    if (storedCode) {
      return res.status(400).json({
        success: false,
        message: "OTP already sent",
        data: null
      });
    }

    // Generate a 6-digit verification code
    const verificationCode = Math.floor(100000 + Math.random() * 900000);

    // Send the verification code to the user's email
    const mailOptions = {
      to: email,
      from: "Worku Furniture",
      subject: "Verification Code",
      text: `Your verification code is: ${verificationCode}`,
    };
    await transporter.sendMail(mailOptions);

    // SAVE THE verification code in redis
    await redis.set(
      `verification_code:${email}`,
      verificationCode,
      "EX",
      5 * 60
    );

    res.status(200).json({
      success: true,
      message: "Verification code sent successfully",
      data: { email }
    });
  } catch (error) {
    console.error("Signup Error:", error);
    res.status(500).json({
      success: false,
      message: "Something went wrong",
      data: null
    });
  }
});

// Login
const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  try {
    // Find the user by email
    const user = await User.findOne({ email });

    // Check if the user exists
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
        data: null
      });
    }

    // Check if the user's account is suspended
    if (user.status === "suspended") {
      return res.status(403).json({
        success: false,
        message: "Your account has been suspended. Contact the admin.",
        data: null
      });
    }

    // Compare the entered password with the stored one
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(400).json({
        success: false,
        message: "Invalid credentials",
        data: null
      });
    }

    // Generate tokens (access and refresh)
    const { accessToken, refreshToken } = await generateToken(user._id);

    // Store tokens in cookies
    storeCookies(res, accessToken, refreshToken);

    // Store the refresh token in the database
    await storeRefreshToken(user._id, refreshToken);

    // Respond with user data and success message
    res.status(200).json({
      success: true,
      message: "User logged in successfully",
      data: {
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        phone: user.phoneNumber,
        email: user.email,
        role: user.role,
        dateOfBirth: user.dateOfBirth,
        address: user.address,
        accessToken,
        refreshToken
      }
    });
  } catch (error) {
    console.error("Login Error:", error);
    res.status(500).json({
      success: false,
      message: "Something went wrong",
      data: null
    });
  }
});

// Logout
const logout = asyncHandler(async (req, res) => {
  const refreshToken = req.cookies.refreshToken;
  try {
    if (refreshToken) {
      const decode = jwt.verify(refreshToken, process.env.refreshTokenSecret);
      await redis.del(`refresh_token:${decode.userId}`);
    }
    res.clearCookie("accessToken");
    res.clearCookie("refreshToken");
    res.status(200).json({
      success: true,
      message: "Logout successful",
      data: null
    });
  } catch (error) {
    console.error("Logout Error:", error);
    res.status(500).json({
      success: false,
      message: "Something went wrong",
      data: null
    });
  }
});

// Refresh Token
const refreshToken = asyncHandler(async (req, res) => {
  const refreshToken = req.cookies.refreshToken;
  try {
    if (!refreshToken) {
      return res.status(401).json({
        success: false,
        message: "No token found",
        data: null
      });
    }

    const decoded = jwt.verify(refreshToken, "refreshTokenSecret");
    const storedToken = await redis.get(`refresh_token:${decoded.userId}`);

    if (refreshToken !== storedToken) {
      return res.status(401).json({
        success: false,
        message: "Invalid refresh token",
        data: null
      });
    }

    const { accessToken } = await generateToken(decoded.userId);
    res.cookie("accessToken", accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 15 * 60 * 1000,
    });

    res.status(200).json({
      success: true,
      message: "Access token refreshed",
      data: { accessToken }
    });
  } catch (error) {
    console.error("Refresh Token Error:", error);
    res.status(500).json({
      success: false,
      message: "Something went wrong",
      data: null
    });
  }
});

// Get Profile
const getProfile = asyncHandler(async (req, res) => {
  try {
    res.json({
      success: true,
      message: "Profile retrieved successfully",
      data: req.user
    });
  } catch (error) {
    console.error("Get Profile Error:", error);
    res.status(500).json({
      success: false,
      message: "Something went wrong",
      data: null
    });
  }
});

// Get All Users (Admin Only)
const getAllUser = asyncHandler(async (req, res) => {
  try {
    const users = await User.find({}).select(
      "-password -resetPasswordToken -resetPasswordExpires"
    );
    res.status(200).json({
      success: true,
      message: "Users retrieved successfully",
      data: users
    });
  } catch (error) {
    console.error("Get All Users Error:", error);
    res.status(500).json({
      success: false,
      message: "Something went wrong",
      data: null
    });
  }
});

const updatePassword = asyncHandler(async (req, res) => {
  const { oldPassword, newpassword, email } = req.body;
  try {
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
        data: null
      });
    }

    const isMatch = await user.comparePassword(oldPassword);
    if (!isMatch) {
      return res.status(400).json({
        success: false,
        message: "Invalid credentials",
        data: null
      });
    }

    user.password = newpassword;
    await user.save();

    res.status(200).json({
      success: true,
      message: "Password updated successfully",
      data: null
    });
  } catch (error) {
    console.error("Update Password Error:", error);
    res.status(500).json({
      success: false,
      message: "Something went wrong",
      data: null
    });
  }
});

// Reset Password
const resetPassword = asyncHandler(async (req, res) => {
  console.log("req.params", req.body);

  const { token, password } = req.body;
  try {
    const user = await User.findOne({
      resetPasswordToken: token,
      resetPasswordExpires: { $gt: Date.now() },
    });

    if (!user) {
      return res.status(400).json({
        success: false,
        message: "Invalid or expired token",
        data: null
      });
    }

    user.password = password;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();

    res.status(200).json({
      success: true,
      message: "Password reset successfully",
      data: null
    });
  } catch (error) {
    console.error("Reset Password Error:", error);
    res.status(500).json({
      success: false,
      message: "Something went wrong",
      data: null
    });
  }
});

const updateProfile = asyncHandler(async (req, res) => {
  const { email } = req.user;
  const { address, phone } = req.body;
  try {
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
        data: null
      });
    }

    user.address = address || user.address;
    user.phoneNumber = phone || user.phoneNumber;
    await user.save();

    res.status(200).json({
      success: true,
      message: "Profile updated successfully",
      data: { user }
    });
  } catch (error) {
    console.error("Update Profile Error:", error);
    res.status(500).json({
      success: false,
      message: "Something went wrong",
      data: null
    });
  }
});

// deleteUser, updateUserRole
const deleteUser = asyncHandler(async (req, res) => {
  const { id } = req.params;
  try {
    const user = await User.findByIdAndDelete(id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
        data: null
      });
    }

    res.status(200).json({
      success: true,
      message: "User deleted successfully",
      data: null
    });
  } catch (error) {
    console.error("Delete User Error:", error);
    res.status(500).json({
      success: false,
      message: "Something went wrong",
      data: null
    });
  }
});

const updateUserRole = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { role } = req.body;
  try {
    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
        data: null
      });
    }

    user.role = role;
    await user.save();

    res.status(200).json({
      success: true,
      message: "User role updated successfully",
      data: { user }
    });
  } catch (error) {
    console.error("Update User Role Error:", error);
    res.status(500).json({
      success: false,
      message: "Something went wrong",
      data: null
    });
  }
});

const getAllUsers = asyncHandler(async (req, res) => {
  try {
    const users = await User.find({}).select(
      "-password -resetPasswordToken -resetPasswordExpires"
    );

    res.status(200).json({
      success: true,
      message: "Users retrieved successfully",
      data: users
    });
  } catch (error) {
    console.error("Get All Users Error:", error);
    res.status(500).json({
      success: false,
      message: "Something went wrong",
      data: null
    });
  }
});

const getDonationHistory = asyncHandler(async (req, res) => {
  try {
    if (!req.user || !req.user._id) {
      return res.status(401).json({
        success: false,
        message: 'Not authorized',
        data: null
      });
    }

    // Get all successful donations for the user
    const donations = await Payment.find({
      userId: req.user._id,
      status: 'successful'
    }).sort({ createdAt: -1 });

    // Calculate summary statistics
    const summary = await Payment.aggregate([
      {
        $match: {
          userId: req.user._id,
          status: 'successful'
        }
      },
      {
        $group: {
          _id: null,
          totalDonated: { $sum: '$amount' },
          donationCount: { $sum: 1 },
          lastDonationDate: { $max: '$createdAt' }
        }
      },
      {
        $project: {
          _id: 0,
          totalDonated: 1,
          donationCount: 1,
          lastDonationDate: 1
        }
      }
    ]);

    // Extract the summary results (will be empty array if no donations)
    const result = summary.length > 0 ? summary[0] : {
      totalDonated: 0,
      donationCount: 0,
      lastDonationDate: null
    };

    res.json({
      success: true,
      message: "Donation history retrieved successfully",
      data: {
        donations,
        totalDonated: result.totalDonated,
        donationCount: result.donationCount,
        lastDonationDate: result.lastDonationDate
      }
    });

  } catch (error) {
    console.error('Get Donation History Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch donation history',
      data: null
    });
  }
});

const getDonationsByEmail = asyncHandler(async (req, res) => {
  const { email } = req.params;

  try {
    const donations = await Payment.find({ email }).sort({ createdAt: -1 });
    const summary = await Payment.aggregate([
      { $match: { email, status: "successful" } },
      {
        $group: {
          _id: null,
          total: { $sum: "$amount" },
          count: { $sum: 1 },
          lastDate: { $max: "$createdAt" },
        },
      },
    ]);

    res.json({
      success: true,
      message: "Donations retrieved successfully",
      data: {
        donations,
        totalDonated: summary.length > 0 ? summary[0].total : 0,
        donationCount: summary.length > 0 ? summary[0].count : 0,
        lastDonationDate: summary.length > 0 ? summary[0].lastDate : null,
      }
    });
  } catch (error) {
    console.error("Get Donations by Email Error:", error);
    res.status(500).json({
      success: false,
      message: "Something went wrong",
      data: null
    });
  }
});

const requestPasswordReset = asyncHandler(async (req, res) => {
  const { email } = req.body;
  console.log("Request Password Reset for:", email, req.body);

  try {
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
        data: null
      });
    }

    // Generate a 6-digit verification code
    const verificationCode = Math.floor(100000 + Math.random() * 900000);

    // Send the verification code to the user's email
    const mailOptions = {
      to: email,
      from: "your-email@example.com",
      subject: "Password Reset OTP",
      text: `Your password reset OTP is: ${verificationCode}`,
    };

    await transporter.sendMail(mailOptions);

    // Save the verification code in redis with expiration (5 minutes)
    await redis.set(
      `password_reset:${email}`,
      verificationCode,
      "EX",
      5 * 60
    );

    res.status(200).json({
      success: true,
      message: "OTP sent to your email",
      data: {
        email,
        purpose: "password_reset"
      }
    });
  } catch (error) {
    console.error("Password Reset Error:", error);
    res.status(500).json({
      success: false,
      message: "Something went wrong",
      data: null
    });
  }
});

const verifyPasswordResetOtp = asyncHandler(async (req, res) => {
  const { email, otp } = req.body;
  try {
    const storedCode = await redis.get(`password_reset:${email}`);

    if (!storedCode || storedCode !== otp.toString()) {
      return res.status(400).json({
        success: false,
        message: "Invalid or expired OTP",
        data: null
      });
    }

    // Delete the OTP from redis after successful verification
    await redis.del(`password_reset:${email}`);

    res.status(200).json({
      success: true,
      message: "OTP verified successfully",
      data: { email }
    });
  } catch (error) {
    console.error("OTP Verification Error:", error);
    res.status(500).json({
      success: false,
      message: "Something went wrong",
      data: null
    });
  }
});

const completePasswordReset = asyncHandler(async (req, res) => {
  const { email, otp, newPassword } = req.body;
  try {
    // Verify the OTP again (in case the user took too long)
    const storedCode = await redis.get(`password_reset:${email}`);
    if (storedCode && storedCode !== otp.toString()) {
      return res.status(400).json({
        success: false,
        message: "Invalid OTP",
        data: null
      });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
        data: null
      });
    }

    // Update the password
    user.password = newPassword;
    await user.save();

    // Clear any existing OTP
    await redis.del(`password_reset:${email}`);

    res.status(200).json({
      success: true,
      message: "Password reset successfully",
      data: null
    });
  } catch (error) {
    console.error("Password Reset Error:", error);
    res.status(500).json({
      success: false,
      message: "Something went wrong",
      data: null
    });
  }
});

module.exports = {
  requestPasswordReset,
  verifyPasswordResetOtp,
  completePasswordReset,
  login,
  logout,
  updateProfile,
  refreshToken,
  getProfile,
  getAllUser,
  resetPassword,
  updatePassword,
  initiateSignup,
  verifySignup,
  resendOtp,
  deleteUser,
  updateUserRole,
  getAllUsers,
  getDonationHistory,
  getDonationsByEmail,
  googleLogin,
  completeGoogleProfile,
};