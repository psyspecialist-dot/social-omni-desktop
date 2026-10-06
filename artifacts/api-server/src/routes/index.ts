import { Router, type IRouter } from "express";
import healthRouter from "./health";
import socialOmniRouter from "./socialomni";
import desktopDownloadRouter from "./desktop-download";

const router: IRouter = Router();

router.use(healthRouter);
router.use(desktopDownloadRouter);
router.use("/socialomni", socialOmniRouter);

export default router;
