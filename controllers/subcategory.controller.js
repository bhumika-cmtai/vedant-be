import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { subcategoryModel } from '../models/subcategory.model.js';

const createSubcategory = asyncHandler(async (req, res) => {
    console.log("pahuce yahan")
    const { name } = req.body;

    if (!name || name.trim() === "") {
        throw new ApiError(400, "subcategory name is required.");
    }

    const existingsubcategory = await subcategoryModel.findOne({ name });
    if (existingsubcategory) {
        throw new ApiError(409, "This subcategory already exists.");
    }

    const subcategory = await subcategoryModel.create({ name });

    return res.status(201).json(new ApiResponse(201, subcategory, "subcategory created successfully."));
});

const getAllsubategories = asyncHandler(async (req, res) => {
    const categories = await subcategoryModel.find({}).sort({ name: 1 }); 
    return res.status(200).json(new ApiResponse(200, categories, "All subcategories fetched."));
});

const getsubcategoryById = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const category = await subcategoryModel.findById(id);

    if (!category) {
        throw new ApiError(404, "subcategory not found.");
    }

    return res.status(200).json(new ApiResponse(200, category, "subcategory fetched."));
});

const updatesubCategory = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { name } = req.body;

    if (!name || name.trim() === "") {
        throw new ApiError(400, "New category name is required.");
    }

    const existingCategory = await subcategoryModel.findOne({ name });
    if (existingCategory && existingCategory._id.toString() !== id) {
        throw new ApiError(409, "Another subcategory with this name already exists.");
    }

    const updatedCategory = await subcategoryModel.findByIdAndUpdate(
        id,
        { $set: { name } }, 
        { new: true, runValidators: true }
    );

    if (!updatedCategory) {
        throw new ApiError(404, "subcategory not found.");
    }

    return res.status(200).json(new ApiResponse(200, updatedCategory, "subcategory updated successfully."));
});

const deletesubcategory = asyncHandler(async (req, res) => {
    const { id } = req.params;

    const category = await subcategoryModel.findByIdAndDelete(id);

    if (!category) {
        throw new ApiError(404, "subcategory not found.");
    }

    return res.status(200).json(new ApiResponse(200, {}, "subcategory deleted successfully."));
});

export {
    createSubcategory,
    getAllsubategories,
    getsubcategoryById,
    updatesubCategory,
    deletesubcategory
};