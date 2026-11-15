import { Router, Request, Response } from "express";
import { getUsersCollection } from "../lib/mongo";
import { z } from "zod";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";

const collection = await getUsersCollection();

const authRouter: Router = Router();

// Zod schema for runtime check of the refresh request
const RefreshTokenSchema = z.object({
  refreshToken: z.string().min(1, "Refresh token is required"),
});

// Zod schema for runtime check of the login request
const LoginSchema = z
  .object({
    emailId: z.string().email("Valid email is required").optional(),
    password: z.string().min(1, "Password is required"),
  })
  .refine((data) => data.emailId, {
    message: "Either emailId or userName must be provided",
  });

// 1. Refresh Token Endpoint
authRouter.post("/refresh", async (req: Request, res: Response) => {
  const check = RefreshTokenSchema.safeParse(req.body);

  if (!check.success) {
    return res.status(400).json({
      success: false,
      message: check.error.flatten().fieldErrors,
    });
  }

  const { refreshToken } = check.data;

  // Verify the refresh token
  let decoded: any;
  try {
    decoded = jwt.verify(
      refreshToken,
      process.env.REFRESH_JWT_SECRET || process.env.JWT_SECRET || "NO SECRET",
    );
  } catch {
    return res.status(401).json({
      success: false,
      message: "Invalid or expired refresh token",
    });
  }

  // Fetch user from DB using decoded token payload safely
  const orConditions: any[] = [];
  if (decoded.emailId) orConditions.push({ emailId: decoded.emailId });
  if (decoded.email) orConditions.push({ emailId: decoded.email });
  if (decoded.userName) orConditions.push({ userName: decoded.userName });

  if (orConditions.length === 0) {
    return res.status(401).json({
      success: false,
      message: "Invalid refresh token payload",
    });
  }

  const user: any = await collection.findOne({
    $or: orConditions,
  });

  if (!user) {
    return res.status(404).json({
      success: false,
      message: "User not found",
    });
  }

  // Payload: userName, role, emailId
  const payload = {
    userName: user.userName,
    role: user.role,
    emailId: user.emailId,
  };

  // Sign a new access token
  const newAccessToken = jwt.sign(
    payload,
    process.env.JWT_SECRET || "NO SECRET",
    { expiresIn: "15m" },
  );

  return res.status(200).json({
    success: true,
    message: "Access token refreshed successfully",
    accessToken: newAccessToken,
    payload,
  });
});

// 2. Simple Login Endpoint (issues access token + refresh token)
authRouter.post("/login", async (req: Request, res: Response) => {
  const check = LoginSchema.safeParse(req.body);

  if (!check.success) {
    return res.status(400).json({
      success: false,
      message: check.error.flatten().fieldErrors,
    });
  }

  const { emailId, password } = check.data;
  console.log(password);

  // Fetch user from DB using the collection variable
  const user: any = await collection.findOne({
    $or: [...(emailId ? [{ emailId }] : [])],
  });

  if (!user) {
    return res.status(401).json({
      success: false,
      message: "Invalid credentials",
    });
  }

  // Check password
  const isMatch = await bcrypt.compare(password, user.hashedPassword);
  if (!isMatch) {
    return res.status(401).json({
      success: false,
      message: "Invalid credentials",
    });
  }

  // Payload: userName, role, emailId
  const payload = {
    userName: user.userName,
    role: user.role,
    emailId: user.emailId,
  };

  const accessToken = jwt.sign(payload, process.env.JWT_SECRET || "NO SECRET", {
    expiresIn: "15m",
  });

  const refreshToken = jwt.sign(
    payload,
    process.env.REFRESH_JWT_SECRET || process.env.JWT_SECRET || "NO SECRET",
    { expiresIn: "7d" },
  );

  return res.status(200).json({
    success: true,
    message: "Login successful",
    accessToken,
    refreshToken,
    payload,
  });
});

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

authRouter.post("/register", async (req: Request, res: Response) => {
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
    userName: user.userName,
    emailId: user.emailId,
    email: user.emailId,
    role: user.role,
  };

  const accessToken = jwt.sign(payload, process.env.JWT_SECRET || "NO SECRET", {
    expiresIn: "15m",
  });

  const refreshToken = jwt.sign(
    payload,
    process.env.REFRESH_JWT_SECRET || process.env.JWT_SECRET || "NO SECRET",
    { expiresIn: "7d" },
  );

  return res.status(200).json({
    success: true,
    message: "User Created Successfully!",
    accessToken,
    refreshToken,
    payload,
  });
});

export default authRouter;
