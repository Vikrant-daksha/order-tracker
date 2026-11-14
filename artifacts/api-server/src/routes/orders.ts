import { Router, Request, Response } from "express";
import { getOrdersCollection } from "../lib/mongo";
import { createCustomer, updateCustomer, CustomerData } from "../lib/customers";
import { createProduct } from "./products";
import {
  upload,
  uploadCustomerImages,
  uploadProductImages,
} from "../lib/cloudinary";

export type OrderSource =
  | "Instagram"
  | "Facebook"
  | "WhatsApp"
  | "Website"
  | "Email"
  | "Manual";

export type PaymentStatus = "Unpaid" | "Partial" | "Paid";
export type OrderStatus = "Confirmed" | "Completed" | "Shipped" | "Delivered";

export interface OrderItem {
  id: string;
  productId?: string;
  productName: string;
  size?: string;
  price: number;
  quantity: number;
  imagePaths?: string[]; // <-- Each product item owns its own images!
  isCustom: boolean;
}

export interface Order {
  id: string;
  source: OrderSource;
  customerName: string;
  contactInfo: string;
  address: string;
  orderDate: string;
  dueDate: string;
  productId?: string;
  productName?: string;
  price: number;
  paymentStatus: PaymentStatus;
  amountPaid: number;
  status: OrderStatus;
  trackingLink: string;
  notes: string;
  createdAt: string;
  isCustom: number;
  size?: string;
  sizeImagePaths?: string[];
  customerId?: string;
  workingOn?: number; // 1 = currently working on, 0 = not
  items?: OrderItem[]; // <-- Multiple products in an order
  deleted?: boolean;
  updatedAt?: string;
}

function genId() {
  return (
    `CHERRYBRUSH` +
    Date.now().toString(36) +
    Math.random().toString(36).substring(2, 10)
  );
}

const ordersRouter: Router = Router();

const collection = await getOrdersCollection();

const getOrderById = async (id: string) => {
  return await collection.findOne({ _id: id as any });
};

// =========================================================================
// UPLOAD-FIRST ENDPOINTS
// =========================================================================

// POST /upload-customer-images
// Uploads customer images into: cherrybrush/customers/<customerId>
ordersRouter.post(
  "/upload-customer-images",
  upload.array("images", 10),
  async (req: Request, res: Response) => {
    try {
      const customerId = (req.body.customerId ||
        req.query.customerId ||
        "general") as string;
      const files = req.files as Express.Multer.File[];

      if (!files || files.length === 0) {
        return res.status(400).json({ error: "No image files provided" });
      }

      const uploadResults = await uploadCustomerImages(customerId, files);
      const imageUrls = uploadResults.map((result) => result.secure_url);

      return res.status(200).json({
        success: true,
        customerId,
        imageUrls,
      });
    } catch (error) {
      console.error("Error uploading customer images:", error);
      return res
        .status(500)
        .json({ error: "Failed to upload customer images" });
    }
  },
);

// POST /upload-product-images
// Uploads product images into: cherrybrush/products/<productName>
ordersRouter.post(
  "/upload-product-images",
  upload.array("images", 10),
  async (req: Request, res: Response) => {
    try {
      const productName = (req.body.productName ||
        req.query.productName ||
        "custom_order") as string;
      const files = req.files as Express.Multer.File[];

      if (!files || files.length === 0) {
        return res.status(400).json({ error: "No image files provided" });
      }

      const uploadResults = await uploadProductImages(productName, files);
      const imageUrls = uploadResults.map((result) => result.secure_url);

      return res.status(200).json({
        success: true,
        productName,
        imageUrls,
      });
    } catch (error) {
      console.error("Error uploading product images:", error);
      return res.status(500).json({ error: "Failed to upload product images" });
    }
  },
);

// =========================================================================
// ORDER CRUD ENDPOINTS
// =========================================================================

// GET /api/orders - Fetch all non-deleted orders
ordersRouter.get("/get-orders", async (_req: Request, res: Response) => {
  try {
    const orders = await collection
      .find({ deleted: { $ne: true } })
      .sort({ createdAt: -1 })
      .toArray();
    return res.json(orders);
  } catch (error) {
    console.error("Error fetching orders:", error);
    return res.status(500).json({ error: "Failed to fetch orders" });
  }
});

