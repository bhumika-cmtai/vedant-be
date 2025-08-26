import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { ApiError } from "../utils/ApiError.js";
import { Order } from "../models/order.model.js";
import { User } from "../models/user.model.js";
import { Product } from "../models/product.model.js";
import { deleteFromCloudinary, getPublicIdFromUrl, uploadOnCloudinary } from "../config/cloudinary.js";
import mongoose from "mongoose";
import slugify from "slugify";

const getAdminDashboardStats = asyncHandler(async (req, res) => {
  const [totalSalesData, newOrdersCount, activeUsersCount] = await Promise.all([
    Order.aggregate([
      { $match: { orderStatus: "Completed" } },
      { $group: { _id: null, totalSales: { $sum: "$totalPrice" } } },
    ]),
    Order.countDocuments({ orderStatus: { $in: ["Pending", "Processing"] } }),
    User.countDocuments({ role: "user" }),
  ]);
  const stats = {
    totalSales: totalSalesData[0]?.totalSales || 0,
    newOrders: newOrdersCount,
    activeUsers: activeUsersCount,
  };
  return res
    .status(200)
    .json(new ApiResponse(200, stats, "Admin dashboard data fetched"));
});

const getSalesOverview = asyncHandler(async (req, res) => {
  const twelveMonthsAgo = new Date();
  twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);
  const salesData = await Order.aggregate([
    {
      $match: {
        createdAt: { $gte: twelveMonthsAgo },
        orderStatus: "Completed",
      },
    },
    {
      $group: {
        _id: { month: { $month: "$createdAt" } },
        sales: { $sum: "$totalPrice" },
      },
    },
    { $sort: { "_id.month": 1 } },
  ]);
  const monthNames = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  const monthlySales = Array.from({ length: 12 }, (_, i) => ({
    name: monthNames[i],
    sales: 0,
  }));
  salesData.forEach((item) => {
    monthlySales[item._id.month - 1].sales = item.sales;
  });
  return res
    .status(200)
    .json(new ApiResponse(200, monthlySales, "Monthly sales overview fetched"));
});

const getRecentAdminOrders = asyncHandler(async (req, res) => {
  const recentOrders = await Order.find({})
    .populate("user", "name")
    .sort({ createdAt: -1 })
    .limit(3)
    .select("user totalPrice orderStatus")
    .lean();
  return res
    .status(200)
    .json(new ApiResponse(200, recentOrders, "Recent admin orders fetched"));
});

//CREATE PRODUCT



