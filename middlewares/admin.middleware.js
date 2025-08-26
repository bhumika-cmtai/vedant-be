import { ApiError } from "../utils/ApiError.js";
export const adminMiddleware = (req, res, next) => {
    if (req.user && req.user.role === 'admin') next();
    else next(new ApiError(403, "Forbidden: Admin resource, access denied."));
};