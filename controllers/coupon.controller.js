import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { Coupon } from "../models/coupon.model.js";
import mongoose from "mongoose";

/**
 * @desc    Create a new coupon (Admin)
 * @route   POST /api/v1/coupons
 */
const createCoupon = asyncHandler(async (req, res) => {
    const { code, discountPercentage, status } = req.body;
    console.log(code, discountPercentage)

    // --- Validation ---
    if (!code || !discountPercentage) {
        throw new ApiError(400, "Coupon code and discount percentage are required.");
    }

    // Check if a coupon with this code already exists
    const existingCoupon = await Coupon.findOne({ code });
    if (existingCoupon) {
        throw new ApiError(409, `Coupon with code "${code}" already exists.`);
    }

    // --- Create Coupon ---
    const newCoupon = await Coupon.create({
        code,
        discountPercentage,
        status, // Will default to 'active' if not provided
    });

    if (!newCoupon) {
        throw new ApiError(500, "Something went wrong while creating the coupon.");
    }

    return res
        .status(201)
        .json(new ApiResponse(201, newCoupon, "Coupon created successfully."));
});


/**
 * @desc    Get all coupons (Admin)
 * @route   GET /api/v1/coupons
 */
const getAllCoupons = asyncHandler(async (req, res) => {
    const { status } = req.query; // Get status from query params

    const filter = {}; // Start with an empty filter object

    // If a valid status is provided ('active' or 'inactive'), add it to the filter.
    // This is a safe way to build the query.
    if (status && ['active', 'inactive'].includes(status)) {
        filter.status = status;
    }

    // Pass the filter to the find method. If the filter is empty, it returns all coupons.
    const coupons = await Coupon.find(filter).sort({ createdAt: -1 });

    return res
        .status(200)
        .json(new ApiResponse(200, coupons, "All coupons fetched successfully."));
});




/**
 * @desc    Update a coupon (Admin)
 * @route   PATCH /api/v1/coupons/:couponId
 */
const updateCoupon = asyncHandler(async (req, res) => {
    const { couponId } = req.params;
    const { code, discountPercentage, status } = req.body;
    console.log(code, discountPercentage, status)

    if (!mongoose.isValidObjectId(couponId)) {
        throw new ApiError(400, "Invalid coupon ID format.");
    }

    // Prepare an object with the fields to update
    const updateFields = {};
    if (code) updateFields.code = code;
    if (discountPercentage) updateFields.discountPercentage = discountPercentage;
    if (status) updateFields.status = status;
    
    // Ensure there is something to update
    if (Object.keys(updateFields).length === 0) {
        throw new ApiError(400, "No fields to update were provided.");
    }

    const updatedCoupon = await Coupon.findByIdAndUpdate(
        couponId,
        { $set: updateFields },
        { new: true, runValidators: true } // Return the updated document and run schema validators
    );

    if (!updatedCoupon) {
        throw new ApiError(404, "Coupon not found.");
    }

    return res
        .status(200)
        .json(new ApiResponse(200, updatedCoupon, "Coupon updated successfully."));
});


/**
 * @desc    Delete a coupon (Admin)
 * @route   DELETE /api/v1/coupons/:couponId
 */
const deleteCoupon = asyncHandler(async (req, res) => {
    const { couponId } = req.params;

    if (!mongoose.isValidObjectId(couponId)) {
        throw new ApiError(400, "Invalid coupon ID format.");
    }
    
    const deletedCoupon = await Coupon.findByIdAndDelete(couponId);

    if (!deletedCoupon) {
        throw new ApiError(404, "Coupon not found.");
    }

    return res
        .status(200)
        .json(new ApiResponse(200, {}, "Coupon deleted successfully."));
});



const getCouponByCode = asyncHandler(async (req, res) => {
    // 1. Get the coupon code from the URL parameters
    const { code } = req.params;

    // 2. Validate that a code was provided
    if (!code) {
        throw new ApiError(400, "Coupon code is required in the URL.");
    }

    // 3. Find the coupon in the database
    // The query uses a case-insensitive regular expression (`$regex` with `$options: 'i'`)
    // to match the exact code (e.g., 'SUMMER25' will match 'summer25').
    const coupon = await Coupon.findOne({ 
        code: { $regex: `^${code}$`, $options: 'i' } 
    });

    // 4. If no coupon is found, return a 404 error
    if (!coupon) {
        throw new ApiError(404, `Coupon with code "${code}" not found.`);
    }
    
    // 5. (Important) Check if the found coupon is active.
    // This prevents users from applying expired or disabled coupons.
    if (coupon.status !== 'active') {
        throw new ApiError(403, "This coupon is not currently active.");
    }

    // 6. If the coupon is found and active, send a successful response
    return res
        .status(200)
        .json(new ApiResponse(200, coupon, "Coupon fetched successfully."));
});



export {
    createCoupon,
    getAllCoupons,
    updateCoupon,
    deleteCoupon,
    getCouponByCode
};