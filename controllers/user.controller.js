// "user.controller"
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { ApiError } from "../utils/ApiError.js";
import { Order } from "../models/order.model.js";
import { User } from "../models/user.model.js";
import { Product } from "../models/product.model.js";
import { uploadOnCloudinary, deleteFromCloudinary, getPublicIdFromUrl } from "../config/cloudinary.js";
import fs from "fs";
import mongoose from "mongoose";

const getMyProfile = asyncHandler(async (req, res) => {
  const userProfile = await User.findById(req.user._id)
    .populate({
      path: "wishlist",
      select: "name price mainImage images stock",
    })
    .populate({
      path: "cart.product",
      select: "name price mainImage images stock",
    })
    .select("-password -refreshToken");

  if (!userProfile) {
    throw new ApiError(404, "User not found");
  }

  res
    .status(200)
    .json(new ApiResponse(200, userProfile, "Profile fetched successfully"));
});

const setDefaultAddress = asyncHandler(async (req, res) => {
  const { addressId } = req.params;
  const userId = req.user._id;
  if (!mongoose.Types.ObjectId.isValid(addressId)) {
  throw new ApiError(400, "Invalid Address ID format");
  }
  const user = await User.findById(userId);
  if (!user) throw new ApiError(404, "User not found");
  const addressExists = user.addresses.some(addr => addr._id.toString() === addressId);
  if (!addressExists) {
  throw new ApiError(404, "Address not found in user's profile.");
  }
  // Set the default address
  user.addresses.forEach(addr => {
  addr.isDefault = addr._id.toString() === addressId;
  });
  await user.save({ validateBeforeSave: false });
  res
  .status(200)
  .json(new ApiResponse(200, user.addresses, "Default address updated successfully"));
  });

const updateMyProfile = asyncHandler(async (req, res) => {
  // --- EDITED: Changed 'name' to 'fullName' to match the schema ---
  const { fullName, phone  } = req.body;
  // if (!fullName || fullName.trim() === "") {
  //   throw new ApiError(400, "Full name is required");
  // }

  const updatedUser = await User.findByIdAndUpdate(
    req.user._id,
    { $set: { fullName, phone } },
    { new: true }
  ).select("-password -refreshToken");

  res
    .status(200)
    .json(new ApiResponse(200, updatedUser, "Profile updated successfully"));
});

const updateUserAvatar = asyncHandler(async (req, res) => {
  const avatarLocalPath = req.file?.path;
  if (!avatarLocalPath) {
    throw new ApiError(400, "Avatar file is missing");
  }

  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      throw new ApiError(404, "User not found");
    }

    // --- IMPROVED: Delete the old avatar from Cloudinary before uploading a new one ---
    if (user.avatar) {
      const oldPublicId = getPublicIdFromUrl(user.avatar);
      if (oldPublicId) {
        await deleteFromCloudinary(oldPublicId);
      }
    }

    const avatar = await uploadOnCloudinary(avatarLocalPath);
    if (!avatar?.url) {
      throw new ApiError(500, "Error while uploading avatar to Cloudinary");
    }

    const updatedUser = await User.findByIdAndUpdate(
      req.user._id,
      { $set: { avatar: avatar.url } },
      { new: true }
    ).select("-password -refreshToken");

    res
      .status(200)
      .json(new ApiResponse(200, updatedUser, "Avatar updated successfully"));
  } finally {
    // Ensure the local file is deleted after processing
    if (fs.existsSync(avatarLocalPath)) {
      fs.unlinkSync(avatarLocalPath);
    }
  }
});

const getAddresses = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id).select("addresses").lean();
  if (!user) {
    throw new ApiError(404, "User not found");
  }
  res
    .status(200)
    .json(
      new ApiResponse(
        200,
        user.addresses || [],
        "Addresses fetched successfully"
      )
    );
});

