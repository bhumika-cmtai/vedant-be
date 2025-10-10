import mongoose, { Schema } from "mongoose";

const blogSchema = new Schema(
    {
        title: {
            type: String,
            required: [true, "Title is required"],
            trim: true,
            index: true, 
        },
        slug: {
            type: String,
            required: [true, "Slug is required"],
            unique: true,
            lowercase: true,
            trim: true,
        },
        content: {
            type: String,
            required: [true, "Content is required"],
        },
        excerpt: {
            type: String, 
            required: [true, "Excerpt is required"],
            trim: true,
        },
        featuredImage: {
            type: String,
            required: [true, "Featured image is required"],
        },
        author: {
            type: Schema.Types.ObjectId,
            ref: "User", 
            required: true,
        },
        category: {
            type: String,
            required: [true, "Category is required"],
            trim: true,
            index: true,
        },
        tags: {
            type: [String], 
            default: [],
        },
        status: {
            type: String,
            enum: ["published", "draft"], 
            default: "draft",
        },
        views: {
            type: Number,
            default: 0,
        },
    },
    {
        timestamps: true, 
    }
);

export const Blog = mongoose.model("Blog", blogSchema);