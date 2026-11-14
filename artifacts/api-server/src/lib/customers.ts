import { Router, Request, Response } from "express";
import { ObjectId } from "mongodb";
import { getCustomersCollection } from "./mongo";

const customerRouter: Router = Router();

export interface CustomerData {
  name: string;
  email?: string;
  phone?: string;
  instagram?: string;
  address: string;
  size?: string;
  note?: string;
  sizeImagePaths?: string[];
}

/**
 * Sanitizes customer contact info to ensure:
 * 1. Phone and Instagram handles are strictly separated and never identical.
 * 2. Raw contactInfo strings are parsed into appropriate discrete fields.
 * 3. Any customerImages field is stripped (no need to store customer images).
 */
export function sanitizeCustomerData<T extends Partial<CustomerData>>(data: T): T {
  const result: any = { ...data };

  // If a raw contactInfo string was passed on customerData, parse it
  const rawContact = (result as any).contactInfo;
  if (rawContact && typeof rawContact === "string") {
    const lines = rawContact
      .split("\n")
      .map((l: string) => l.trim())
      .filter(Boolean);
    for (const part of lines) {
      if (part.includes("@") && part.includes(".")) {
        if (!result.email) result.email = part;
      } else if (/^\+?[0-9\s\-()]{7,}$/.test(part)) {
        if (!result.phone) result.phone = part;
      } else if (part.startsWith("@") || /^[a-zA-Z0-9._]+$/.test(part)) {
        if (!result.instagram) result.instagram = part.replace(/^@/, "");
      }
    }
    delete result.contactInfo;
  }

  // Normalize phone if mistakenly containing an IG handle
  if (result.phone) {
    const trimmedPhone = String(result.phone).trim();
    if (trimmedPhone.startsWith("@") || /^[a-zA-Z._]+$/.test(trimmedPhone)) {
      if (!result.instagram) {
        result.instagram = trimmedPhone.replace(/^@/, "");
      }
      delete result.phone;
    } else {
      result.phone = trimmedPhone;
    }
  }

  // Normalize instagram if mistakenly containing a phone number
  if (result.instagram) {
    const trimmedIg = String(result.instagram).trim();
    if (/^\+?[0-9\s\-()]{7,}$/.test(trimmedIg) && !/[a-zA-Z]/.test(trimmedIg)) {
      if (!result.phone) {
        result.phone = trimmedIg;
      }
      delete result.instagram;
    } else {
      result.instagram = trimmedIg.replace(/^@/, "");
    }
  }

  // If phone and instagram ended up with the exact same value, resolve to the correct one
  if (
    result.phone &&
    result.instagram &&
    result.phone.trim().toLowerCase() === result.instagram.trim().toLowerCase()
  ) {
    const val = result.phone.trim();
    if (/^\+?[0-9\s\-()]{7,}$/.test(val) && !/[a-zA-Z]/.test(val)) {
      delete result.instagram;
    } else {
      result.instagram = val.replace(/^@/, "");
      delete result.phone;
    }
  }

  // Strip customerImages (no longer uploading or storing customer images)
  delete result.customerImages;

  return result as T;
}

const collection = await getCustomersCollection();

function buildIdFilter(id: string) {
  if (ObjectId.isValid(id) && id.length === 24) {
    return { $or: [{ _id: id as any }, { _id: new ObjectId(id) as any }] };
  }
  return { _id: id as any };
}

export const getCustomerById = async (id: string) => {
  return collection.findOne(buildIdFilter(id));
};

export const createCustomer = async (customer: CustomerData) => {
  const sanitized = sanitizeCustomerData(customer);
  const create = await collection.insertOne({
    ...sanitized,
    createdAt: new Date().toISOString(),
  });
  return create.insertedId;
};

export const updateCustomer = async (
  id: string,
  customer: Partial<CustomerData>,
) => {
  const isCustomer = await getCustomerById(id);
  if (!isCustomer) return { success: false, error: "Customer not Found!" };

  const sanitized = sanitizeCustomerData(customer);
  const update = await collection.updateOne(buildIdFilter(id), {
    $set: { ...sanitized, updatedAt: new Date().toISOString() },
  });

  return { success: true, message: update.matchedCount };
};

customerRouter.put(
  "/update-customer/:id",
  async (req: Request, res: Response) => {
    const { id } = req.params;
    const customerData = req.body;
    try {
      const result = await updateCustomer(id as any, customerData);
      if (!result.success) {
        return res.status(404).json({ success: false, error: result.error });
      }

      return res
        .status(200)
        .json({ success: true, message: "Customer Updated Successfully!" });
    } catch (error) {
      console.error("Error Updating User", error);
      return res
        .status(500)
        .json({ success: false, error: "Couldnt Update customer" });
    }
  },
);

export default customerRouter;