const addAddress = asyncHandler(async (req, res) => {
  const { fullName, phone, type, street, city, state, postalCode, country } =
    req.body;

  if (!fullName || !phone || !street || !city || !state || !postalCode) {
    throw new ApiError(400, "All required address fields must be provided.");
  }

  const user = await User.findById(req.user._id);
  const newAddress = {
    fullName,
    phone,
    type: type || "Home",
    street,
    city,
    state,
    postalCode,
    country: country || "India",
    isDefault: user.addresses.length === 0, // First address is the default
  };
  user.addresses.push(newAddress);
  await user.save({ validateBeforeSave: false });

  res
    .status(201)
    .json(new ApiResponse(201, user.addresses, "Address added successfully"));
});

const updateAddress = asyncHandler(async (req, res) => {
  const { addressId } = req.params;
  const updateData = req.body;

  if (!mongoose.Types.ObjectId.isValid(addressId)) {
    throw new ApiError(400, "Invalid Address ID format");
  }

  if (
    !updateData.fullName || !updateData.phone || !updateData.street ||
    !updateData.city || !updateData.state || !updateData.postalCode
  ) {
    throw new ApiError(400, "All required address fields must be provided.");
  }

  const updateFields = {};
  for (const key in updateData) {
    updateFields[`addresses.$[elem].${key}`] = updateData[key];
  }

  const updatedUser = await User.findByIdAndUpdate(
    req.user._id,
    { $set: updateFields },
    {
      arrayFilters: [{ "elem._id": new mongoose.Types.ObjectId(addressId) }],
      new: true,
    }
  ).select("addresses");

  if (!updatedUser) {
    throw new ApiError(404, "Address not found or failed to update.");
  }

  res
    .status(200)
    .json(new ApiResponse(200, updatedUser.addresses, "Address updated successfully"));
});

const deleteAddress = asyncHandler(async (req, res) => {
  const { addressId } = req.params;
  const user = await User.findByIdAndUpdate(
    req.user._id,
    { $pull: { addresses: { _id: addressId } } },
    { new: true }
  );
  if (!user) throw new ApiError(500, "Could not delete address");

  res
    .status(200)
    .json(new ApiResponse(200, user.addresses, "Address deleted successfully"));
});

const getWishlist = asyncHandler(async (req, res) => {
    const user = await User.findById(req.user._id)
        .populate({ path: "wishlist", select: "name price images stock" })
        .select("wishlist");
    res.status(200).json(new ApiResponse(200, user.wishlist || [], "Wishlist fetched successfully"));
});

const addToWishlist = asyncHandler(async (req, res) => {
    const { productId } = req.body;
    if (!productId) throw new ApiError(400, "Product ID is required");
    
    await User.findByIdAndUpdate(req.user._id, { $addToSet: { wishlist: productId } });
    const updatedUser = await User.findById(req.user._id).populate("wishlist").select("wishlist");
    
    res.status(200).json(new ApiResponse(200, updatedUser.wishlist, "Product added to wishlist successfully"));
});

const removeFromWishlist = asyncHandler(async (req, res) => {
    const { productId } = req.params;
    await User.findByIdAndUpdate(req.user._id, { $pull: { wishlist: productId } });
    const updatedUser = await User.findById(req.user._id).populate("wishlist").select("wishlist");

    res.status(200).json(new ApiResponse(200, updatedUser.wishlist, "Product removed from wishlist successfully"));
});

const getCart = asyncHandler(async (req, res) => {
    const user = await User.findById(req.user._id)
        .populate({ path: "cart.product", select: "name price images stock" })
        .select("cart").lean();
    if (!user) throw new ApiError(404, "User not found");
    res.status(200).json(new ApiResponse(200, user.cart || [], "Cart fetched successfully"));
});

