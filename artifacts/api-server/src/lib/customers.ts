import { Router, Request, Response } from "express";
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
  customerImages?: string[]; // <-- Added per user requirement
}

const collection = await getCustomersCollection();

export const getCustomerById = async (id: string) => {
  return collection.findOne({ _id: id as any });
};

export const createCustomer = async (customer: CustomerData) => {
  const create = await collection.insertOne({
    ...customer,
    createdAt: new Date().toISOString(),
  });
  return create.insertedId;
};

export const updateCustomer = async (id: string, customer: Partial<CustomerData>) => {
  const isCustomer = await getCustomerById(id);
  if (!isCustomer) return { success: false, error: "Customer not Found!" };

  const update = await collection.updateOne(
    {
      _id: id as any,
    },
    { $set: { ...customer, updatedAt: new Date().toISOString() } },
  );

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
