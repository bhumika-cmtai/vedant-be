import mongoose from 'mongoose';
import slugify from 'slugify';

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
        // unique: true, 
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
        // required: function() { return !this.variants || this.variants.length === 0; }
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
}, { 
    timestamps: true 
});

ProductSchema.pre('save', function(next) {
    if (this.isModified('name')) {
        this.slug = slugify(this.name, { lower: true, strict: true });
    }
    next();
});

const Product = mongoose.model('Product', ProductSchema);
export default Product;