const addToCart = asyncHandler(async (req, res) => {
    const { productId, quantity = 1 } = req.body;
    if (!productId) throw new ApiError(400, "Product ID is required");

    const product = await Product.findById(productId);
    if (!product) throw new ApiError(404, "Product not found");
    if (product.stock < quantity) throw new ApiError(400, `Not enough stock. Only ${product.stock} left.`);

    const user = await User.findById(req.user._id);
    const itemIndex = user.cart.findIndex(item => item.product.toString() === productId);

    if (itemIndex > -1) {
        user.cart[itemIndex].quantity += quantity;
    } else {
        user.cart.push({ product: productId, quantity });
    }
    await user.save({ validateBeforeSave: false });
    
    const updatedCart = await User.findById(req.user._id).populate("cart.product").select("cart").lean();
    res.status(200).json(new ApiResponse(200, updatedCart.cart, "Product added to cart"));
});

const removeFromCart = asyncHandler(async (req, res) => {
    const { cartItemId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(cartItemId)) throw new ApiError(400, "Invalid Cart Item ID.");

    await User.findByIdAndUpdate(req.user._id, { $pull: { cart: { _id: cartItemId } } });

    const updatedCart = await User.findById(req.user._id).populate("cart.product").select("cart").lean();
    res.status(200).json(new ApiResponse(200, updatedCart.cart, "Item removed from cart"));
});

const updateCartQuantity = asyncHandler(async (req, res) => {
    const { productId } = req.params;
    const { quantity } = req.body;
    if (!quantity || quantity < 1) throw new ApiError(400, "A valid quantity is required.");

    await User.updateOne(
        { _id: req.user._id, "cart.product": productId },
        { $set: { "cart.$.quantity": quantity } }
    );
    
    const updatedCart = await User.findById(req.user._id).populate("cart.product").select("cart").lean();
    res.status(200).json(new ApiResponse(200, updatedCart.cart, "Cart quantity updated"));
});


const placeOrder = asyncHandler(async (req, res) => {
    const { addressId } = req.body;
    if (!addressId) throw new ApiError(400, "Shipping address ID is required.");
    
    const user = await User.findById(req.user._id).populate("cart.product", "name price stock");
    if (!user?.cart?.length) throw new ApiError(400, "Your cart is empty.");

    const shippingAddress = user.addresses.id(addressId);
    if (!shippingAddress) throw new ApiError(404, "Shipping address not found.");

    let totalPrice = 0;
    const orderItems = [];
    const stockUpdates = [];

    for (const item of user.cart) {
        if (item.product.stock < item.quantity) {
            throw new ApiError(400, `Not enough stock for "${item.product.name}".`);
        }
        totalPrice += item.product.price * item.quantity;
        orderItems.push({
            name: item.product.name,
            product: item.product._id,
            quantity: item.quantity,
            price: item.product.price,
        });
        stockUpdates.push({
            updateOne: {
                filter: { _id: item.product._id },
                update: { $inc: { stock: -item.quantity } },
            },
        });
    }

    const newOrder = await Order.create({
        user: req.user._id,
        orderItems,
        shippingAddress: shippingAddress.toObject(),
        totalPrice,
    });

    await Product.bulkWrite(stockUpdates);
    user.cart = [];
    await user.save({ validateBeforeSave: false });

    res.status(201).json(new ApiResponse(201, newOrder, "Order placed successfully!"));
});

 const placeCodOrder = asyncHandler(async (req, res) => {
  const { addressId } = req.body;
  if (!addressId) throw new ApiError(400, "Shipping address ID is required.");

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
      const user = await User.findById(req.user._id)
          .populate("cart.product", "name price stock")
          .session(session);
      if (!user?.cart?.length) throw new ApiError(400, "Your cart is empty.");

      const shippingAddress = user.addresses.id(addressId);
      if (!shippingAddress) throw new ApiError(404, "Shipping address not found.");

      let subtotal = 0;
      const orderItems = [];
      const stockUpdates = [];

      for (const item of user.cart) {
          if (item.product.stock < item.quantity) {
              throw new ApiError(400, `Not enough stock for "${item.product.name}".`);
          }
          subtotal += item.product.price * item.quantity;
          orderItems.push({
              name: item.product.name,
              product: item.product._id,
              quantity: item.quantity,
              price: item.product.price,
          });
          stockUpdates.push({
              updateOne: {
                  filter: { _id: item.product._id },
                  update: { $inc: { stock: -item.quantity } },
              },
          });
      }
      
      // Simplified shipping and total calculation
      const shippingCharge = subtotal > 2000 ? 0 : 99; // Same rule as Razorpay
      const finalTotalPrice = subtotal + shippingCharge;

      const [newOrder] = await Order.create([{
          user: req.user._id,
          orderItems,
          shippingAddress: shippingAddress.toObject(),
          itemsPrice: subtotal,
          shippingPrice: shippingCharge,
          taxPrice: 0, // Simplified
          totalPrice: finalTotalPrice,
          paymentMethod: "COD",
          orderStatus: "Processing",
      }], { session });

      await Product.bulkWrite(stockUpdates, { session });
      user.cart = [];
      await user.save({ session, validateBeforeSave: false });

      await session.commitTransaction();
      res.status(201).json(new ApiResponse(201, { order: newOrder }, "COD Order placed successfully!"));
  
  } catch (error) {
      await session.abortTransaction();
      throw error;
  } finally {
      session.endSession();
  }
});


