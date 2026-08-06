import { Router, type IRouter } from "express";
import healthRouter from "./health";
import recordsRouter from "./records";
import projectsRouter from "./projects";
import dashboardRouter from "./dashboard";
import invoicesRouter from "./invoices";
import forecastRouter from "./forecast";
import validationRouter from "./validation";
import auditRouter from "./audit";
import odataRouter from "./odata";

const router: IRouter = Router();

router.use(healthRouter);
router.use(recordsRouter);
router.use(projectsRouter);
router.use(dashboardRouter);
router.use(invoicesRouter);
router.use(forecastRouter);
router.use(validationRouter);
router.use(auditRouter);
router.use(odataRouter);

export default router;
