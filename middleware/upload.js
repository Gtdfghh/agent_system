const multer = require("multer");
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const cloudinary = require("../config/cloudinary");

// ================= CLOUDINARY STORAGE CONFIG =================

// Configure Cloudinary storage for uploaded files
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: async (req, file) => ({
    folder: "agent_documents",          // Folder in Cloudinary
    resource_type: "raw",               // Supports all file types (PDF, DOC, images)
    public_id: Date.now() + "-" + file.originalname // Unique file name
  })
});

// ================= FILE TYPE VALIDATION =================

// Allow only specific file types
const fileFilter = (req, file, cb) => {
  const allowedTypes = [
    "application/pdf",
    "image/jpeg",
    "image/png",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ];

  // Accept file if type is allowed
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    // Reject file with custom error
    cb(new Error("Invalid file type. Only PDF, JPEG, PNG, DOC, DOCX allowed"), false);
  }
};

// ================= MULTER CONFIGURATION =================

// Configure multer middleware
const upload = multer({
  storage: storage,                 // Use Cloudinary storage
  fileFilter: fileFilter,           // Apply file type validation
  limits: { fileSize: 5 * 1024 * 1024 } // Max file size: 5MB
});

module.exports = upload;
