import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { ApiError } from "../utils/ApiError.js";
import { TaxConfig } from "../models/taxConfig.model.js";

const getOrCreateTaxConfig = async () => {
    let config = await TaxConfig.findOne();
    if (!config) {
        config = await TaxConfig.create({ rate: 0.03 }); // Default 3%
    }
    return config;
};

/**
 * @desc    Get the current tax rate
 * @route   GET /api/v1/tax/config
 */
const getTaxConfig = asyncHandler(async (req, res) => {
    const config = await getOrCreateTaxConfig();
    return res.status(200).json(new ApiResponse(200, config, "Tax configuration fetched."));
});

/**
 * @desc    Update the tax rate (Admin only)
 * @route   PUT /api/v1/tax/config
 */
const setTaxConfig = asyncHandler(async (req, res) => {
    const { ratePercentage } = req.body;

    if (ratePercentage === undefined || typeof ratePercentage !== 'number' || ratePercentage < 0 || ratePercentage > 100) {
        throw new ApiError(400, "Please provide a valid tax rate percentage (0-100).");
    }
    
    const rateDecimal = ratePercentage / 100;

    const config = await TaxConfig.findOneAndUpdate(
        {},
        { rate: rateDecimal },
        { new: true, upsert: true }
    );

    return res.status(200).json(new ApiResponse(200, config, "Tax rate updated successfully."));
});

export {
    getTaxConfig,
    setTaxConfig
};