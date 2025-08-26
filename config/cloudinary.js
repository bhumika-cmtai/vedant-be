import dotenv from "dotenv";
import { v2 as cloudinary } from "cloudinary";
import fs from "fs";

dotenv.config();

// Configure Cloudinary with your credentials from .env
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

/**
 * Uploads a file from a local path to Cloudinary.
 * @param {string} localFilePath The path to the file on your server.
 * @returns {Promise<object|null>} The Cloudinary response object or null on failure.
 */
const uploadOnCloudinary = async (localFilePath) => {
  try {
    if (!localFilePath) return null;
    const response = await cloudinary.uploader.upload(localFilePath, {
      resource_type: "auto",
      folder: "products", // Good practice to organize uploads
    });
    fs.unlinkSync(localFilePath); // Delete the locally saved temporary file
    return response;
  } catch (error) {
    console.error("Cloudinary Upload Error:", error);
    // Ensure file is deleted even if upload fails
    if (fs.existsSync(localFilePath)) {
      fs.unlinkSync(localFilePath);
    }
    return null;
  }
};

const uploadContactImageOnCloudinary = async (localFilePath) => {
  try {
    if (!localFilePath) return null;
    const response = await cloudinary.uploader.upload(localFilePath, {
      resource_type: "auto",
      folder: "contacts", // Organizes contact reference images
    });
    fs.unlinkSync(localFilePath);
    return response;
  } catch (error) {
    console.error("Cloudinary Contact Image Upload Error:", error);
    if (fs.existsSync(localFilePath)) {
      fs.unlinkSync(localFilePath);
    }
    return null;
  }
};




// =================================================================
// --- EDIT START: ADDED FUNCTIONS FOR UPDATE AND DELETE ---
// =================================================================

/**
 * Deletes a file from Cloudinary using its public ID.
 * @param {string} publicId The unique public ID of the file (e.g., 'products/xyz123').
 * @param {string} resourceType The type of the resource ('image', 'video', etc.).
 * @returns {Promise<boolean>} True if deletion was successful or file was not found.
 */
const deleteFromCloudinary = async (publicId, resourceType = "image") => {
  try {
    if (!publicId) return false;
    
    const result = await cloudinary.uploader.destroy(publicId, {
      resource_type: resourceType,
    });

    // 'ok' means deleted, 'not found' is also a success for our purpose
    if (result.result === "ok" || result.result === "not found") {
      console.log(`Successfully deleted ${publicId} from Cloudinary.`);
      return true;
    } else {
      console.error(`Failed to delete ${publicId} from Cloudinary:`, result);
      return false;
    }
  } catch (error) {
    console.error("Cloudinary Deletion Error:", error);
    return false;
  }
};

/**
 * Extracts the public ID from a full Cloudinary URL.
 * @param {string} url The full Cloudinary URL of the asset.
 * @returns {string} The public ID (e.g., 'products/filename').
 */
const getPublicIdFromUrl = (url) => {
  if (!url) return "";
  // Example URL: http://res.cloudinary.com/your_cloud_name/image/upload/v123456/products/filename.jpg
  // We need to extract: "products/filename"
  try {
    const parts = url.split('/');
    // The public ID starts after the version number, which is after 'upload'
    const publicIdWithExtension = parts.slice(parts.indexOf('products')).join('/');
    return publicIdWithExtension.substring(0, publicIdWithExtension.lastIndexOf('.'));
  } catch (error) {
    console.error("Could not extract Public ID from URL:", url, error);
    return "";
  }
};


// =================================================================
// --- EDIT END: UPDATED THE EXPORT STATEMENT ---
// =================================================================

// Export all necessary functions so they can be imported in your controllers
export { uploadOnCloudinary,uploadContactImageOnCloudinary ,deleteFromCloudinary, getPublicIdFromUrl };