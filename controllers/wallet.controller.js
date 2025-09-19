import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { ApiError } from "../utils/ApiError.js";
import { WalletConfig } from "../models/walletConfig.model.js";
import { User } from "../models/user.model.js";

// Helper function to get or create the singleton config document
const getOrCreateConfig = async () => {
    let config = await WalletConfig.findOne();
    if (!config) {
        config = await WalletConfig.create({
            rewardRules: [],
            rupeesPerPoint: 1,
        });
    }
    return config;
};


// ==========================================================
// --- PUBLIC/USER-FACING APIs ---
// ==========================================================

/**
 * @desc    Get the current wallet configuration (for display or frontend logic)
 * @route   GET /api/v1/wallet/config
 */
const getWalletConfig = asyncHandler(async (req, res) => {
    const config = await getOrCreateConfig();
    return res.status(200).json(new ApiResponse(200, config, "Wallet configuration fetched successfully."));
});


/**
 * @desc    Get current user's wallet balance
 * @route   GET /api/v1/wallet/balance
 */
const getWalletBalance = asyncHandler(async (req, res) => {
    const user = await User.findById(req.user._id).select("wallet");
    if (!user) {
        throw new ApiError(404, "User not found");
    }
    return res.status(200).json(new ApiResponse(200, { wallet: user.wallet }, "Wallet balance fetched."));
});


// ==========================================================
// --- ADMIN-ONLY APIs ---
// ==========================================================

/**
 * @desc    Update the value of rupees per point (Admin only)
 * @route   PATCH /api/v1/wallet/config/point-value
 */
const updatePointValue = asyncHandler(async (req, res) => {
    const { rupeesPerPoint } = req.body;
    if (rupeesPerPoint === undefined || typeof rupeesPerPoint !== 'number' || rupeesPerPoint <= 0) {
        throw new ApiError(400, "A valid 'rupeesPerPoint' value is required.");
    }

    const config = await getOrCreateConfig();
    config.rupeesPerPoint = rupeesPerPoint;
    await config.save();

    return res.status(200).json(new ApiResponse(200, config, "Point value updated successfully."));
});

/**
 * @desc    Add a new reward rule (Admin only)
 * @route   POST /api/v1/wallet/config/rules
 */
const addRewardRule = asyncHandler(async (req, res) => {
    const { minSpend, pointsAwarded } = req.body;
    if (!minSpend || !pointsAwarded) {
        throw new ApiError(400, "Both 'minSpend' and 'pointsAwarded' are required.");
    }
    
    const config = await getOrCreateConfig();

    // Check if a rule for this minSpend already exists
    const existingRule = config.rewardRules.find(rule => rule.minSpend === minSpend);
    if (existingRule) {
        throw new ApiError(409, `A rule for a minimum spend of ${minSpend} already exists.`);
    }

    config.rewardRules.push({ minSpend, pointsAwarded });
    // Sort the rules by minSpend in descending order for consistent logic
    config.rewardRules.sort((a, b) => b.minSpend - a.minSpend);
    await config.save();

    return res.status(201).json(new ApiResponse(201, config, "Reward rule added successfully."));
});

/**
 * @desc    Update an existing reward rule (Admin only)
 * @route   PUT /api/v1/wallet/config/rules/:minSpend
 */
const updateRewardRule = asyncHandler(async (req, res) => {
    const { minSpend: targetMinSpend } = req.params;
    const { minSpend: newMinSpend, pointsAwarded } = req.body;

    if (!newMinSpend && !pointsAwarded) {
        throw new ApiError(400, "Either 'newMinSpend' or 'pointsAwarded' must be provided for update.");
    }

    const config = await WalletConfig.findOne();
    if (!config) {
        throw new ApiError(404, "Wallet configuration not found.");
    }

    const ruleIndex = config.rewardRules.findIndex(rule => rule.minSpend.toString() === targetMinSpend);
    if (ruleIndex === -1) {
        throw new ApiError(404, "Reward rule with the specified minSpend not found.");
    }

    // Update fields if they were provided
    if (newMinSpend) {
        // Check if the new minSpend value conflicts with an existing rule
        const isConflict = config.rewardRules.some((rule, index) => index !== ruleIndex && rule.minSpend === newMinSpend);
        if (isConflict) {
            throw new ApiError(409, `A rule for a minimum spend of ${newMinSpend} already exists.`);
        }
        config.rewardRules[ruleIndex].minSpend = newMinSpend;
    }
    if (pointsAwarded) {
        config.rewardRules[ruleIndex].pointsAwarded = pointsAwarded;
    }

    config.rewardRules.sort((a, b) => b.minSpend - a.minSpend);
    await config.save();

    return res.status(200).json(new ApiResponse(200, config, "Reward rule updated successfully."));
});


/**
 * @desc    Delete a reward rule (Admin only)
 * @route   DELETE /api/v1/wallet/config/rules/:minSpend
 */
const deleteRewardRule = asyncHandler(async (req, res) => {
    const { minSpend } = req.params;
    if (!minSpend) {
        throw new ApiError(400, "minSpend parameter is required.");
    }
    
    const config = await WalletConfig.findOne();
    if (!config) {
        throw new ApiError(404, "Wallet configuration not found.");
    }
    
    const initialLength = config.rewardRules.length;
    // Use pull to remove the subdocument from the array
    config.rewardRules.pull({ minSpend: parseInt(minSpend, 10) });

    if (config.rewardRules.length === initialLength) {
        throw new ApiError(404, `Rule with minimum spend of ${minSpend} not found.`);
    }

    await config.save();

    return res.status(200).json(new ApiResponse(200, config, "Reward rule deleted successfully."));
});


export {
    getWalletConfig,
    getWalletBalance,
    updatePointValue,
    addRewardRule,
    updateRewardRule,
    deleteRewardRule
};