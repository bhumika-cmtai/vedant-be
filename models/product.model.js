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
    }
}, { timestamps: true });


const VariantSchema = new mongoose.Schema({
    size: {
        type: String,
        required: true,
        trim: true
    },
    color: {
        type: String,
        required: true,
        trim: true
    },
    price: {
        type: Number,
        required: true,
        min: 0
    },
    sale_price: {
        type: Number,
        min: 0
    },
    stock_quantity: {
        type: Number,
        required: true,
        min: 0,
        default: 0
    },
    sku_variant: {
        type: String,
        required: true,
        trim: true
    },
    images: [String]
});

const ProductSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Please provide a product name'],
        trim: true
    },
    slug: {
        type: String,
        unique: true
    },
    description: {
        type: String,
        required: [true, 'Please provide a product description']
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
    brand: {
        type: String,
        required: [true, 'Please provide a brand name'],
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
    variants: [VariantSchema],
    stock_quantity: {
        type: Number,
        min: 0,
        required: true
    },
    fit: { type: String },
    careInstructions: { type: String },
    sleeveLength: { type: String },
    neckType: { type: String },
    pattern: { type: String },
    isActive: {
        type: Boolean,
        default: true
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
    }

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