const createProduct = asyncHandler(async (req, res) => {
  // --- 1. Destructure Request Body ---
  const {
    name,
    description,
    price,
    originalPrice,
    stock,
    type,
    gender,
    tags,
    color,
    material,
    adminPackagingWeight,
    adminPackagingDimension, // This will be an object if sent correctly
    dimensions, // Correctly named to match schema
    stones,
    jewelleryCategory,
    materialType,
    size,
  } = req.body;

  // --- 2. Basic Validation ---
  if (!name || !description || !price || !originalPrice || !stock || !type) {
    throw new ApiError(400, "Name, description, price, stock, and type are required fields.");
  }
  if (!adminPackagingWeight || !adminPackagingDimension?.length || !adminPackagingDimension?.breadth || !adminPackagingDimension?.height) {
      throw new ApiError(400, "Admin packaging weight and dimensions (length, breadth, height) are required.");
  }

  // --- 3. Handle File Uploads ---
  const imageFiles = req.files?.images;
  const videoFile = req.files?.video?.[0];

  if (!imageFiles || imageFiles.length === 0) {
    throw new ApiError(400, "At least one product image is required.");
  }

  // Upload images to Cloudinary in parallel for efficiency
  const imageUploadPromises = imageFiles.map(file => uploadOnCloudinary(file.path));
  const uploadedImages = await Promise.all(imageUploadPromises);
  const imageUrls = uploadedImages.map(result => result?.url).filter(Boolean);

  if (imageUrls.length !== imageFiles.length) {
    throw new ApiError(500, "An error occurred while uploading one or more images.");
  }

  // Upload video if it exists
  let videoUrl = null;
  if (videoFile) {
    const videoUploadResult = await uploadOnCloudinary(videoFile.path);
    if (!videoUploadResult?.url) {
      throw new ApiError(500, "Failed to upload video.");
    }
    videoUrl = videoUploadResult.url;
  }

  // --- 4. Prepare Product Data for Database ---
  const productData = {
    name,
    slug: slugify(name, { lower: true, strict: true }),
    description,
    mainImage: imageUrls[0],
    images: imageUrls,
    video: videoUrl ? [videoUrl] : [],
    stock: parseInt(stock, 10),
    originalPrice: parseFloat(originalPrice),
    price: parseFloat(price),
    type,
    gender,
    tags: tags ? String(tags).split(',').map(tag => tag.trim()) : [],
    color: color ? String(color).split(',').map(c => c.trim()) : [],
    material,
    adminPackagingWeight: parseFloat(adminPackagingWeight),
    adminPackagingDimension: {
      length: parseFloat(adminPackagingDimension.length),
      breadth: parseFloat(adminPackagingDimension.breadth),
      height: parseFloat(adminPackagingDimension.height),
    },
  };

  // --- 5. Add Type-Specific Fields Conditionally ---
  if (type === 'jewellery') {
    productData.stones = stones ? String(stones).split(',').map(s => s.trim()) : [];
    productData.dimensions = dimensions;
    productData.jewelleryCategory = jewelleryCategory;
    productData.materialType = materialType;
  } else if (type === 'bag') {
    productData.size = size ? String(size).split(',').map(s => s.trim()) : [];
  }

  // --- 6. Create Product in DB ---
  const product = await Product.create(productData);

  if (!product) {
    throw new ApiError(500, "Something went wrong while creating the product.");
  }

  // --- 7. Send Success Response ---
  return res
    .status(201)
    .json(new ApiResponse(201, product, "Product created successfully."));
});

// UPDATE PRODUCT

