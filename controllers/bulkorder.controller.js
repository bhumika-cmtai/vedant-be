import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { BulkOrder } from '../models/bulkorder.model.js';
import { Product } from '../models/product.model.js'; // Assuming you have a Product model
import mongoose from 'mongoose';

/**
 * @desc    Create a new bulk order inquiry
 * @route   POST /api/v1/bulk-orders
 * @access  Public
 */
const createBulkOrder = asyncHandler(async (req, res) => {
    const { productId, name, email, phone, quantity, message } = req.body;

    // --- Validation ---
    if (!productId || !name || !email || !phone || !quantity) {
        throw new ApiError(400, 'Product, name, email, phone, and quantity are required.');
    }

    if (!mongoose.isValidObjectId(productId)) {
        throw new ApiError(400, 'Invalid Product ID format.');
    }
    
    const productExists = await Product.findById(productId);
    if (!productExists) {
        throw new ApiError(404, 'Product not found.');
    }

    // --- Create Inquiry ---
    const newInquiry = await BulkOrder.create({
        product: productId,
        name,
        email,
        phone,
        quantity,
        message,
    });

    if (!newInquiry) {
        throw new ApiError(500, 'Something went wrong while creating the inquiry.');
    }

    return res
        .status(201)
        .json(new ApiResponse(201, newInquiry, 'Bulk order inquiry submitted successfully.'));
});


/**
 * @desc    Get all bulk order inquiries (Admin)
 * @route   GET /api/v1/bulk-orders
 * @access  Admin
 */
const getAllBulkOrders = asyncHandler(async (req, res) => {
    // 1. Get page and limit from query, with default values
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const skip = (page - 1) * limit;

    // 2. Fetch the inquiries for the current page and the total count concurrently
    const [inquiries, totalInquiries] = await Promise.all([
        BulkOrder.find({})
            .populate('product', 'name price images')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit),
        BulkOrder.countDocuments({})
    ]);

    // 3. Calculate total pages
    const totalPages = Math.ceil(totalInquiries / limit);

    // 4. Return a structured response with pagination data
    const data = {
        inquiries,
        currentPage: page,
        totalPages,
        totalInquiries,
    };

    return res
        .status(200)
        .json(new ApiResponse(200, data, 'All bulk order inquiries fetched successfully.'));
});


/**
 * @desc    Get a single bulk order inquiry by ID (Admin)
 * @route   GET /api/v1/bulk-orders/:id
 * @access  Admin
 */
const getBulkOrderById = asyncHandler(async (req, res) => {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
        throw new ApiError(400, 'Invalid Inquiry ID format.');
    }
    
    const inquiry = await BulkOrder.findById(id).populate('product');

    if (!inquiry) {
        throw new ApiError(404, 'Inquiry not found.');
    }

    return res
        .status(200)
        .json(new ApiResponse(200, inquiry, 'Inquiry fetched successfully.'));
});


/**
 * @desc    Update a bulk order inquiry's status (Admin)
 * @route   PATCH /api/v1/bulk-orders/:id
 * @access  Admin
 */
const updateBulkOrderStatus = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;

    if (!mongoose.isValidObjectId(id)) {
        throw new ApiError(400, 'Invalid Inquiry ID format.');
    }
    
    if (!status || !['Pending', 'Contacted', 'Resolved', 'Cancelled'].includes(status)) {
        throw new ApiError(400, 'A valid status is required.');
    }

    const updatedInquiry = await BulkOrder.findByIdAndUpdate(
        id,
        { $set: { status } },
        { new: true, runValidators: true }
    ).populate('product', 'name price images'); // ADD THIS LINE - populate the product data

    if (!updatedInquiry) {
        throw new ApiError(404, 'Inquiry not found.');
    }

    return res
        .status(200)
        .json(new ApiResponse(200, updatedInquiry, 'Inquiry status updated successfully.'));
});



/**
 * @desc    Delete a bulk order inquiry (Admin)
 * @route   DELETE /api/v1/bulk-orders/:id
 * @access  Admin
 */
const deleteBulkOrder = asyncHandler(async (req, res) => {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
        throw new ApiError(400, 'Invalid Inquiry ID format.');
    }
    
    const deletedInquiry = await BulkOrder.findByIdAndDelete(id);

    if (!deletedInquiry) {
        throw new ApiError(404, 'Inquiry not found.');
    }

    return res
        .status(200)
        .json(new ApiResponse(200, {}, 'Inquiry deleted successfully.'));
});


export {
    createBulkOrder,
    getAllBulkOrders,
    getBulkOrderById,
    updateBulkOrderStatus,
    deleteBulkOrder
};