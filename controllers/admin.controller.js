import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { ApiError } from "../utils/ApiError.js";
import { Order } from "../models/order.model.js";
import { User } from "../models/user.model.js";
import Product from "../models/product.model.js";
import { deleteFromCloudinary, getPublicIdFromUrl, uploadOnCloudinary } from "../config/cloudinary.js";
import { uploadOnS3, deleteFromS3, getObjectKeyFromUrl } from "../config/s3.js";
import mongoose from "mongoose";
import slugify from "slugify";

const getAdminDashboardStats = asyncHandler(async (req, res) => {
  const [totalSalesData, newOrdersCount, activeUsersCount] = await Promise.all([
    Order.aggregate([
      { $match: { orderStatus: { $in: ["Delivered", "Completed"] } } }, // Consider "Completed" if you use it
      { $group: { _id: null, totalSales: { $sum: "$totalPrice" } } },
    ]),
    Order.countDocuments({ orderStatus: { $in: ["Paid", "Processing"] } }),
    User.countDocuments({ role: "user", status: "Active" }),
  ]);
  const stats = {
    totalSales: totalSalesData[0]?.totalSales || 0,
    newOrders: newOrdersCount,
    activeUsers: activeUsersCount,
  };
  return res.status(200).json(new ApiResponse(200, stats, "Admin dashboard data fetched"));
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
    .populate("user", "fullName")
    .sort({ createdAt: -1 })
    .limit(3)
    .select("user totalPrice orderStatus")
    .lean();
  return res
    .status(200)
    .json(new ApiResponse(200, recentOrders, "Recent admin orders fetched"));
});

const createProduct = asyncHandler(async (req, res) => {
  try {
    const {
      name, description, category,sub_category ,brand, gender, tags,
      price, sale_price, stock_quantity,
      variants,
      fit, careInstructions, sleeveLength, neckType, pattern 
    } = req.body;

    if (!name || !description || !category || !brand || !price) {
      throw new ApiError(400, "Name, description, brand, category, and price are required.");
    }
    
    const isVariableProduct = !!variants;

    const imageFiles = req.files?.images;
    const videoFile = req.files?.video?.[0];

    if (!imageFiles || imageFiles.length === 0) {
      throw new ApiError(400, "At least one product image is required.");
    }

    let videoUrl = null;
    if (videoFile) {
      const videoUploadResult = await uploadOnS3(videoFile.path, "products");
      if (videoUploadResult?.url) videoUrl = videoUploadResult.url;
    }

    const imageUploadPromises = imageFiles.map(file => uploadOnS3(file.path, "products"));
    const uploadedImages = await Promise.all(imageUploadPromises);
    const imageUrls = uploadedImages.map(result => result?.url).filter(Boolean);

    if (imageUrls.length !== imageFiles.length) {
      throw new ApiError(500, "Error occurred while uploading images.");
    }

    const productData = {
      name,
      slug: slugify(name, { lower: true, strict: true }),
      description,
      images: imageUrls,
      video: videoUrl,
      category,
      brand,
      gender,
      tags: tags ? String(tags).split(',').map(tag => tag.trim()) : [],
      price: parseFloat(price),
      sale_price: sale_price ? parseFloat(sale_price) : undefined,
      fit,
      sub_category,
      careInstructions,
      sleeveLength,
      neckType,
      pattern,
    };

    if (isVariableProduct) {
      try {
        const parsedVariants = JSON.parse(variants);
        let totalStock = 0;
        for (const variant of parsedVariants) {
          if (!variant.price || variant.price <= 0 || variant.stock_quantity === undefined || variant.stock_quantity < 0) {
            throw new ApiError(400, `Each variant must have a valid price and a non-negative stock quantity. Check SKU: ${variant.sku_variant || 'N/A'}`);
          }
          // Calculate the total stock from all variants
          totalStock += Number(variant.stock_quantity);
        }
        productData.variants = parsedVariants;
        productData.stock_quantity = totalStock; // Assign the calculated total stock
      } catch (e) {
        if (e instanceof ApiError) throw e;
        throw new ApiError(400, "Invalid variants JSON format.");
      }
    } else {
      // For simple products, stock_quantity from the body is required.
      if (stock_quantity === undefined) {
          throw new ApiError(400, "Stock quantity is required for simple products.");
      }
      productData.stock_quantity = parseInt(stock_quantity, 10);
    }

    const product = await Product.create(productData);
    if (!product) {
      throw new ApiError(500, "Database error: Could not create the product.");
    }
    return res.status(201).json(new ApiResponse(201, product, "Product created successfully."));
  } catch (error) {
    console.error("Error in createProduct:", error);
    if (error instanceof ApiError) {
      return res.status(error.statusCode).json({ success: false, message: error.message });
    }
    return res.status(500).json({ success: false, message: "Internal Server Error" });
  }
});


