import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { ApiError } from "../utils/ApiError.js";
import { Order } from "../models/order.model.js";
import { User } from "../models/user.model.js";
import Product from "../models/product.model.js";
import { shiprocketApi } from "../utils/shiprocketService.js";
import { deleteFromCloudinary, getPublicIdFromUrl, uploadOnCloudinary } from "../config/cloudinary.js";
import { uploadOnS3, deleteFromS3, getObjectKeyFromUrl } from "../config/s3.js";
import mongoose from "mongoose";
import slugify from "slugify";

/**
 * @desc Generate AWB and assign a courier for a shipment
 * @route POST /api/v1/admin/shipping/generate-awb
 * @access Admin
 */
const generateAWB = asyncHandler(async (req, res) => {
  const { shipmentId } = req.body; // This is the shiprocketShipmentId from your order model

  if (!shipmentId) {
      throw new ApiError(400, "Shiprocket Shipment ID is required.");
  }

  // Call Shiprocket to assign a courier and get an AWB
  const { data: awbResponse } = await shiprocketApi.post('/courier/assign/awb', {
      shipment_id: shipmentId
  });

  // Check for Shiprocket's specific success indicator
  if (!awbResponse.response?.data?.awb_code) {
      throw new ApiError(400, "Failed to assign AWB. Shiprocket Reason: " + (awbResponse.message || "Unknown error"));
  }

  const awbData = awbResponse.response.data;

  // Find our order and update it with the new shipping details
  const updatedOrder = await Order.findOneAndUpdate(
      { "shipmentDetails.shiprocketShipmentId": shipmentId },
      {
          $set: {
              "orderStatus": "Shipped", // AUTOMATICALLY update the status
              "shipmentDetails.trackingNumber": awbData.awb_code,
              "shipmentDetails.courier": awbData.courier_name,
              "shipmentDetails.trackingUrl": awbData.awb_code_url, // URL for tracking page
          }
      },
      { new: true } // Return the updated document
  ).populate("user", "fullName email")
   .populate("orderItems.product_id", "name images price slug");

  if (!updatedOrder) {
      throw new ApiError(404, "Order not found in DB to update after AWB generation.");
  }

  // You can add email/SMS notification logic here to inform the customer their order has shipped.

  return res.status(200).json(new ApiResponse(200, updatedOrder, "AWB generated and order status updated to 'Shipped'."));
});


const schedulePickupForOrder = asyncHandler(async (req, res) => {
  const { shipmentId } = req.body;

  if (!shipmentId) {
      throw new ApiError(400, "Shiprocket Shipment ID is required to schedule a pickup.");
  }

  try {
      // --- THIS IS THE FIX ---
      // 1. Define the payload as a standard JavaScript object.
      // The Shiprocket API for this endpoint expects an object with a key 'shipment_id' that holds an ARRAY of strings.
      const payload = {
          shipment_id: [shipmentId] 
      };

      // 2. Make the API call. Our `shiprocketApi` instance is already configured to send JSON.
      const { data: pickupResponse } = await shiprocketApi.post(
          '/courier/generate/pickup', 
          payload
      );
      // --- END OF FIX ---
      console.log("-----pickupResponse----",pickupResponse)

      // Check for Shiprocket's success response structure
      if (!pickupResponse || pickupResponse.pickup_status !== "scheduled") {
          console.warn(`Pickup scheduling failed or was queued for shipment ${shipmentId}. Response:`, pickupResponse);
          const shiprocketMessage = pickupResponse?.message || "Failed to schedule pickup with Shiprocket.";
          throw new ApiError(400, shiprocketMessage);
      }

      console.log(`Pickup successfully scheduled for shipment ${shipmentId}. Response:`, pickupResponse);

      return res.status(200).json(new ApiResponse(200, pickupResponse, "Pickup scheduled successfully."));

  } catch (error) {
    console.log("error", error)
      // This will now provide a clear error message from Shiprocket's response if the request fails.
      const errorMessage = error.response?.data?.message || error.message || "Failed to schedule pickup with the shipping partner.";
      console.error("Schedule Pickup Error:", error.response?.data || error.message);
      throw new ApiError(error.statusCode || 500, errorMessage);
  }
});



/**
* @desc Track a shipment using its AWB code
* @route GET /api/v1/admin/shipping/track/:awb
* @access Admin
*/
const trackShipmentByAWB = asyncHandler(async (req, res) => {
  const { awb } = req.params;

  if (!awb) {
      throw new ApiError(400, "AWB code is required.");
  }

  const { data } = await shiprocketApi.get(`/courier/track/awb/${awb}`);

  if (data.tracking_data.track_status !== 1) {
      throw new ApiError(404, "Could not find tracking data for this AWB.");
  }

  return res.status(200).json(new ApiResponse(200, data.tracking_data, "Tracking data fetched."));
});


