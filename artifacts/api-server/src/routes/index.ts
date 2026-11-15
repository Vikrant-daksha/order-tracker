import { Router, type IRouter } from "express";
import healthRouter from "./health";
import ordersRouter from "./orders";
import customerRouter from "../lib/customers";
import productRouter from "./products";
import registerRouter from "./register";
import authRouter from "./auth";

const router: IRouter = Router();

router.use(healthRouter);
router.use(ordersRouter);
router.use(customerRouter);
router.use(productRouter);
router.use(registerRouter);
router.use("/auth", authRouter);

export default router;
