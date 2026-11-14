import { v2 as cloudinary, UploadApiResponse } from "cloudinary";
import multer from "multer";

// 1. Configure Cloudinary with environment variables
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

// 2. Configure Multer to store files in memory (RAM buffer)
const storage = multer.memoryStorage();

export const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit per file
    files: 10, // Max 10 files at a time
  },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Only image files are allowed!"));
    }
  },
});

// 3. Helper: Upload a single Buffer to Cloudinary
export const uploadBufferToCloudinary = (
  fileBuffer: Buffer,
  folder: string,
): Promise<UploadApiResponse> => {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: "auto",
      },
      (error, result) => {
        if (error || !result) {
          return reject(error);
        }
        resolve(result);
      },
    );
    uploadStream.end(fileBuffer);
  });
};

// 4. Helper: Upload customer images into cherrybrush/customers/<customerId>
export const uploadCustomerImages = async (
  customerId: string,
  files: Express.Multer.File[],
): Promise<UploadApiResponse[]> => {
  const cleanId = (customerId || "general")
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, "_");
  const targetFolder = `orderflow/customers/${cleanId}`;

  const uploadPromises = files.map((file) =>
    uploadBufferToCloudinary(file.buffer, targetFolder),
  );
  return Promise.all(uploadPromises);
};

// 5. Helper: Upload order/product images into cherrybrush/products/<productName>
export const uploadProductImages = async (
  productName: string,
  files: Express.Multer.File[],
): Promise<UploadApiResponse[]> => {
  const cleanName = (productName || "unnamed_product")
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, "_");
  const targetFolder = `orderflow/products/${cleanName}`;

  const uploadPromises = files.map((file) =>
    uploadBufferToCloudinary(file.buffer, targetFolder),
  );
  return Promise.all(uploadPromises);
};

export { cloudinary };
