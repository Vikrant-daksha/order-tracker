import { NextFunction, Request, Response, Router } from "express";
import jwt, { JwtPayload } from "jsonwebtoken";

// Define the shape of your custom JWT payload
export interface CustomJwtPayload extends JwtPayload {
  sub: string;
  email: string;
  role: string;
}

// Merge your custom property into Express's Request interface
declare global {
  namespace Express {
    interface Request {
      user?: CustomJwtPayload;
    }
  }
}

const authenticate = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  console.log("auth Header: ", authHeader);
  console.log("token", token);

  if (!token)
    return res.status(401).json({
      success: false,
      message: "Access Denied! No Access or Auth Token found!",
    });

  console.log(process.env.JWT_SECRET);

  jwt.verify(token, process.env.JWT_SECRET || "NO SECRET", (err, decoded) => {
    if (err) {
      return res.status(403).json({
        success: false,
        message: "Could not Verify the Auth Token.",
        error: err,
      });
    }
    req.user = decoded as CustomJwtPayload;
    next();
  });
};

export default authenticate;