const updateProduct = asyncHandler(async (req, res) => {
  const { productId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(productId)) {
    throw new ApiError(400, "Invalid product ID.");
  }
  
  const product = await Product.findById(productId);
  if (!product) {
    throw new ApiError(404, "Product not found.");
  }

  const {
    name, description, category, brand, gender, tags,
    price, sale_price, stock_quantity,
    variants,
    fit, careInstructions, sleeveLength, neckType, pattern,
    imageOrder, // <-- New: A JSON string of the final image URLs/placeholders
  } = req.body;

  const updateData = {};
  const unsetData = {};

  // --- Step 1: Handle Text and Variant Data (Same as before) ---
  if (name !== undefined) updateData.name = name;
  if (description !== undefined) updateData.description = description;
  // ... (add all other non-file fields here)
  if (tags !== undefined) updateData.tags = String(tags).split(',').map(tag => tag.trim());
  if (price !== undefined) updateData.price = parseFloat(price);
  
  // Handle variants vs. simple stock
  if (variants !== undefined) {
    try {
      const parsedVariants = JSON.parse(variants);
      let totalStock = 0;
      parsedVariants.forEach(v => { totalStock += Number(v.stock_quantity) || 0; });
      updateData.variants = parsedVariants;
      updateData.stock_quantity = totalStock;
    } catch (e) { 
      throw new ApiError(400, "Invalid variants JSON format.");
    }
  } else {
    if (stock_quantity !== undefined) {
      updateData.stock_quantity = parseInt(stock_quantity, 10);
    }
    unsetData.variants = 1;
  }


  // --- Step 2: Handle Granular Image Updates ---
  const newImageFiles = req.files?.images; // These are only the NEWLY uploaded files

  if (imageOrder) {
    const finalImageOrder = JSON.parse(imageOrder); // The desired final array of URLs
    
    // 1. Determine which old images to delete from S3
    const originalUrls = product.images || [];
    const urlsToDelete = originalUrls.filter(url => !finalImageOrder.includes(url));
    
    if (urlsToDelete.length > 0) {
      const deletionPromises = urlsToDelete.map(url => deleteFromS3(getObjectKeyFromUrl(url)));
      await Promise.all(deletionPromises);
    }

    // 2. Upload the new images that were sent
    let newUploadedUrls = [];
    if (newImageFiles && newImageFiles.length > 0) {
      const uploadPromises = newImageFiles.map(file => uploadOnS3(file.path, "products"));
      const uploadResults = await Promise.all(uploadPromises);
      newUploadedUrls = uploadResults.map(result => result?.url).filter(Boolean);
    }
    
    // 3. Construct the final 'images' array for the database
    let newUrlIndex = 0;
    const finalDbImageArray = finalImageOrder.map((item) => {
      // If the item is a placeholder for a new file, replace it with the new S3 URL
      if (item === 'NEW_FILE_PLACEHOLDER' && newUrlIndex < newUploadedUrls.length) {
        return newUploadedUrls[newUrlIndex++];
      }
      // Otherwise, it's an existing URL, so keep it
      return item;
    }).filter(item => item !== 'NEW_FILE_PLACEHOLDER'); // Clean up any placeholders that didn't get a URL

    updateData.images = finalDbImageArray;
  }

  // --- Step 3: Handle Video Update (Replaces old one if it exists) ---
  const videoFile = req.files?.video?.[0];
  if (videoFile) {
    const videoUploadResult = await uploadOnS3(videoFile.path, "products");
    if (videoUploadResult?.url) {
      if (product.video) {
        await deleteFromS3(getObjectKeyFromUrl(product.video));
      }
      updateData.video = videoUploadResult.url;
    }
  }
  
  // Step 4: Execute the Update
  const updatedProduct = await Product.findByIdAndUpdate(
    productId,
    { $set: updateData, $unset: unsetData },
    { new: true, runValidators: true }
  );

  if (!updatedProduct) {
      throw new ApiError(500, "Failed to update product. Please check your data.");
  }

  return res.status(200).json(new ApiResponse(200, updatedProduct, "Product updated successfully."));
});