const updateProduct = asyncHandler(async (req, res) => {
  const { productId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(productId)) {
    throw new ApiError(400, "Invalid product ID format.");
  }

  const product = await Product.findById(productId);
  if (!product) {
    throw new ApiError(404, "Product not found.");
  }

  // --- 1. DESTRUCTURE ALL POSSIBLE FIELDS ---
  // We destructure the nested dimension fields directly.
  const {
    name, description, price, originalPrice, stock, type, gender, tags, color,
    material, adminPackagingWeight, dimensions, stones, jewelleryCategory,
    materialType, size,
    // This is the key change to destructure the nested fields
    'adminPackagingDimension[length]': pkgLength,
    'adminPackagingDimension[breadth]': pkgBreadth,
    'adminPackagingDimension[height]': pkgHeight,
  } = req.body;

  const updateData = {};

  // --- 2. BUILD UPDATE OBJECT, CHECKING IF EACH FIELD EXISTS ---
  // This prevents accidentally overwriting existing values with 'undefined'.
  if (name !== undefined) updateData.name = name;
  if (description !== undefined) updateData.description = description;
  if (price !== undefined) updateData.price = parseFloat(price);
  if (originalPrice !== undefined) updateData.originalPrice = parseFloat(originalPrice);
  if (stock !== undefined) updateData.stock = parseInt(stock, 10);
  if (type !== undefined) updateData.type = type;
  if (gender !== undefined) updateData.gender = gender;
  if (tags !== undefined) updateData.tags = String(tags).split(',').map(t => t.trim());
  if (color !== undefined) updateData.color = String(color).split(',').map(c => c.trim());
  if (material !== undefined) updateData.material = material;
  if (adminPackagingWeight !== undefined) updateData.adminPackagingWeight = parseFloat(adminPackagingWeight);

  // --- 3. RECONSTRUCT THE NESTED OBJECT ---
  // Check if at least one dimension field was sent to avoid creating an incomplete object.
  if (pkgLength !== undefined || pkgBreadth !== undefined || pkgHeight !== undefined) {
    updateData.adminPackagingDimension = {
      // Use logical OR to fall back to the existing value if a field is not provided.
      length: pkgLength !== undefined ? parseFloat(pkgLength) : product.adminPackagingDimension.length,
      breadth: pkgBreadth !== undefined ? parseFloat(pkgBreadth) : product.adminPackagingDimension.breadth,
      height: pkgHeight !== undefined ? parseFloat(pkgHeight) : product.adminPackagingDimension.height,
    };
  }

  // Handle type-specific fields
  if (type === 'jewellery') {
    if (dimensions !== undefined) updateData.dimensions = dimensions;
    if (stones !== undefined) updateData.stones = String(stones).split(',').map(s => s.trim());
    if (jewelleryCategory !== undefined) updateData.jewelleryCategory = jewelleryCategory;
    if (materialType !== undefined) updateData.materialType = materialType;
  } else if (type === 'bag') {
    if (size !== undefined) updateData.size = String(size).split(',').map(s => s.trim());
  }

  // --- 4. HANDLE FILE UPLOADS (Unchanged) ---
  const imageFiles = req.files?.images;
  if (imageFiles && imageFiles.length > 0) {
    // Your existing file handling logic is correct.
    const uploadedImages = await Promise.all(imageFiles.map(file => uploadOnCloudinary(file.path)));
    const newImageUrls = uploadedImages.map(result => result?.url).filter(Boolean);
    if (newImageUrls.length > 0) {
      await Promise.all(product.images.map(getPublicIdFromUrl).map(id => deleteFromCloudinary(id, "image")));
      updateData.images = newImageUrls;
    }
  }

  const videoFile = req.files?.video?.[0];
  if (videoFile) {
    const videoUploadResult = await uploadOnCloudinary(videoFile.path);
    if (videoUploadResult?.url) {
      if (product.video && product.video.length > 0) {
        await deleteFromCloudinary(getPublicIdFromUrl(product.video[0]), "video");
      }
      updateData.video = [videoUploadResult.url];
    }
  }

  // --- 5. EXECUTE THE UPDATE ---
  const updatedProduct = await Product.findByIdAndUpdate(
    productId,
    { $set: updateData },
    { new: true, runValidators: true }
  );

  return res
    .status(200)
    .json(new ApiResponse(200, updatedProduct, "Product updated successfully."));
});


// DELETE PRODUCT
const deleteProduct = asyncHandler(async (req, res) => {
  const { productId } = req.params;
  try{

    if (!mongoose.Types.ObjectId.isValid(productId)) {
      throw new ApiError(400, "Invalid product ID format.");
    }
    
    // --- 1. Find the product to get its file URLs before deleting ---
    const product = await Product.findById(productId);
    if (!product) {
      throw new ApiError(404, "Product not found.");
    }
    console.log("this is product",product)
    
    // --- 2. Collect all public IDs of associated Cloudinary assets ---
    const assetsToDelete = [];
    // console.log(assetsToDelete)
    if (product.images && product.images.length > 0) {
      product.images.forEach(url => assetsToDelete.push({ publicId: getPublicIdFromUrl(url), type: "image" }));
    }
    if (product.video && product.video.length > 0) {
      product.video.forEach(url => assetsToDelete.push({ publicId: getPublicIdFromUrl(url), type: "video" }));
    }
    console.log(assetsToDelete)
    // --- 3. Delete from Cloudinary and Database in parallel ---
    const cloudinaryDeletionPromises = assetsToDelete.map(asset => deleteFromCloudinary(asset.publicId, asset.type));
    const dbDeletionPromise = Product.findByIdAndDelete(productId);
    
    await Promise.all([
      ...cloudinaryDeletionPromises,
      dbDeletionPromise
    ]);
    
    return res
    .status(200)
    .json(new ApiResponse(200, {}, "Product deleted successfully."));
  }catch(error){
    console.log(error)
  }
});


