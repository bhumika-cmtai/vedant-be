// controllers/grievance.controller.js
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { ApiError } from "../utils/ApiError.js";
import { Grievance } from "../models/grievance.model.js";
import { generateTicketId } from "../utils/ticketIdGenerator.js"; // Import the utility

// @desc    Create a new grievance
// @route   POST /api/v1/grievances
// @access  Authenticated User
const createGrievance = asyncHandler(async (req, res) => {
    const { fullName, email, phoneNumber, orderId, natureOfGrievance, description } = req.body;

    // Basic validation
    if (!fullName || !email || !natureOfGrievance || !description) {
        throw new ApiError(400, "Full Name, Email, Nature of Grievance, and Description are required.");
    }

    const ticketId = generateTicketId(); // Generate a unique ticket ID

    const grievance = await Grievance.create({
        userId: req.user._id, // Get user ID from authenticated request
        ticketId,
        fullName,
        email,
        phoneNumber,
        orderId,
        natureOfGrievance,
        description,
        status: "Pending", // Default status upon creation
    });

    if (!grievance) {
        throw new ApiError(500, "Failed to submit grievance. Please try again.");
    }

    res.status(201).json(new ApiResponse(201, grievance, `Grievance submitted successfully. Your ticket ID is ${ticketId}`));
});

// @desc    Get all grievances (Admin only)
// @route   GET /api/v1/grievances
// @access  Admin
const getAllGrievances = asyncHandler(async (req, res) => {
    // Populate userId to show which user submitted it, but only their name and email
    const grievances = await Grievance.find().populate("userId", "fullName email").sort({ createdAt: -1 });

    res.status(200).json(new ApiResponse(200, grievances, "All grievances fetched successfully."));
});

// @desc    Get user's own grievances
// @route   GET /api/v1/grievances/my
// @access  Authenticated User
const getMyGrievances = asyncHandler(async (req, res) => {
    const myGrievances = await Grievance.find({ userId: req.user._id }).sort({ createdAt: -1 });

    res.status(200).json(new ApiResponse(200, myGrievances, "Your grievances fetched successfully."));
});

// @desc    Get a single grievance by ID (User can view their own, Admin can view any)
// @route   GET /api/v1/grievances/:id
// @access  Authenticated User / Admin
const getGrievanceById = asyncHandler(async (req, res) => {
    const { id } = req.params;

    const grievance = await Grievance.findById(id).populate("userId", "fullName email");

    if (!grievance) {
        throw new ApiError(404, "Grievance not found.");
    }

    // Authorization check: Ensure user can only view their own grievance unless they are an admin
    if (grievance.userId.toString() !== req.user._id.toString() && !req.user.isAdmin) {
        // Assuming req.user.isAdmin is set by adminMiddleware or authMiddleware based on user role
        throw new ApiError(403, "You are not authorized to view this grievance.");
    }

    res.status(200).json(new ApiResponse(200, grievance, "Grievance details fetched successfully."));
});

// @desc    Update grievance status and/or admin response (Admin only)
// @route   PUT /api/v1/grievances/:id
// @access  Admin
const updateGrievance = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { status, adminResponse } = req.body; // Admin can update status and adminResponse

    if (!status && !adminResponse) {
        throw new ApiError(400, "Please provide 'status' or 'adminResponse' to update.");
    }

    const grievance = await Grievance.findById(id);

    if (!grievance) {
        throw new ApiError(404, "Grievance not found.");
    }

    if (status) {
        // Validate against allowed enum values for status
        const validStatuses = ["Pending", "In Progress", "Resolved", "Closed", "Rejected"];
        if (!validStatuses.includes(status)) {
            throw new ApiError(400, `Invalid status provided. Allowed statuses: ${validStatuses.join(", ")}`);
        }
        grievance.status = status;
    }

    if (adminResponse) {
        grievance.adminResponse = adminResponse;
    }

    await grievance.save({ validateBeforeSave: true }); // Re-validate to ensure data integrity

    res.status(200).json(new ApiResponse(200, grievance, "Grievance updated successfully."));
});

export {
    createGrievance,
    getAllGrievances,
    getMyGrievances,
    getGrievanceById,
    updateGrievance,
};