// POST /api/orders - Create a new order
// Body: { customerData: CustomerData, orderData: Order }
ordersRouter.post("/create-orders", async (req: Request, res: Response) => {
  try {
    const id = genId();
    const createdAt = new Date().toISOString();
    const {
      customerData,
      orderData,
    }: {
      customerData: CustomerData;
      orderData: Omit<Order, "id" | "createdAt">;
    } = req.body;

    if (!customerData) {
      return res
        .status(400)
        .json({ error: "Order cannot be created without a Customer" });
    }

    // 1. Create or save customer (contains customerImages)
    const customerId = await createCustomer(customerData);
    if (!customerId) {
      return res.status(400).json({ error: "Failed to create Customer" });
    }

    if (!orderData) {
      return res.status(400).json({ error: "No order data received" });
    }

    // 2. Check if isCustom is OFF: ensure standard products exist in catalog
    if (orderData.items && Array.isArray(orderData.items)) {
      for (const item of orderData.items) {
        // If isCustom is off (false), auto-add product to catalog if not already present
        if (!item.isCustom && item.productName) {
          const productResult = await createProduct({
            name: item.productName,
            price: item.price,
            size: item.size,
            imagePaths: item.imagePaths || [],
          });
          if (productResult.success && productResult.product?.id) {
            item.productId = productResult.product.id;
          }
        }
      }
    } else if (orderData.isCustom === 0) {
      const name = (orderData as any).productName || (orderData as any).customName;
      if (name) {
        const productResult = await createProduct({
          name,
          price: orderData.price,
          size: orderData.size,
          imagePaths: orderData.sizeImagePaths || [],
        });
        if (productResult.success && productResult.product?.id) {
          orderData.productId = productResult.product.id;
        }
      }
    }

    // 3. Insert order document (items contains imagePaths for each product)
    const newOrder: Order = {
      _id: id,
      ...orderData,
      id: id,
      customerId: customerId.toString(),
      createdAt: createdAt,
      deleted: false,
    } as any;

    await collection.insertOne(newOrder as any);

    return res.status(201).json({ success: true, id: id });
  } catch (error) {
    console.error("Error creating order:", error);
    return res.status(500).json({ error: "Failed to create order" });
  }
});

// PUT /api/orders/update-order/:id - Update an order
// Body: { customerData?: Partial<CustomerData>, orderData?: Partial<Order> }
ordersRouter.put("/update-order/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const {
      customerData,
      orderData,
    }: { customerData?: Partial<CustomerData>; orderData?: Partial<Order> } =
      req.body;
    const updatedAt = new Date().toISOString();

    if (!id || (!orderData && !customerData)) {
      return res.status(400).json({ error: "Nothing to Update!" });
    }

    const existingOrder = await getOrderById(id as any);
    if (!existingOrder) {
      return res.status(404).json({ error: "Order not found" });
    }

    // 1. Update customer if customerData is passed
    if (customerData && existingOrder.customerId) {
      const isCustomer = await updateCustomer(
        existingOrder.customerId as any,
        customerData,
      );
      if (!isCustomer.success) {
        return res.status(400).json({ error: isCustomer.error });
      }
    }

    // 2. Update order if orderData is passed (including updated items)
    if (orderData) {
      if (orderData.items && Array.isArray(orderData.items)) {
        for (const item of orderData.items) {
          if (!item.isCustom && item.productName) {
            const productResult = await createProduct({
              name: item.productName,
              price: item.price,
              size: item.size,
              imagePaths: item.imagePaths || [],
            });
            if (productResult.success && productResult.product?.id) {
              item.productId = productResult.product.id;
            }
          }
        }
      }

      const update = await collection.updateOne(
        { _id: id as any },
        { $set: { ...orderData, updatedAt } },
      );

      if (update.matchedCount === 0) {
        return res.status(404).json({ error: "Order not found" });
      }
    }

    return res.json({ success: true, message: `Order ${id} updated` });
  } catch (error) {
    console.error("Error updating order:", error);
    return res.status(500).json({ error: "Failed to update order" });
  }
});

// DELETE /api/orders/:id - Soft-delete an order
ordersRouter.delete("/orders/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const updatedAt = new Date().toISOString();

    await collection.updateOne(
      { _id: id as any },
      { $set: { deleted: true, updatedAt: updatedAt } },
    );

    return res.json({ success: true, message: `Order ${id} deleted` });
  } catch (error) {
    console.error("Error deleting order:", error);
    return res.status(500).json({ error: "Failed to delete order" });
  }
});

// PUT /api/orders/order-status/:id - Toggle working status
ordersRouter.put("/order-status/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const updatedAt = new Date().toISOString();
    const order = await collection.findOne({ _id: id as any });
    if (!order) {
      return res
        .status(404)
        .json({ success: false, message: `${id} not found` });
    }

    const isClosed =
      order.status === "Completed" ||
      order.status === "Shipped" ||
      order.status === "Delivered";

    if (isClosed) {
      return res
        .status(200)
        .json({ success: true, message: `Order ${id} is Completed` });
    }

    const next = order.workingOn ? 0 : 1;

    await collection.findOneAndUpdate(
      { _id: id as any },
      { $set: { workingOn: next }, updatedAt },
    );

    return res
      .status(200)
      .json({ success: true, message: `Order ${id} status updated!` });
  } catch (error) {
    console.error("Error toggling order status:", error);
    return res.status(500).json({ error: "Failed to toggle order status" });
  }
});

export default ordersRouter;