//GET ALL PRODUCTS
const getAllProducts = asyncHandler(async (req, res) => {
  // --- 1. DESTRUCTURE QUERY PARAMS ---
  const {
    page = 1,
    limit = 10,
    search, // The universal search term
    type,
    gender,
    tags,
    color,
    material,
    stones,
    jewelleryCategory,
    materialType,
  } = req.query;

  // --- 2. BUILD THE DATABASE QUERY OBJECT DYNAMICALLY ---
  const query = {};

  // Part A: Build the broad, multi-field search condition if a search term exists.
  // This uses the $or operator to find a match in any of the specified fields.
  if (search) {
    const searchRegex = { $regex: search, $options: "i" }; // Case-insensitive regex

    query.$or = [
      { name: searchRegex },
      { gender: searchRegex },
      { type: searchRegex },
      { material: searchRegex },
      { jewelleryCategory: searchRegex },
      { materialType: searchRegex },
      // For array fields, MongoDB automatically applies the regex to each element in the array.
      { stones: searchRegex },
      { color: searchRegex },
      { tags: searchRegex },
    ];
  }

  // Part B: Add specific, narrowing filters.
  // These are implicitly combined with an AND condition.
  // So, it will match the $or search AND these specific filters.
  if (type) query.type = type;
  if (gender) query.gender = gender;
  if (material) query.material = material;
  if (jewelleryCategory) query.jewelleryCategory = jewelleryCategory;
  if (materialType) query.materialType = materialType;
  
  // Filtering for array fields using $in is more precise for specific filters.
  if (tags) query.tags = { $in: tags.split(',').map(tag => tag.trim()) };
  if (color) query.color = { $in: color.split(',').map(c => c.trim()) };
  if (stones) query.stones = { $in: stones.split(',').map(s => s.trim()) };

  // --- 3. SETUP PAGINATION OPTIONS ---
  const pageNumber = parseInt(page, 10);
  const limitNumber = parseInt(limit, 10);
  const skip = (pageNumber - 1) * limitNumber;

  // --- 4. EXECUTE QUERY TO GET PRODUCTS AND TOTAL COUNT ---
  const products = await Product.find(query)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limitNumber);

  const totalProducts = await Product.countDocuments(query);
  
  if (products.length === 0 && totalProducts > 0) {
      throw new ApiError(404, "No products found on this page for the given criteria.");
  }
  
  // --- 5. SEND THE PAGINATED RESPONSE ---
  return res.status(200).json(
    new ApiResponse(
      200,
      {
        products,
        currentPage: pageNumber,
        totalPages: Math.ceil(totalProducts / limitNumber),
        totalProducts,
      },
      "Products fetched successfully"
    )
  );
});

// GET ALL USERS 
const getAllUsers = asyncHandler(async (req, res) => {
  const { page = 1, limit = 10, gender, search } = req.query;

  const query = {};

  // Add gender filter if provided
  if (gender && ['Male', 'Female', 'Other'].includes(gender)) {
    query.gender = gender;
  }

  // Add search functionality for name or email
  if (search) {
    const searchRegex = { $regex: search, $options: "i" };
    query.$or = [{ name: searchRegex }, { email: searchRegex }];
  }

  const pageNumber = parseInt(page, 10);
  const limitNumber = parseInt(limit, 10);
  const skip = (pageNumber - 1) * limitNumber;

  const users = await User.find(query)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limitNumber)
    .select("-password -otp -refreshToken -forgotPasswordToken"); // Exclude sensitive fields

  const totalUsers = await User.countDocuments(query);
  // console.log(users)
  return res.status(200).json(
    new ApiResponse(
      200,
      {
        users,
        currentPage: pageNumber,
        totalPages: Math.ceil(totalUsers / limitNumber),
        totalUsers,
      },
      "Users fetched successfully"
    )
  );
});

const getUserById = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(userId)) {
    throw new ApiError(400, "Invalid user ID");
  }

  const user = await User.findById(userId).select("-password -otp -refreshToken");
  if (!user) {
    throw new ApiError(404, "User not found");
  }

  return res.status(200).json(new ApiResponse(200, user, "User details fetched successfully"));
});

