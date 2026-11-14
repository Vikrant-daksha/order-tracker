import { Order } from "@/types";
import { useCallback } from "react";
import { IS_WEB } from "react-native-reanimated/lib/typescript/common";
import { MongoClient } from "mongodb";

const client = new MongoClient(
  "mongodb+srv://vikram:[EMAIL_ADDRESS]/myFirstDatabase",
  { ssl: true, auth: {} },
);

async function mongoDB() {
  return await client.connect();
}

function genId() {
  return (
    `CHERRYBRUSH` +
    Date.now().toString(36) +
    Math.random().toString(36).substring(2, 6)
  );
}

const addorder = useCallback(
  async (order: Omit<Order, "id" | "createdAt">): Promise<string> => {
    const id = genId();
    const _id = id;
    const createdAt = new Date().toISOString();
    const odr: Order = { ...order, id, createdAt } as Order;

    let productId = "";
    if (!IS_WEB && mongoDB) {
      productId = await mongoDB.collection("orders").insertOne({
        _id,
        odr,
      });
    }

    return productId;
  },
  [],
);

const addOrder = useCallback(
  async (order: Omit<Order, "id" | "createdAt">): Promise<string> => {
    const id = genId();
    const createdAt = new Date().toISOString();
    const full: Order = { ...order, id, createdAt } as Order;

    if (!IS_WEB && db) {
      db.runSync(
        `INSERT INTO orders (id,source,customerName,contactInfo,address,orderDate,dueDate,productId,customName,referenceImagePath,thumbnailPath,price,paymentStatus,amountPaid,status,trackingLink,notes,createdAt,isCustom,size,sizeImagePath,sizeThumbnailPath,sizeImagePaths,sizeThumbnailPaths,customerId,workingOn,items)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          id,
          full.source,
          full.customerName,
          full.contactInfo,
          full.address ?? "",
          full.orderDate,
          full.dueDate,
          full.productId,
          full.customName,
          full.referenceImagePath,
          full.thumbnailPath,
          full.price,
          full.paymentStatus,
          full.amountPaid,
          full.status,
          full.trackingLink,
          full.notes,
          createdAt,
          full.isCustom ? 1 : 0,
          full.size ?? "",
          full.sizeImagePath ?? "",
          full.sizeThumbnailPath ?? "",
          JSON.stringify(
            full.sizeImagePaths ||
              (full.sizeImagePath ? [full.sizeImagePath] : []),
          ),
          JSON.stringify(
            full.sizeThumbnailPaths ||
              (full.sizeThumbnailPath ? [full.sizeThumbnailPath] : []),
          ),
          full.customerId ?? "",
          full.workingOn ? 1 : 0,
          JSON.stringify(full.items || []),
        ],
      );
      const loaded = loadOrdersFromDb();
      setOrders(loaded);
    } else {
      setOrders((prev) => {
        const next = [full, ...prev];
        AsyncStorage.setItem(ORDERS_KEY, JSON.stringify(next));
        return next;
      });
    }
    return id;
  },
  [],
);
