import { Router, type IRouter } from "express";
import healthRouter from "./health";
import socialOmniRouter from "./socialomni";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/socialomni", socialOmniRouter);

export default router;