const deleteProduct = asyncHandler(async (req, res) => {
  const { productId } = req.params;
  
  if (!mongoose.Types.ObjectId.isValid(productId)) {
    throw new ApiError(400, "Invalid product ID format.");
  }
  
  const product = await Product.findById(productId);
  if (!product) {
    throw new ApiError(404, "Product not found.");
  }
  
  const assetsToDelete = [];
  
  if (product.images && product.images.length > 0) {
    product.images.forEach(url => {
      const key = getObjectKeyFromUrl(url);
      if (key) assetsToDelete.push(key);
    });
  }
  
  if (product.video) {
    const videoKey = getObjectKeyFromUrl(product.video);
    if (videoKey) assetsToDelete.push(videoKey);
  }
  
  const s3DeletionPromises = assetsToDelete.map(key => deleteFromS3(key));
  
  await Promise.all([
    ...s3DeletionPromises, // Spread the S3 deletion promises
    Product.findByIdAndDelete(productId) // Add the database deletion promise
  ]);

  return res.status(200).json(new ApiResponse(200, {}, "Product and associated assets deleted successfully."));
});

const getAllProducts = asyncHandler(async (req, res) => {
  const {
    page = 1, limit = 10, search, category, sub_category,
    gender, tags, color, fit, pattern, sleeveLength, neckType,
    minPrice, maxPrice, sort = 'newest', onSale
  } = req.query;

  const query = {};

  if (onSale === 'true') {
    query.sale_price = { $exists: true, $ne: null };
    query.$expr = { $lt: ["$sale_price", "$price"] };
  }

  // --- SEARCH FUNCTIONALITY (UPDATED) ---
  if (search) {
    const searchRegex = { $regex: search, $options: "i" };
    query.$or = [
      { name: searchRegex },
      { description: searchRegex },
      { tags: searchRegex },
      { category: searchRegex },
      { sub_category: searchRegex },
      { brand: searchRegex },
      { 'variants.color': searchRegex }, // Search inside variants' color
      { color: searchRegex },           // --- NEW: Search in top-level color field ---
    ];
  }

  // --- FILTERING LOGIC ---
  if (category) query.category = { $in: category.split(',') };
  if (sub_category) query.sub_category = { $in: sub_category.split(',') };
  if (gender) query.gender = { $in: gender.split(',') };
  if (tags) query.tags = { $in: tags.split(',') };
  if (fit) query.fit = { $in: fit.split(',') };
  if (pattern) query.pattern = { $in: pattern.split(',') };
  if (sleeveLength) query.sleeveLength = { $in: sleeveLength.split(',') };
  if (neckType) query.neckType = { $in: neckType.split(',') };

  // --- COLOR FILTER LOGIC (UPDATED & IMPROVED) ---
  if (color) {
    const colorArray = color.split(',');
    // Yeh query un products ko dhoondhegi:
    // 1. Jinke top-level 'color' field in colors se match kare
    //    (assuming you have a 'color' field in your schema for simple products)
    // OR
    // 2. Jinke 'variants' array ke andar kisi bhi item ka 'color' match kare
    query.$or = [
        { color: { $in: colorArray } },
        { 'variants.color': { $in: colorArray } }
    ];
  }

  // Price Range Filter
  if (minPrice || maxPrice) {
    const priceQuery = {
      ...(minPrice && { $gte: Number(minPrice) }),
      ...(maxPrice && { $lte: Number(maxPrice) })
    };
    // Check if the base query already has an $or condition
    if (query.$or) {
        // If it does, we need to wrap both conditions in an $and
        query.$and = [
            { $or: query.$or }, // The existing $or for search/color
            { $or: [ { price: priceQuery }, { sale_price: priceQuery } ] } // The new $or for price
        ];
        delete query.$or; // Remove the old $or to avoid conflicts
    } else {
        query.$or = [ { price: priceQuery }, { sale_price: priceQuery } ];
    }
  }
  
  // --- Sorting Logic (No change) ---
  const sortOption = {};
  switch (sort) {
    case 'price-asc':
      sortOption.sale_price = 1;
      sortOption.price = 1;
      break;
    case 'price-desc':
      sortOption.sale_price = -1;
      sortOption.price = -1;
      break;
    case 'newest':
    default:
      sortOption.createdAt = -1;
      break;
  }

  // --- Database Fetch & Response (No change) ---
  const productsPromise = Product.find(query)
    .sort(sortOption)
    .skip((page - 1) * limit)
    .limit(limit)
    .lean();

  const totalProductsPromise = Product.countDocuments(query);
  const [products, totalProducts] = await Promise.all([productsPromise, totalProductsPromise]);
    
  return res.status(200).json(new ApiResponse(200, {
      products,
      currentPage: parseInt(page, 10),
      totalPages: Math.ceil(totalProducts / limit),
      totalProducts,
  }, "Products fetched successfully"));
});


