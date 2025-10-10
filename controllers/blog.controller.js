import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { Blog } from "../models/blog.model.js";
import { uploadOnS3, deleteFromS3, getObjectKeyFromUrl } from "../config/s3.js";

const createBlogPost = asyncHandler(async (req, res) => {
    const { title, content, excerpt, category, tags, status } = req.body;
    
    const featuredImageLocalPath = req.file?.path;

    if (!featuredImageLocalPath) {
        throw new ApiError(400, "Featured image is required");
    }

    if ([title, content, excerpt, category].some(field => !field?.trim())) {
        throw new ApiError(400, "All required fields must be filled");
    }
    
    const s3Response = await uploadOnS3(featuredImageLocalPath, "blog-images"); // "blog-images" फोल्डर में अपलोड करें
    if (!s3Response || !s3Response.url) {
        throw new ApiError(500, "Failed to upload image to S3");
    }

    const generateSlug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    const existingBlog = await Blog.findOne({ slug: generateSlug });
    if (existingBlog) {
        await deleteFromS3(s3Response.key);
        throw new ApiError(409, "A blog with this title already exists. Please choose a different title.");
    }
    // console.log("----here is clear---")

    
    const blog = await Blog.create({
        title,
        slug: generateSlug,
        content,
        excerpt,
        featuredImage: s3Response.url, 
        author: req.user._id,
        category,
        tags: tags ? tags.split(',').map(tag => tag.trim()) : [],
        status,
    });
    // console.log("----end---")
    // console.log(blog)
    if (!blog) {
        await deleteFromS3(s3Response.key);
        throw new ApiError(500, "Something went wrong while creating the blog post");
    }

    return res.status(201).json(new ApiResponse(201, blog, "Blog post created successfully"));
});

const getAllBlogs = asyncHandler(async (req, res) => {
    const { page = 1, limit = 10, category, search } = req.query;

    const query = { };

    if (category) {
        query.category = category;
    }
    
    if (search) {
        query.$or = [
            { title: { $regex: search, $options: 'i' } },
            { excerpt: { $regex: search, $options: 'i' } },
        ];
    }
    
    const blogs = await Blog.find(query)
        .populate("author", "fullName avatar") 
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(parseInt(limit));

    const totalBlogs = await Blog.countDocuments(query);
    // console.log(blogs)

    const responseData = {
        blogs,
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalBlogs / limit),
        totalBlogs,
    };
    
    return res.status(200).json(new ApiResponse(200, responseData, "Published blogs fetched successfully"));
});

const getAllPublishedBlogs = asyncHandler(async (req, res) => {
    const { page = 1, limit = 10, category, search } = req.query;

    const query = { status: "published" };

    if (category) {
        query.category = category;
    }
    
    if (search) {
        query.$or = [
            { title: { $regex: search, $options: 'i' } },
            { excerpt: { $regex: search, $options: 'i' } },
        ];
    }
    
    const blogs = await Blog.find(query)
        .populate("author", "fullName avatar") 
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(parseInt(limit));

    const totalBlogs = await Blog.countDocuments(query);
    console.log(blogs)

    const responseData = {
        blogs,
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalBlogs / limit),
        totalBlogs,
    };
    
    return res.status(200).json(new ApiResponse(200, responseData, "Published blogs fetched successfully"));
});

const getBlogBySlug = asyncHandler(async (req, res) => {
    const { slug } = req.params;

    const blog = await Blog.findOneAndUpdate(
        { slug, status: "published" },
        { $inc: { views: 1 } }, 
        { new: true }
    ).populate("author", "fullName avatar");
    
    if (!blog) {
        throw new ApiError(404, "Blog post not found or not published");
    }

    return res.status(200).json(new ApiResponse(200, blog, "Blog post fetched successfully"));
});

const updateBlogPost = asyncHandler(async (req, res) => {
    const { blogId } = req.params;
    const { title, content, excerpt, category, tags, status } = req.body;
    // console.log("---blogId---")
    // console.log(blogId)
    // console.log("--- REQUEST BODY (TEXT FIELDS) ---");
    // console.log(req.body);
    
    const blog = await Blog.findById(blogId);

    if (!blog) {
        throw new ApiError(404, "Blog post not found");
    }
    
    if (blog.author.toString() !== req.user._id.toString()) {
        throw new ApiError(403, "You are not authorized to update this blog post");
    }

    const updateData = { title, content, excerpt, category, tags, status };

    if (req.file) {
        const newImageLocalPath = req.file.path;
        
        const s3Response = await uploadOnS3(newImageLocalPath, "blog-images");
        if (!s3Response || !s3Response.url) {
            throw new ApiError(500, "Failed to upload the new image to S3");
        }
        
        if (blog.featuredImage) {
            const oldObjectKey = getObjectKeyFromUrl(blog.featuredImage);
            await deleteFromS3(oldObjectKey);
        }
        
        updateData.featuredImage = s3Response.url;
    }

    const updatedBlog = await Blog.findByIdAndUpdate(
        blogId,
        { $set: updateData },
        { new: true }
    );

    return res.status(200).json(new ApiResponse(200, updatedBlog, "Blog post updated successfully"));
});


const deleteBlogPost = asyncHandler(async (req, res) => {
    const { blogId } = req.params;

    const blog = await Blog.findById(blogId);

    if (!blog) {
        throw new ApiError(404, "Blog post not found");
    }
    
    if (blog.author.toString() !== req.user._id.toString()) {
        throw new ApiError(403, "You are not authorized to delete this blog post");
    }

    if (blog.featuredImage) {
        const objectKey = getObjectKeyFromUrl(blog.featuredImage);
        await deleteFromS3(objectKey);
    }

    await Blog.findByIdAndDelete(blogId);
    
    return res.status(200).json(new ApiResponse(200, {}, "Blog post deleted successfully"));
});


export {
    createBlogPost,
    getAllBlogs,
    getAllPublishedBlogs,
    getBlogBySlug,
    updateBlogPost,
    deleteBlogPost,
};
