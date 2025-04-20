import { DockgeServer } from "../dockge-server";
import { Router } from "../router";
import { Express, Router as ExpressRouter } from "express";
import gitRouter from "./git-router";

export class GitRouterWrapper extends Router {
    create(app: Express, server: DockgeServer): ExpressRouter {
        return gitRouter;
    }
}