const getAdminDashboardStats = asyncHandler(async (req, res) => {
  const [totalSalesData, newOrdersCount, activeUsersCount] = await Promise.all([
    Order.aggregate([
      { $match: { orderStatus: { $in: ["Shipped", "Delivered", "Processing"] } } }, 
      { $group: { _id: null, totalSales: { $sum: "$totalPrice" } } },
    ]),
    Order.countDocuments({ orderStatus: { $in: ["Paid", "Processing"] } }),
    User.countDocuments({ role: "user", isVerified: true }), 
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
        orderStatus: { $in: ["Shipped", "Delivered", "Processing"] }, 
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
  // console.log(monthlySales)
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
  // --- Destructure all possible fields from the body ---
  const {
    name, type, description, category, sub_category, brand, tags,
    // Fields for SIMPLE products - stock_quantity is now optional at this stage
    price, sale_price, stock_quantity, volume, userInputInstructions,
    weight, length, breadth, height,
    // Field for VARIABLE products (will be a JSON string)
    variants 
  } = req.body;

  // --- Basic Validation ---
  if (!name || !type || !description || !category ) {
    throw new ApiError(400, "Name, description, type, and category are required.");
  }

  // --- File Upload Logic ---
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
    throw new ApiError(500, "Error occurred while uploading some images.");
  }

  // --- Build the base product data object ---
  const productData = {
    name,
    type,
    slug: slugify(name, { lower: true, strict: true }),
    description,
    userInputInstructions,
    images: imageUrls,
    video: videoUrl,
    category,
    sub_category: sub_category || undefined,
    brand,
    tags: tags ? String(tags).split(',').map(tag => tag.trim()) : [],
  };

  // --- CORE LOGIC: Handle Variants vs. Simple Product ---
  const isVariableProduct = variants && variants !== '[]';

  if (isVariableProduct) {
    try {
      const parsedVariants = JSON.parse(variants);
      let totalStock = 0;
      
      // Validate each variant
      for (const variant of parsedVariants) {
        if (!variant.name || !variant.sku || variant.price === undefined || variant.stock_quantity === undefined ||
            !variant.weight || !variant.length || !variant.breadth || !variant.height) {
          throw new ApiError(400, "Each variant must have Name, SKU, Price, Stock, Weight, Length, Breadth, and Height.");
        }
        totalStock += Number(variant.stock_quantity || 0);
      }
      
      productData.variants = parsedVariants;
      
      // Calculate and set stock_quantity for the parent product
      productData.stock_quantity = totalStock;
      // Set the main price to the price of the first variant for display purposes
      productData.price = parsedVariants[0]?.price || 0;

      // --- FIX: Set top-level dimensions from the first variant ---
      const firstVariant = parsedVariants[0];
      productData.weight = firstVariant.weight;
      productData.length = firstVariant.length;
      productData.breadth = firstVariant.breadth;
      productData.height = firstVariant.height;
      // --- END FIX ---

    } catch (e) {
      if (e instanceof ApiError) throw e;
      throw new ApiError(400, "Invalid variants JSON format received.");
    }
  } else {
    // This is a SIMPLE product
    if (price === undefined || stock_quantity === undefined || !weight || !length || !breadth || !height) {
      throw new ApiError(400, "Price, Stock, Weight, Length, Breadth, and Height are required for simple products.");
    }

    // Set all properties for simple products here
    productData.price = parseFloat(price);
    productData.sale_price = sale_price ? parseFloat(sale_price) : undefined;
    productData.stock_quantity = parseInt(stock_quantity, 10);
    productData.volume = volume ? parseInt(volume, 10) : undefined;
    productData.weight = parseFloat(weight);
    productData.length = parseFloat(length);
    productData.breadth = parseFloat(breadth);
    productData.height = parseFloat(height);
    productData.variants = []; // Ensure variants array is empty
  }

  // --- Create the product in the database ---
  const product = await Product.create(productData);
  if (!product) {
    throw new ApiError(500, "Database error: Could not create the product.");
  }

  return res.status(201).json(new ApiResponse(201, product, "Product created successfully."));
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
    name, description, category, sub_category, brand, tags,
    price, sale_price, stock_quantity, volume,
    variants, userInputInstructions,
    // Destructure dimensional fields
    weight, length, breadth, height,
    imageOrder,
  } = req.body;

  const updateData = {};
  const unsetData = {};

  // --- Step 1: Handle Text and Variant Data ---
  if (name !== undefined) updateData.name = name;
  if (description !== undefined) updateData.description = description;
  if (userInputInstructions !== undefined) updateData.userInputInstructions = userInputInstructions;
  if (category !== undefined) updateData.category = category;
  if (sub_category !== undefined) updateData.sub_category = sub_category;
  if (brand !== undefined) updateData.brand = brand;
  if (tags !== undefined) updateData.tags = String(tags).split(',').map(tag => tag.trim());
  
  // Handle variants vs. simple product fields
  if (variants !== undefined) {
    try {
      const parsedVariants = JSON.parse(variants);
      let totalStock = 0;
      parsedVariants.forEach(v => { 
        // Basic validation for variants
        if (!v.name || !v.sku || v.price === undefined || v.stock_quantity === undefined ||
            !v.weight || !v.length || !v.breadth || !v.height) {
          throw new ApiError(400, "Each variant must have Name, SKU, Price, Stock, Weight, Length, Breadth, and Height.");
        }
        totalStock += Number(v.stock_quantity) || 0; 
      });

      updateData.variants = parsedVariants;
      updateData.stock_quantity = totalStock;

      // --- FIX: Update parent product fields from the first variant ---
      const firstVariant = parsedVariants[0] || {};
      updateData.price = firstVariant.price || 0;
      updateData.sale_price = firstVariant.sale_price;
      updateData.weight = firstVariant.weight;
      updateData.length = firstVariant.length;
      updateData.breadth = firstVariant.breadth;
      updateData.height = firstVariant.height;
      // --- END FIX ---

    } catch (e) { 
      if (e instanceof ApiError) throw e;
      throw new ApiError(400, "Invalid variants JSON format.");
    }
  } else {
    // This is a SIMPLE product
    if (price !== undefined) updateData.price = parseFloat(price);
    if (sale_price !== undefined) updateData.sale_price = parseFloat(sale_price);
    if (stock_quantity !== undefined) updateData.stock_quantity = parseInt(stock_quantity, 10);
    if (volume !== undefined) updateData.volume = parseInt(volume, 10);
    
    // --- FIX: Add dimensional fields for simple products ---
    if (weight !== undefined) updateData.weight = parseFloat(weight);
    if (length !== undefined) updateData.length = parseFloat(length);
    if (breadth !== undefined) updateData.breadth = parseFloat(breadth);
    if (height !== undefined) updateData.height = parseFloat(height);
    // --- END FIX ---

    // Ensure variants array is unset if switching from variable to simple
    unsetData.variants = ""; 
  }

  // --- Step 2: Handle Granular Image Updates (Your existing logic is fine) ---
  const newImageFiles = req.files?.images;

  if (imageOrder) {
    const finalImageOrder = JSON.parse(imageOrder);
    const originalUrls = product.images || [];
    const urlsToDelete = originalUrls.filter(url => !finalImageOrder.includes(url));
    
    if (urlsToDelete.length > 0) {
      const deletionPromises = urlsToDelete.map(url => deleteFromS3(getObjectKeyFromUrl(url)));
      await Promise.all(deletionPromises);
    }

    let newUploadedUrls = [];
    if (newImageFiles && newImageFiles.length > 0) {
      const uploadPromises = newImageFiles.map(file => uploadOnS3(file.path, "products"));
      const uploadResults = await Promise.all(uploadPromises);
      newUploadedUrls = uploadResults.map(result => result?.url).filter(Boolean);
    }
    
    let newUrlIndex = 0;
    const finalDbImageArray = finalImageOrder.map(item => 
      item === 'NEW_FILE_PLACEHOLDER' && newUrlIndex < newUploadedUrls.length 
        ? newUploadedUrls[newUrlIndex++] 
        : item
    ).filter(item => item !== 'NEW_FILE_PLACEHOLDER');

    updateData.images = finalDbImageArray;
  }

  // --- Step 3: Handle Video Update (Your existing logic is fine) ---
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
  
  // --- Step 4: Execute the Update ---
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
    page = 1, limit = 10, search, category, type ,sub_category,
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
      { type: searchRegex },
      { category: searchRegex },
      { sub_category: searchRegex },
      { brand: searchRegex },
      { 'variants.color': searchRegex }, // Search inside variants' color
      { color: searchRegex },           // --- NEW: Search in top-level color field ---
    ];
  }

  // --- FILTERING LOGIC ---
  if (category) query.category = { $in: category.split(',') };
  if (type) query.type = { $in: type.split(',') };
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
  const limit = parseInt(req.query.limit, 10) || 10;
  const skip = (page - 1) * limit;

  // --- SEARCH & FILTER LOGIC ---
  const { searchQuery } = req.query;
  const filter = {}; // Start with an empty filter object

  // If a valid Order ID is provided as a search query, add it to the filter
  if (searchQuery && mongoose.Types.ObjectId.isValid(searchQuery)) {
      filter._id = searchQuery;
  }

  // Get total count of orders that match the filter for pagination info
  const totalOrders = await Order.countDocuments(filter);

  // Find orders matching the filter with pagination
  const orders = await Order.find(filter)
    .populate("user", "fullName")
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);

    // console.log('---orders---', orders)

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

  if (!mongoose.Types.ObjectId.isValid(orderId)) {
    throw new ApiError(400, "Invalid Order ID format.");
  }
  
  const order = await Order.findById(orderId)
    .populate("user", "fullName email")
    .populate("orderItems.product_id", "name images price slug")
    .lean(); // <-- ADD .lean() HERE

  if (!order) {
      throw new ApiError(404, "Order not found.");
  }

  res.status(200).json(new ApiResponse(200, order, "Order details fetched successfully for admin."));
})

const updateOrderStatus = asyncHandler(async (req, res) => {
  const { orderId } = req.params;
  const { status } = req.body;
  if (!mongoose.Types.ObjectId.isValid(orderId)) {
    throw new ApiError(400, "Invalid Order ID");
  }
  const validStatuses = ["Pending", "Processing","Paid" ,"Shipped", "Delivered", "Cancelled"];
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
  generateAWB,
  trackShipmentByAWB,
  schedulePickupForOrder
};
