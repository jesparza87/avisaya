import { Request, Response, NextFunction } from "express";

export interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    venue_id: string | null;
    role: string;
  };
}

export const verifyJWT = (req: AuthRequest, _res: Response, next: NextFunction): void => {
  req.user = {
    id: "user-id",
    email: "test@example.com",
    venue_id: "venue-id",
    role: "admin",
  };
  next();
};
