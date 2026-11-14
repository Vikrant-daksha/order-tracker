import { Router, Request, Response } from "express";
import { getProductsCollection } from "../lib/mongo";
import { upload, uploadProductImages } from "../lib/cloudinary";

const productRouter: Router = Router();

export interface Product {
  id?: string;
  _id?: string;
  name: string;
  productName?: string; // Backwards-compatible alias
  size?: string;
  price: number;
  defaultPrice?: number; // Backwards-compatible alias
  category?: string;
  imagePaths: string[];
  thumbnailPath?: string;
  createdAt?: string;
  updatedAt?: string;
  deleted?: boolean;
}

export function genProductId() {
  return (
    `PROD_` +
    Date.now().toString(36) +
    Math.random().toString(36).substring(2, 8)
  );
}

const collection = await getProductsCollection();

// =========================================================================
// REUSABLE DATABASE HELPERS
// =========================================================================

export const getProductByName = async (name: string) => {
  return collection.findOne({
    name: { $regex: new RegExp(`^${name.trim()}$`, "i") },
    deleted: { $ne: true },
  });
};

export const getProductById = async (id: string) => {
  return collection.findOne({
    _id: id as any,
    deleted: { $ne: true },
  });
};

export const createProduct = async (productData: Partial<Product>) => {
  const name = productData.name || productData.productName;
  const price = productData.price ?? productData.defaultPrice;
  const images = productData.imagePaths || (productData as any).images || [];

  if (!name || price === undefined) {
    return {
      success: false,
      error: "Product name and price are required!",
    };
  }

  // 1. If product with this name already exists in catalog, return it
  const existing = await getProductByName(name);
  if (existing) {
    return {
      success: true,
      product: existing as unknown as Product,
      existed: true,
    };
  }

  // 2. Otherwise insert new product into catalog
  const id = productData.id || genProductId();
  const createdAt = new Date().toISOString();

  const newProduct: Product = {
    _id: id,
    id,
    name: name.trim(),
    productName: name.trim(),
    price: Number(price),
    defaultPrice: Number(price),
    size: productData.size,
    category: productData.category || "General",
    imagePaths: Array.isArray(images) ? images : [images],
    thumbnailPath: productData.thumbnailPath || (images[0] ?? ""),
    createdAt,
    deleted: false,
  };

  await collection.insertOne(newProduct as any);

  return {
    success: true,
    product: newProduct,
    existed: false,
  };
};

// =========================================================================
// 1. UPLOAD IMAGES TO CLOUDINARY (Upload-First Approach)
// Uploads into: cherrybrush/products/<productName>
// =========================================================================
productRouter.post(
  "/products/upload-images",
  upload.array("images", 10),
  async (req: Request, res: Response) => {
    try {
      const productName = (req.body.productName || req.body.name || req.query.name || "general_product") as string;
      const files = req.files as Express.Multer.File[];

      if (!files || files.length === 0) {
        return res.status(400).json({ success: false, error: "No images provided" });
      }

      const uploadResults = await uploadProductImages(productName, files);
      const imageUrls = uploadResults.map((r) => r.secure_url);

      return res.status(200).json({
        success: true,
        productName,
        imageUrls,
      });
    } catch (error) {
      console.error("Error uploading product images to Cloudinary:", error);
      return res.status(500).json({ success: false, error: "Cloudinary upload failed" });
    }
  }
);

// =========================================================================
// 2. GET ALL PRODUCTS (Excluding Soft-Deleted)
// =========================================================================
productRouter.get("/get-products", async (_req: Request, res: Response) => {
  try {
    const products = await collection
      .find({ deleted: { $ne: true } })
      .sort({ createdAt: -1 })
      .toArray();

    return res.status(200).json(products);
  } catch (error) {
    console.error("Error fetching products:", error);
    return res.status(500).json({ success: false, error: "Failed to fetch products" });
  }
});

// =========================================================================
// 3. CREATE PRODUCT (POST /create-product)
// =========================================================================
productRouter.post("/create-product", async (req: Request, res: Response) => {
  try {
    const result = await createProduct(req.body);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: result.error,
      });
    }

    return res.status(result.existed ? 200 : 201).json({
      success: true,
      message: result.existed
        ? "Product already exists in catalog!"
        : "Product Created Successfully!",
      product: result.product,
    });
  } catch (error) {
    console.error("Error Adding Product:", error);
    return res.status(500).json({
      success: false,
      error: "Error Adding Product to Catalog",
    });
  }
});

// =========================================================================
// 4. UPDATE PRODUCT (PUT /update-product/:id)
// =========================================================================
productRouter.put("/update-product/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    const updatedAt = new Date().toISOString();

    if (!id || !updates || Object.keys(updates).length === 0) {
      return res.status(400).json({
        success: false,
        error: "Product ID and update fields are required!",
      });
    }

    const sanitizedUpdates: Partial<Product> = {
      ...updates,
      updatedAt,
    };

    if (updates.productName && !updates.name) {
      sanitizedUpdates.name = updates.productName;
    }
    if (updates.images && !updates.imagePaths) {
      sanitizedUpdates.imagePaths = updates.images;
    }
    if (updates.defaultPrice !== undefined && updates.price === undefined) {
      sanitizedUpdates.price = Number(updates.defaultPrice);
    }

    const result = await collection.updateOne(
      { _id: id as any },
      { $set: sanitizedUpdates }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({
        success: false,
        error: `Product ${id} not found`,
      });
    }

    return res.status(200).json({
      success: true,
      message: `Product ${id} updated successfully!`,
    });
  } catch (error) {
    console.error("Error Updating Product:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to update product",
    });
  }
});

// =========================================================================
// 5. DELETE PRODUCT (Soft-Delete)
// =========================================================================
productRouter.delete("/products/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const updatedAt = new Date().toISOString();

    const result = await collection.updateOne(
      { _id: id as any },
      { $set: { deleted: true, updatedAt } }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({
        success: false,
        error: `Product ${id} not found`,
      });
    }

    return res.status(200).json({
      success: true,
      message: `Product ${id} deleted successfully!`,
    });
  } catch (error) {
    console.error("Error Deleting Product:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to delete product",
    });
  }
});

export default productRouter;
