import mongoose from "mongoose";

const productSchema = new mongoose.Schema(
  {
    // --- Core Product Details ---
    name: { 
      type: String, 
      required: true 
    },
    slug: { 
      type: String, 
      required: true, 
      unique: false 
    },
    description: { 
      type: String, 
      required: true 
    },
    // mainImage: { 
    //   type: String, 
    //   required: true 
    // },
    images: { 
      type: [String], 
      default: [] 
    },
    video: { 
      type: [String], 
      default: [] 
    },

    // --- Pricing & Inventory ---
    stock: { 
      type: Number, 
      required: true, 
      default: 0 
    },
    originalPrice: { 
      type: Number, 
      required: true 
    },
    price: { 
      type: Number, 
      required: true 
    }, // This is the discounted/selling price

    // --- Categorization & Filtering ---
    type: {
      type: String,
      required: true,
      // enum: ['jewellery', 'bag', 'gift'],
    },
    gender: {
      type: String,
      // enum: ['Male', 'Female', 'Unisex'],
      required: false,
    },
    tags: {
      type: [String],
      // enum: ['festive', 'party', 'wedding', 'gift', 'casual', 'everyday'],
      default: []
    },
    color: { 
      type: [String], 
      default: [] 
    },
    material: {
      type: String,
      // Example materials
      // enum: ['stainless steel', 'gold', 'leather', 'cloth', 'silver-plated'], 
    },

    // --- Admin Specific Fields for Packaging ---
    adminPackagingWeight: {
      type: Number,
      required: [true, "Admin packaging weight is required"],
    },
    adminPackagingDimension: {
      length: { type: Number, required: true },
      breadth: { type: Number, required: true },
      height: { type: Number, required: true },
    },

    dimensions: {
      type: String, 
      // e.g., "Length: 18cm, Pendant: 2cm x 1.5cm"
      // This field will only be relevant if type is 'jewellery'
      default: undefined,
    },
    // --- JEWELLERY Specific Fields ---
    stones: {
      type: [String],
      // This field will only be relevant if type is 'jewellery'
      // default: undefined, 
    },
    jewelleryCategory: {
      type: String,
      // enum: [null, 'Rings', 'Earrings', 'Necklaces', 'Bracelets', 'Bangles'],
      // This field will only be relevant if type is 'jewellery'
      default: null,
    },
    materialType: { // Renamed from category2 for clarity
      type: String,
      // enum: [null, 'artificial', 'gold', 'silver'],
      // This field will only be relevant if type is 'jewellery'
      default: null,
    },

    // --- BAG Specific Fields ---
    size: {
      type: [String],
      // enum: ['sm', 'medium', 'lg'],
      // This field will only be relevant if type is 'bag'
      default: undefined,
    },
  },
  { 
    timestamps: true,
    // Enable virtuals for JSON output
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

// Create a virtual 'id' field that gets the value of '_id'
productSchema.virtual('id').get(function() {
  return this._id.toHexString();
});

export const Product = mongoose.model("Product", productSchema);