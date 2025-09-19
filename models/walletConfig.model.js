import mongoose from "mongoose";

const RewardRuleSchema = new mongoose.Schema({
    minSpend: {
        type: Number,
        required: true,
        unique: true, // Each minimum spend amount should be unique
        min: 1
    },
    pointsAwarded: {
        type: Number,
        required: true,
        min: 1
    }
}, { _id: false }); // _id is not needed for these subdocuments

const walletConfigSchema = new mongoose.Schema({
    rewardRules: {
        type: [RewardRuleSchema],
        default: []
    },
    rupeesPerPoint: {
        type: Number,
        required: true,
        default: 1 // Default: 1 point is worth ₹1
    }
}, { timestamps: true });

export const WalletConfig = mongoose.model("WalletConfig", walletConfigSchema);