// GET ALL USERS 
const getAllUsers = asyncHandler(async (req, res) => {
  // 1. Destructure query parameters. 'gender' is removed.
  // The 'search' parameter from the frontend is received as 'name' in your fetchUsers thunk, 
  // so we'll look for both 'search' and 'name' for flexibility.
  const { page = 1, limit = 10, search, name } = req.query;
  
  // Use 'search' if provided, otherwise fallback to 'name'
  const searchQuery = search || name;

  const query = {};

  // 2. Add search functionality for fullName or email
  // This now checks the 'fullName' field to match your frontend data model.
  if (searchQuery) {
    const searchRegex = { $regex: searchQuery, $options: "i" }; // "i" for case-insensitive
    query.$or = [
      { fullName: searchRegex }, 
      { email: searchRegex }
    ];
  }

  // 3. Pagination logic (remains the same)
  const pageNumber = parseInt(page, 10);
  const limitNumber = parseInt(limit, 10);
  const skip = (pageNumber - 1) * limitNumber;

  // 4. Database query using the constructed query object
  const users = await User.find(query)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limitNumber)
    .select("-password -otp -refreshToken -forgotPasswordToken"); // Exclude sensitive fields

  // 5. Get the total count of documents that match the query for pagination
  const totalUsers = await User.countDocuments(query);

  // 6. Send the structured response
  return res.status(200).json(
    new ApiResponse(
      200,
      {
        users, // Frontend might expect a 'data' property
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
  // --- PAGINATION LOGIC ---
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 10; // Show 10 orders per page
  const skip = (page - 1) * limit;

  // Get total count of orders for pagination info
  const totalOrders = await Order.countDocuments();

  const orders = await Order.find({})
    .populate("user", "fullName") // Ensure you are populating fullName
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);

  return res
    .status(200)
    .json(new ApiResponse(200, {
      orders,
      currentPage: page,
      totalPages: Math.ceil(totalOrders / limit),
      totalOrders,
    }, "All orders fetched"));
});

const getSingleAdminOrder = asyncHandler(async (req, res) => {
  const { orderId } = req.params;

  // 1. Validate the Order ID format
  if (!mongoose.Types.ObjectId.isValid(orderId)) {
      throw new ApiError(400, "Invalid Order ID format.");
  }
  
  // 2. Find the order by its ID
  //    - Does NOT check for user ownership, allowing admin access to any order.
  const order = await Order.findById(orderId)
      .populate("user", "fullName email") // Get customer's name and email
      .populate("orderItems.product", "name images price"); // Get details for each product in the order

      console.log("--order--")
      console.log(order)

  // 3. If no order is found, throw a 404 error
  if (!order) {
      throw new ApiError(404, "Order not found.");
  }

  // 4. Send a successful response with the order data
  res.status(200).json(new ApiResponse(200, order, "Order details fetched successfully for admin."));
})

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
  getSingleAdminOrder,
  getUserById,
  updateUser,
  deleteUser,
  getUserOrders,
  updateOrderStatus,
  getAllAdminOrders,
};