const updateUser = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  
  // 1. Destructure ALL possible fields from the request body
  const { fullName, email, role, gender, status } = req.body; 
  try{

  
  if (!mongoose.Types.ObjectId.isValid(userId)) {
    throw new ApiError(400, "Invalid user ID format.");
  }

  // Find the user first to compare the email
  const user = await User.findById(userId);
  if (!user) {
    throw new ApiError(404, "User not found.");
  }
  // 2. Build the update object dynamically, only including fields that were provided
  const updateData = {};

  if (fullName) updateData.fullName = fullName;
  
  // Add validation to ensure the role and gender match the schema's enum values
  if (role && ['user', 'admin'].includes(role)) {
    updateData.role = role;
  }
  if (gender && ['Male', 'Female', 'Other'].includes(gender)) {
    updateData.gender = gender;
  }
  if (status && ['Active', 'Blocked'].includes(status)) {
    updateData.status = status;
  }

  // 3. Handle email updates carefully to ensure uniqueness
  // Only check for uniqueness if the email is being changed
  if (email && email !== user.email) {
    const existingUserWithEmail = await User.findOne({ email });
    if (existingUserWithEmail) {
      throw new ApiError(400, "This email address is already in use by another account.");
    }
    updateData.email = email;
  }

  // 4. Perform the update if there's anything to update
  if (Object.keys(updateData).length === 0) {
    throw new ApiError(400, "No valid fields provided for update.");
  }

  const updatedUser = await User.findByIdAndUpdate(
    userId,
    { $set: updateData },
    { new: true, runValidators: true } // `new: true` returns the updated document
  ).select("-password -otp -refreshToken -forgotPasswordToken"); // Exclude sensitive fields from the response

  console.log(updateUser)
  if (!updatedUser) {
    throw new ApiError(500, "Something went wrong while updating the user.");
  }

  return res
    .status(200)
    .json(new ApiResponse(200, updatedUser, "User updated successfully"));
}catch(error){
  console.log(error)
}
});

const deleteUser = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(userId)) {
    throw new ApiError(400, "Invalid user ID");
  }

  const user = await User.findByIdAndDelete(userId);
  if (!user) {
    throw new ApiError(404, "User not found");
  }

  return res.status(200).json(new ApiResponse(200, {}, "User deleted successfully"));
});


//GET USER ORDERS
const getUserOrders = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(userId)) {
    throw new ApiError(400, "Invalid user ID");
  }
  const orders = await Order.find({ user: userId }).populate(
    "orderItems.product",
    "name price"
  );
  return res
    .status(200)
    .json(new ApiResponse(200, orders, `Orders for user fetched successfully`));
});



const getAllAdminOrders = asyncHandler(async (req, res) => {
  const orders = await Order.find({})
    .populate("user", "name")
    .sort({ createdAt: -1 });
  return res
    .status(200)
    .json(new ApiResponse(200, orders, "All orders fetched"));
});

const updateOrderStatus = asyncHandler(async (req, res) => {
  const { orderId } = req.params;
  const { status } = req.body;
  if (!mongoose.Types.ObjectId.isValid(orderId)) {
    throw new ApiError(400, "Invalid Order ID");
  }
  const validStatuses = [
    "Pending", "Processing", "Shipped", "Delivered", "Cancelled",
  ];
  if (!status || !validStatuses.includes(status)) {
    throw new ApiError(
      400,
      `Invalid status. Must be one of: ${validStatuses.join(", ")}`
    );
  }
  const order = await Order.findByIdAndUpdate(
    orderId,
    { $set: { orderStatus: status } },
    { new: true }
  ).populate("user", "name");
  if (!order) {
    throw new ApiError(404, "Order not found");
  }
  return res
    .status(200)
    .json(new ApiResponse(200, order, "Order status updated successfully"));
});

export {
  getAdminDashboardStats,
  getSalesOverview,
  getRecentAdminOrders,
  createProduct,
  updateProduct,
  deleteProduct,
  getAllProducts,
  getAllUsers,
  // getUserDetails,
  getUserById,
  updateUser,
  deleteUser,
  getUserOrders,
  updateOrderStatus,
  getAllAdminOrders,
};
