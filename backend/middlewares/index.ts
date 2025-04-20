import { Request, Response, NextFunction } from "express";
import { checkLogin } from "../util-server";

/**
 * Authentication middleware for express routes
 */
export const authMiddleware = (req: Request, res: Response, next: NextFunction) => {
    // For now, simply pass through as we'll handle authentication in socket.io
    next();
};

export default {
    authMiddleware
};