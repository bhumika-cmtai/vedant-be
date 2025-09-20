import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { ApiError } from "../utils/ApiError.js";
import { WalletConfig } from "../models/walletConfig.model.js";
import { User } from "../models/user.model.js";

// Helper to ensure the config document always exists
const getOrCreateConfig = async () => {
    let config = await WalletConfig.findOne();
    if (!config) {
        config = await WalletConfig.create({ rewardRules: [], rupeesPerPoint: 1 });
    }
    return config;
};

// --- GET APIs (for Users & Admins) ---
const getWalletConfig = asyncHandler(async (req, res) => {
    const config = await getOrCreateConfig();
    return res.status(200).json(new ApiResponse(200, config, "Wallet configuration fetched."));
});

const getWalletBalance = asyncHandler(async (req, res) => {
    const user = await User.findById(req.user._id).select("wallet");
    if (!user) throw new ApiError(404, "User not found");
    return res.status(200).json(new ApiResponse(200, { wallet: user.wallet }, "Wallet balance fetched."));
});

// --- ADMIN-ONLY UPDATE API ---
const setWalletConfig = asyncHandler(async (req, res) => {
    const { rewardRules, rupeesPerPoint } = req.body;

    if (rewardRules === undefined || rupeesPerPoint === undefined || !Array.isArray(rewardRules)) {
        throw new ApiError(400, "A 'rewardRules' array and 'rupeesPerPoint' are required.");
    }
    
    // Validate rules and check for duplicates
    const uniqueMinSpends = new Set();
    for (const rule of rewardRules) {
        if (typeof rule.minSpend !== 'number' || typeof rule.pointsAwarded !== 'number') {
            throw new ApiError(400, "Each rule must have 'minSpend' and 'pointsAwarded' as numbers.");
        }
        if (uniqueMinSpends.has(rule.minSpend)) {
            throw new ApiError(409, `Duplicate 'minSpend' value found: ${rule.minSpend}.`);
        }
        uniqueMinSpends.add(rule.minSpend);
    }
    
    const sortedRules = rewardRules.sort((a, b) => b.minSpend - a.minSpend);

    const config = await WalletConfig.findOneAndUpdate(
        {}, 
        { 
            rewardRules: sortedRules,
            rupeesPerPoint: Number(rupeesPerPoint)
        },
        { new: true, upsert: true }
    );

    return res.status(200).json(new ApiResponse(200, config, "Wallet configuration updated successfully."));
});

export {
    getWalletConfig,
    setWalletConfig, // The only admin update function needed
    getWalletBalance,
};