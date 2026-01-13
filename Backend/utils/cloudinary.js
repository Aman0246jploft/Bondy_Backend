// const cloudinary = require('cloudinary').v2;
// const multer = require('multer');

// // Multer setup for storing files temporarily
// const storage = multer.memoryStorage();
// const upload = multer({ storage: storage });
// const path = require('path');
// const stream = require('stream');

// cloudinary.config({
//   cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
//   api_key: process.env.CLOUDINARY_API_KEY,
//   api_secret: process.env.CLOUDINARY_API_SECRET,
// });

// async function uploadImageCloudinary(file, userId) {
//   return new Promise((resolve, reject) => {
//     try {
//       const ext = path.extname(file.originalname).toLowerCase();
//       const fileName = path.parse(file.originalname).name;
//       const publicId = `${fileName}`;
//       const resourceType = ['.pdf', '.doc', '.docx', '.txt'].includes(ext) ? 'raw' : 'image';

//       const readableStream = new stream.PassThrough();
//       readableStream.end(file.buffer);

//       const uploadStream = cloudinary.uploader.upload_stream(
//         {
//           public_id: publicId,
//           folder: userId,
//           resource_type: resourceType,
//           overwrite: true,
//         },
//         (error, result) => {
//           if (error) {
//             console.log("Upload Error:", error);
//             return reject(null);
//           }
//           resolve(result.secure_url);
//         }
//       );

//       readableStream.pipe(uploadStream); // Properly pipe stream

//     } catch (error) {
//       console.log("Error in uploadImageCloudinary:", error);
//       reject(null);
//     }
//   });
// }

// module.exports = {
//   uploadImageCloudinary,

// }
const multer = require("multer");
const upload = multer();
const path = require("path");
const fs = require("fs");

// Helper function to ensure a folder exists
function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * Stores an uploaded file on the server.
 * @param {Object} file - The multer file object
 * @param {String} userId - Used to create a folder per user
 * @returns {Promise<String>} - Relative path to the stored file
 */
async function storeImage(file, userId) {
  return new Promise((resolve, reject) => {
    try {
      // Validate input
      if (!file || !file.originalname || !file.buffer) {
        return reject(new Error("Invalid file object"));
      }

      // Create user-specific folder
      const userDir = path.join(__dirname, "..", "uploads", userId);
      ensureDir(userDir);

      // Create unique filename
      const ext = path.extname(file.originalname).toLowerCase();
      const fileName = `${Date.now()}-${file.originalname.replace(
        /\s+/g,
        "-"
      )}`;
      const filePath = path.join(userDir, fileName);

      // Write file buffer to disk
      fs.writeFile(filePath, file.buffer, (err) => {
        if (err) {
          console.error("File write error:", err);
          return reject(err);
        }

        // Return relative path for DB (use forward slashes for URLs)
        const relativePath = `uploads/${userId}/${fileName}`;
        resolve(relativePath);
      });
    } catch (error) {
      console.error("Error in storeImage:", error);
      reject(error);
    }
  });
}

module.exports = {
  storeImage,
  upload,
};
