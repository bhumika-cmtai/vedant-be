import mongoose from 'mongoose';

const Category = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Category name is required.'],
        unique: true, 
        trim: true
    }
}, {
    timestamps: true 
});


export const categoryModal = mongoose.model('Category', Category);