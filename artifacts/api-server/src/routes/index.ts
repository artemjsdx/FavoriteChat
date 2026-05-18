import { Router, type IRouter } from "express";
import healthRouter from "./health";
import agentsRouter from "./agents";
import channelsRouter from "./channels";
import dashboardRouter from "./dashboard";
import webhookRouter from "./webhook";

const router: IRouter = Router();

router.use(healthRouter);
router.use(agentsRouter);
router.use(channelsRouter);
router.use(dashboardRouter);
router.use(webhookRouter);

export default router;
