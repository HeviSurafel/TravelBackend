const multer = require("multer");
const path = require("path");
const fs = require('fs');

// Storage configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // Create separate folders for images and PDFs
    let folder = 'uploads/';
    if (file.mimetype === 'application/pdf') {
      folder += 'pdfs/';
    } else {
      folder += 'images/';
    }
    
    // Ensure directory exists
    fs.mkdirSync(path.join(__dirname, `../${folder}`), { recursive: true });
    cb(null, path.join(__dirname, `../${folder}`));
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  },
});

// File filter (allow images and PDFs)
const fileFilter = (req, file, cb) => {
  const allowedTypes = [
    'image/jpeg', 
    'image/png', 
    'image/jpg',
    'application/pdf' // Add PDF MIME type
  ];
  
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error("Only image (JPG, PNG) and PDF files are allowed"), false);
  }
};

// Upload middleware
const upload = multer({
  storage,
  fileFilter,
  limits: { 
    fileSize: 50 * 1024 * 1024, // 50MB max file size
    files: 5 // Maximum of 5 files
  }
});

// Specific middleware for different file types
const uploadImages = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/jpg'];
    allowed.includes(file.mimetype) 
      ? cb(null, true) 
      : cb(new Error("Only image files are allowed"), false);
  },
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB for images
});

const uploadPDFs = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const folder = path.join(__dirname, '../uploads/pdfs/');
      fs.mkdirSync(folder, { recursive: true });
      cb(null, folder);
    },
    filename: (req, file, cb) => {
      cb(null, `${Date.now()}-${file.originalname}`);
    }
  }),
  fileFilter: (req, file, cb) => {
    file.mimetype === 'application/pdf'
      ? cb(null, true)
      : cb(new Error("Only PDF files are allowed"), false);
  },
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB for PDFs
});

module.exports = {
  upload,          // General upload (images + PDFs)
  uploadImages,    // Only images
  uploadPDFs,      // Only PDFs
  handleFileUploadErrors: (err, req, res, next) => {
    if (err instanceof multer.MulterError) {
      return res.status(400).json({ 
        success: false,
        message: err.code === 'LIMIT_FILE_SIZE' 
          ? 'File too large' 
          : 'File upload error'
      });
    } else if (err) {
      return res.status(400).json({ 
        success: false,
        message: err.message 
      });
    }
    next();
  }
};