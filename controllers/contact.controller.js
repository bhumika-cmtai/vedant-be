import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { 
    uploadContactImageOnCloudinary, 
    deleteFromCloudinary,
    getPublicIdFromUrl
} from "../config/cloudinary.js";
import { Contact } from "../models/contact.model.js";
import mongoose from "mongoose";

// @desc    Submit a new contact inquiry (Public)
// @route   POST /api/v1/contact
const submitInquiry = asyncHandler(async (req, res) => {
    const { fullName, email, phoneNumber, message, size } = req.body;

    if ([fullName, email, message].some((field) => !field || field.trim() === "")) {
        throw new ApiError(400, "Full Name, Email, and Message are required.");
    }

    const referenceImageLocalPath = req.file?.path;
    let imageUploadResult = null;
    if (referenceImageLocalPath) {
        // Use the dedicated uploader for contact images
        imageUploadResult = await uploadContactImageOnCloudinary(referenceImageLocalPath);
    }

    const newInquiry = await Contact.create({
        fullName,
        email,
        phoneNumber,
        message,
        size,
        referenceImage: imageUploadResult?.url || "",
    });

    if (!newInquiry) {
        throw new ApiError(500, "Something went wrong while saving your inquiry.");
    }

    return res
        .status(201)
        .json(new ApiResponse(201, newInquiry, "Inquiry submitted successfully. We will get back to you shortly."));
});

// @desc    Get all inquiries (Admin)
// @route   GET /api/v1/contact/admin
const getAllInquiries = asyncHandler(async (req, res) => {
    const { status } = req.query; // Get status from query params like "?status=New"

    const filter = {}; // Start with an empty filter

    // If a valid status is provided in the query, add it to the filter object
    // This check prevents filtering by arbitrary query params
    if (status && ["New", "Contacted", "Completed", "Rejected"].includes(status)) {
        filter.status = status;
    }

    // Pass the filter object to the find method. If empty, it returns all documents.
    const inquiries = await Contact.find(filter).sort({ createdAt: -1 });
    
    return res
        .status(200)
        .json(new ApiResponse(200, inquiries, "All inquiries fetched successfully."));
});


// @desc    Get a single inquiry by ID (Admin)
// @route   GET /api/v1/contact/admin/:inquiryId
const getInquiryById = asyncHandler(async (req, res) => {
    const { inquiryId } = req.params;
    if (!mongoose.isValidObjectId(inquiryId)) {
        throw new ApiError(400, "Invalid inquiry ID format.");
    }
    
    const inquiry = await Contact.findById(inquiryId);
    if (!inquiry) {
        throw new ApiError(404, "Inquiry not found.");
    }

    return res.status(200).json(new ApiResponse(200, inquiry, "Inquiry fetched successfully."));
});

// @desc    Update an inquiry's details (Admin)
// @route   PUT /api/v1/contact/admin/:inquiryId
const updateInquiry = asyncHandler(async (req, res) => {
    const { inquiryId } = req.params;
    const { fullName, email, phoneNumber, message, size, status } = req.body;

    if (!mongoose.isValidObjectId(inquiryId)) {
        throw new ApiError(400, "Invalid inquiry ID format.");
    }

    const inquiry = await Contact.findById(inquiryId);
    if (!inquiry) {
        throw new ApiError(404, "Inquiry not found.");
    }

    // Prepare updates
    inquiry.fullName = fullName || inquiry.fullName;
    inquiry.email = email || inquiry.email;
    inquiry.phoneNumber = phoneNumber || inquiry.phoneNumber;
    inquiry.message = message || inquiry.message;
    inquiry.size = size || inquiry.size;
    
    if (status && ["New", "Contacted", "Completed", "Rejected"].includes(status)) {
        inquiry.status = status;
    }

    // Handle new image upload
    const referenceImageLocalPath = req.file?.path;
    if (referenceImageLocalPath) {
        // 1. Delete the old image from Cloudinary if it exists
        if (inquiry.referenceImage) {
            const publicId = getPublicIdFromUrl(inquiry.referenceImage);
            if (publicId) await deleteFromCloudinary(publicId, "image");
        }

        // 2. Upload the new image
        const imageUploadResult = await uploadContactImageOnCloudinary(referenceImageLocalPath);
        if (!imageUploadResult) {
            throw new ApiError(500, "Failed to upload new reference image.");
        }
        inquiry.referenceImage = imageUploadResult.url;
    }

    const updatedInquiry = await inquiry.save();

    return res
        .status(200)
        .json(new ApiResponse(200, updatedInquiry, "Inquiry updated successfully."));
});

// @desc    Delete an inquiry (Admin)
// @route   DELETE /api/v1/contact/admin/:inquiryId
const deleteInquiry = asyncHandler(async (req, res) => {
    const { inquiryId } = req.params;

    if (!mongoose.isValidObjectId(inquiryId)) {
        throw new ApiError(400, "Invalid inquiry ID format.");
    }
    
    // Find the document first to get the image URL
    const inquiryToDelete = await Contact.findById(inquiryId);

    if (!inquiryToDelete) {
        throw new ApiError(404, "Inquiry not found.");
    }

    // If a reference image exists, delete it from Cloudinary
    if (inquiryToDelete.referenceImage) {
        const publicId = getPublicIdFromUrl(inquiryToDelete.referenceImage);
        if (publicId) {
            await deleteFromCloudinary(publicId, 'image');
        }
    }

    // Now, delete the document from the database
    await Contact.findByIdAndDelete(inquiryId);

    return res.status(200).json(new ApiResponse(200, {}, "Inquiry deleted successfully."));
});

export {
    submitInquiry,
    getAllInquiries,
    getInquiryById,
    updateInquiry,
    deleteInquiry
};