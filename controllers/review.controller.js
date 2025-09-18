import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { ApiError } from "../utils/ApiError.js";
import Product from "../models/product.model.js";
import mongoose from "mongoose";
import { uploadOnS3 } from "../config/s3.js"; // Import your S3 uploader

const createReview = asyncHandler(async (req, res) => {
    const { productId } = req.params;
    const { rating, comment } = req.body;
    const user = req.user; 

    if (!rating || !comment) {
        throw new ApiError(400, "Rating and comment are required.");
    }

    if (!mongoose.Types.ObjectId.isValid(productId)) {
        throw new ApiError(400, "Invalid Product ID.");
    }
    try{

        
        const product = await Product.findById(productId);
        if (!product) throw new ApiError(404, "Product not found.");
        
        const alreadyReviewed = product.reviews.find(r => r.user.toString() === user._id.toString());
        if (alreadyReviewed) {
            throw new ApiError(400, "You have already submitted a review for this product.");
        }
        
        // --- NEW: Handle review image uploads ---
        let imageUrls = [];
        if (req.files && req.files.images && req.files.images.length > 0) {
            const imageFiles = req.files.images;
            // Limit the number of review images, e.g., to 3
            if (imageFiles.length > 3) {
                throw new ApiError(400, "You can upload a maximum of 3 images for a review.");
            }
            
            const imageUploadPromises = imageFiles.map(file => uploadOnS3(file.path, "reviews"));
            const uploadedImages = await Promise.all(imageUploadPromises);
            imageUrls = uploadedImages.map(result => result?.url).filter(Boolean);
            
            if (imageUrls.length !== imageFiles.length) {
                console.error("Some review images failed to upload.");
                // Decide if you want to throw an error or proceed without the failed images
            }
        }
        
        const review = {
            user: user._id,
            fullName: user.fullName,
            avatar: user.avatar,
            rating: Number(rating),
            comment,
            images: imageUrls, // Add the uploaded image URLs
        };
        
        product.reviews.push(review);
        product.calculateAverageRating();
        await product.save();
        
        return res.status(201).json(new ApiResponse(201, product, "Review submitted successfully."));
    }
    catch(error){
        console.log("---error---")
        console.log(error)
    }
});
    
    const getProductReviews = asyncHandler(async (req, res) => {
        const { productId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(productId)) {
        throw new ApiError(400, "Invalid Product ID.");
    }

    const product = await Product.findById(productId).select("reviews averageRating numReviews");

    if (!product) {
        throw new ApiError(404, "Product not found.");
    }

    return res.status(200).json(new ApiResponse(200, { reviews: product.reviews, averageRating: product.averageRating, numReviews: product.numReviews }, "Reviews fetched successfully."));
});


const deleteReview = asyncHandler(async (req, res) => {
    const { reviewId } = req.params;
    const user = req.user;

    if (!mongoose.Types.ObjectId.isValid(reviewId)) {
        throw new ApiError(400, "Invalid Review ID.");
    }

    const product = await Product.findOne({ "reviews._id": reviewId });

    if (!product) {
        throw new ApiError(404, "Review not found in any product.");
    }

    const review = product.reviews.find(
        (rev) => rev._id.toString() === reviewId
    );
    if (!review) {
        throw new ApiError(404, "Review not found.");
    }
    if (review.user.toString() !== user._id.toString() && user.role !== 'admin') {
        throw new ApiError(403, "You are not authorized to delete this review.");
    }
    product.reviews.pull({ _id: reviewId });
    product.calculateAverageRating();
    await product.save();

    return res.status(200).json(new ApiResponse(200, {}, "Review deleted successfully."));
});


export {
    createReview,
    getProductReviews,
    deleteReview
};