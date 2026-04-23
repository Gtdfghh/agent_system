const cloudinary = require("cloudinary").v2;
const logger = require("../utils/logger");

// ================= CLOUDINARY CONFIGURATION =================

// Configure Cloudinary using environment variables
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Validate configuration (ensure required env variables are set)
if (!process.env.CLOUDINARY_CLOUD_NAME ||
    !process.env.CLOUDINARY_API_KEY ||
    !process.env.CLOUDINARY_API_SECRET) {

  logger.error("Cloudinary configuration failed: Missing environment variables");
} else {
  // Log successful configuration (avoid logging sensitive data)
  logger.info(`Cloudinary configured successfully for cloud: ${process.env.CLOUDINARY_CLOUD_NAME}`);
}

// Export configured Cloudinary instance
module.exports = cloudinary;