const getMyOrders = asyncHandler(async (req, res) => {
    const orders = await Order.find({ user: req.user._id })
        .populate("orderItems.product", "name images")
        .sort({ createdAt: -1 }).lean();
    res.status(200).json(new ApiResponse(200, orders, "All user orders fetched"));
});

const getSingleOrder = asyncHandler(async (req, res) => {
    const { orderId } = req.params;
    const order = await Order.findOne({ _id: orderId, user: req.user._id })
        .populate("orderItems.product", "name images price").lean();
    if (!order) throw new ApiError(404, "Order not found.");
    res.status(200).json(new ApiResponse(200, order, "Order detail fetched successfully"));
});

//GET PRODUCT 
const getProductById = asyncHandler(async (req, res) => {
  const { productId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(productId)) {
    throw new ApiError(400, "Invalid product ID format.");
  }

  const product = await Product.findById(productId);

  if (!product) {
    throw new ApiError(404, "Product not found.");
  }

  return res
    .status(200)
    .json(new ApiResponse(200, product, "Product details fetched successfully."));
});

const getProductBySlug = asyncHandler(async (req, res)=>{
  const { slug } = req.params;

  const product = await Product.findOne({slug});
  // console.log(product)
  if (!product) {
    throw new ApiError(404, "Product not found.");
  }

  return res
    .status(200)
    .json(new ApiResponse(200, product, "Product details fetched successfully."));
})


const getProductsWithVideos = asyncHandler(async (req, res) => {
  const { type, limit } = req.query;
  const query = {
    video: { $exists: true, $ne: [] }
  };

  if (type) {
    query.type = type;
  }

  // Build the query
  let productsQuery = Product.find(query);

  // Apply the limit if it exists
  if (limit) {
    productsQuery = productsQuery.limit(parseInt(limit, 10));
  }

  const products = await productsQuery;

  if (!products.length) {
    return res
      .status(404)
      .json(new ApiResponse(404, [], "No products with videos found."));
  }

  return res
    .status(200)
    .json(new ApiResponse(200, products, "Products with videos fetched successfully."));
});



export {
    getMyProfile,
    updateMyProfile,
    getProductBySlug,
    setDefaultAddress,
    updateUserAvatar,
    getAddresses,
    addAddress,
    updateAddress,
    deleteAddress,
    getProductById,
    getWishlist,
    addToWishlist,
    removeFromWishlist,
    getCart,
    addToCart,
    removeFromCart,
    updateCartQuantity,
    placeOrder,
    getMyOrders,
    getSingleOrder,
    placeCodOrder,
    getProductsWithVideos
};