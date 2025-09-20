import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { categoryModal } from '../models/category.model.js';

const createCategory = asyncHandler(async (req, res) => {
    console.log("pahuce yahan")
    const { name } = req.body;

    if (!name || name.trim() === "") {
        throw new ApiError(400, "Category name is required.");
    }

    const existingCategory = await categoryModal.findOne({ name });
    if (existingCategory) {
        throw new ApiError(409, "This category already exists.");
    }

    const category = await categoryModal.create({ name });

    return res.status(201).json(new ApiResponse(201, category, "Category created successfully."));
});

const getAllCategories = asyncHandler(async (req, res) => {
    const categories = await categoryModal.find({}).sort({ name: 1 }); 
    return res.status(200).json(new ApiResponse(200, categories, "All categories fetched."));
});

const getCategoryById = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const category = await categoryModal.findById(id);

    if (!category) {
        throw new ApiError(404, "Category not found.");
    }

    return res.status(200).json(new ApiResponse(200, category, "Category fetched."));
});

const updateCategory = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { name } = req.body;

    if (!name || name.trim() === "") {
        throw new ApiError(400, "New category name is required.");
    }

    const existingCategory = await categoryModal.findOne({ name });
    if (existingCategory && existingCategory._id.toString() !== id) {
        throw new ApiError(409, "Another category with this name already exists.");
    }

    const updatedCategory = await categoryModal.findByIdAndUpdate(
        id,
        { $set: { name } }, 
        { new: true, runValidators: true }
    );

    if (!updatedCategory) {
        throw new ApiError(404, "Category not found.");
    }

    return res.status(200).json(new ApiResponse(200, updatedCategory, "Category updated successfully."));
});

const deleteCategory = asyncHandler(async (req, res) => {
    const { id } = req.params;

    const category = await categoryModal.findByIdAndDelete(id);

    if (!category) {
        throw new ApiError(404, "Category not found.");
    }

    return res.status(200).json(new ApiResponse(200, {}, "Category deleted successfully."));
});

export {
    createCategory,
    getAllCategories,
    getCategoryById,
    updateCategory,
    deleteCategory
};