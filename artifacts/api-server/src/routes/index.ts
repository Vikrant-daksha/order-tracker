import { Router, type IRouter } from "express";
import healthRouter from "./health";
import ordersRouter from "./orders";
import customerRouter from "../lib/customers";
import productRouter from "./products";

const router: IRouter = Router();

router.use(healthRouter);
router.use(ordersRouter);
router.use(customerRouter);
router.use(productRouter);

export default router;
