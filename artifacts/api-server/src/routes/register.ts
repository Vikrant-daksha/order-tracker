import { Router, Request, Response } from "express";
import { getUsersCollection } from "../lib/mongo";
import { z } from "zod";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";

const UserSchema = z.object({
  userName: z.string().min(1, "Name is Required!"),
  hashedPassword: z
    .string()
    .min(2, "Password cannot be Smaler than 2 Characters"),
  emailId: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  role: z.string().default("user"),
});

type UserData = z.infer<typeof UserSchema>;

const collection = await getUsersCollection();

const registerRouter: Router = Router();

registerRouter.post("/create-user", async (req: Request, res: Response) => {
  const { userData } = req.body;
  const date = new Date().toISOString();

  const hashedPassword = await bcrypt.hash(userData.hashedPassword, 12);

  userData.hashedPassword = hashedPassword;

  const newData = { ...userData, createdAt: date, updatedAt: date };

  const check = UserSchema.safeParse(newData);

  if (!check.success || !check)
    return res.status(400).json({
      success: false,
      message:
        check.error.flatten().fieldErrors ||
        "User Cannot be created with empty data",
    });

  const user: UserData = check.data;

  const isExistingUser = await collection.findOne({
    userName: user.userName,
    emailId: user.emailId,
  });

  if (isExistingUser)
    return res
      .status(409)
      .json({ success: false, message: "User Already Exists!" });

  const createdUser = await collection.insertOne({ ...user });

  if (!createdUser)
    return res
      .status(500)
      .json({ success: false, message: "Could not create User" });

  const payload = {
    userId: createdUser.insertedId,
    email: user.emailId,
    role: user.role,
  };

  const jwtToken = jwt.sign(payload, process.env.JWT_SECRET || "NO SECRET", {
    expiresIn: "15m",
  });

  return res.status(200).json({
    success: true,
    message: "User Created Successfully!",
    payload: jwtToken,
  });
});

export default registerRouter;
