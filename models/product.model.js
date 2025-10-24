import mongoose from 'mongoose';
import slugify from 'slugify';

// New: Define the schema for a single review
const ReviewSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    fullName: {
        type: String,
        required: true
    },
    avatar: {
        type: String // URL to user's avatar
    },
    rating: {
        type: Number,
        required: true,
        min: 1,
        max: 5
    },
    comment: {
        type: String,
        required: true,
        trim: true
    },
    images: {
        type: [String], // Array of image URLs
        default: []
    }
}, { timestamps: true });


const VariantSchema = new mongoose.Schema({
    name: { // e.g., "10 ml", "07 days Healing", "41 days Healing"
        type: String,
        required: true,
        trim: true
    },
    sku: { // Stock Keeping Unit for this specific variant
        type: String,
        required: true,
        trim: true,
    },
    price: { // Price for this specific variant
        type: Number,
        required: true,
        min: 0
    },
    sale_price: { // Optional sale price for this variant
        type: Number,
        min: 0
    },
    stock_quantity: { // Stock for this specific variant
        type: Number,
        required: true,
        min: 0,
        default: 0
    },
    volume: { // The volume, if applicable
        type: Number
    },
    duration_in_days: {
        type: Number
    },


    weight: {
        type: Number, // Weight in kg
        required: [true, 'Please provide a weight for the variant.'],
        min: 0
    },
    length: {
        type: Number, // Dimensions in cm
        required: [true, 'Please provide a length for the variant.'],
        min: 0
    },
    breadth: {
        type: Number, // Dimensions in cm
        required: [true, 'Please provide a breadth for the variant.'],
        min: 0
    },
    height: {
        type: Number, // Dimensions in cm
        required: [true, 'Please provide a height for the variant.'],
        min: 0
    }

}, { _id: true });


const ProductSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Please provide a product name'],
        trim: true
    },
    type: {
        type: String,
        required: [true, 'Please provide type of product'],
    },
    slug: {
        type: String,
        unique: true
    },
    description: {
        type: String,
        required: [true, 'Please provide a product description']
    },
    userInputInstructions: {
        type: String,
        trim: true
    },
    price: {
        type: Number,
        min: 0,
    },
    sale_price: {
        type: Number,
        min: 0
    },
    images: {
        type: [String],
        required: true
    },
    video: {
        type: String
    },
    category: {
        type: String,
        required: [true, 'Please provide a category'],
        trim: true
    },
    sub_category: {
        type: String,
        trim: true
    },
    variants: [VariantSchema],
    brand: {
        type: String,
        // required: [true, 'Please provide a brand name'],
        trim: true
    },
    gender: {
        type: String,
        enum: ['Men', 'Women', 'Unisex']
    },
    tags: {
        type: [String],
        default: []
    },
    stock_quantity: {
        type: Number,
        min: 0,
        required: true
    },
    isActive: {
        type: Boolean,
        default: true
    },
    volume: {type: Number},


    weight: {
        type: Number, // Weight in kg
        required: [true, 'Please provide a weight for the variant.'],
        min: 0
    },
    length: {
        type: Number, // Dimensions in cm
        required: [true, 'Please provide a length for the variant.'],
        min: 0
    },
    breadth: {
        type: Number, // Dimensions in cm
        required: [true, 'Please provide a breadth for the variant.'],
        min: 0
    },
    height: {
        type: Number, // Dimensions in cm
        required: [true, 'Please provide a height for the variant.'],
        min: 0
    },

    // --- New Fields for Reviews ---
    reviews: [ReviewSchema], // Array to store all reviews
    averageRating: {
        type: Number,
        default: 0,
        min: 0,
        max: 5,
        set: (val) => Math.round(val * 10) / 10 // Rounds to one decimal place
    },
    numReviews: {
        type: Number,
        default: 0
    },

    minQuantity: {type: Number, default: 1}

}, {
    timestamps: true
});

ProductSchema.pre('save', function(next) {
    if (this.isModified('name')) {
        this.slug = slugify(this.name, { lower: true, strict: true });
    }
    next();
});

ProductSchema.methods.calculateAverageRating = function() {
    if (this.reviews.length === 0) {
        this.averageRating = 0;
        this.numReviews = 0;
    } else {
        const totalRating = this.reviews.reduce((acc, item) => item.rating + acc, 0);
        this.averageRating = totalRating / this.reviews.length;
        this.numReviews = this.reviews.length;
    }
};


const Product = mongoose.model('Product', ProductSchema);
export default Product;