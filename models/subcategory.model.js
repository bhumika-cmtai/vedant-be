import mongoose from 'mongoose';

const subCategory = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'subcategory name is required.'],
        unique: true, 
        trim: true
    }
}, {
    timestamps: true 
});


export const subcategoryModel = mongoose.model('subcategory', subCategory);