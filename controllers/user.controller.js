import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { ApiError } from "../utils/ApiError.js";
import { Order } from "../models/order.model.js";
import { User } from "../models/user.model.js";
import { Product } from "../models/product.model.js";
import { uploadOnCloudinary } from "../config/cloudinary.js";
import fs from "fs";
import mongoose from "mongoose";

const getUserDashboardStats = asyncHandler(async (req, res) => {
  const [pendingOrdersCount, user] = await Promise.all([
    Order.countDocuments({ user: req.user._id, orderStatus: "Pending" }),
    User.findById(req.user._id).select("wishlist addresses cart").lean(),
  ]);

  if (!user) {
    throw new ApiError(404, "User not found");
  }

  res.status(200).json(
    new ApiResponse(
      200,
      {
        pendingOrders: pendingOrdersCount,
        wishlistItems: user.wishlist?.length || 0,
        cartItems: user.cart?.length || 0,
        savedAddresses: user.addresses?.length || 0,
      },
      "Stats fetched successfully"
    )
  );
});

const getRecentUserOrders = asyncHandler(async (req, res) => {
  const orders = await Order.find({ user: req.user._id })
    .sort({ createdAt: -1 })
    .limit(5)
    .select("totalPrice orderStatus createdAt")
    .lean();

  res.status(200).json(
    new ApiResponse(
      200,
      orders.map((order) => ({
        orderId: `ORD-${order._id.toString().slice(-6).toUpperCase()}`,
        date: order.createdAt,
        total: order.totalPrice,
        status: order.orderStatus,
      })),
      "Recent orders fetched successfully"
    )
  );
});

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

const updateMyProfile = asyncHandler(async (req, res) => {
  const { name } = req.body;
  if (!name || name.trim() === "") {
    throw new ApiError(400, "Name is required");
  }

  const updatedUser = await User.findByIdAndUpdate(
    req.user._id,
    { $set: { name } },
    { new: true }
  ).select("-password");

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
    const avatar = await uploadOnCloudinary(avatarLocalPath);
    if (!avatar?.url) {
      throw new ApiError(500, "Error while uploading avatar to Cloudinary");
    }

    const updatedUser = await User.findByIdAndUpdate(
      req.user._id,
      { $set: { avatar: avatar.url } },
      { new: true }
    ).select("-password");

    res
      .status(200)
      .json(new ApiResponse(200, updatedUser, "Avatar updated successfully"));
  } finally {
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
    isDefault: user.addresses.length === 0,
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
    !updateData.fullName ||
    !updateData.phone ||
    !updateData.street ||
    !updateData.city ||
    !updateData.state ||
    !updateData.postalCode
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
    .json(
      new ApiResponse(
        200,
        updatedUser.addresses,
        "Address updated successfully"
      )
    );
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
    .populate({ path: "wishlist", select: "name price mainImage images stock" })
    .select("wishlist");
  res
    .status(200)
    .json(
      new ApiResponse(200, user.wishlist || [], "Wishlist fetched successfully")
    );
});

const addToWishlist = asyncHandler(async (req, res) => {
  const { productId } = req.body;
  if (!productId) throw new ApiError(400, "Product ID is required");
  await User.findByIdAndUpdate(req.user._id, {
    $addToSet: { wishlist: productId },
  });
  const updatedUser = await User.findById(req.user._id)
    .populate("wishlist")
    .select("wishlist");
  res
    .status(200)
    .json(
      new ApiResponse(
        200,
        updatedUser.wishlist,
        "Product added to wishlist successfully"
      )
    );
});

const removeFromWishlist = asyncHandler(async (req, res) => {
  const { productId } = req.params;
  await User.findByIdAndUpdate(req.user._id, {
    $pull: { wishlist: productId },
  });
  const updatedUser = await User.findById(req.user._id)
    .populate("wishlist")
    .select("wishlist");
  res
    .status(200)
    .json(
      new ApiResponse(
        200,
        updatedUser.wishlist,
        "Product removed from wishlist successfully"
      )
    );
});

const getCart = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id)
    .populate({
      path: "cart.product",
      select: "name price mainImage images stock",
    })
    .select("cart")
    .lean();

  if (!user) throw new ApiError(404, "User not found");
  res
    .status(200)
    .json(new ApiResponse(200, user.cart || [], "Cart fetched successfully"));
});

const addToCart = asyncHandler(async (req, res) => {
  const { productId, quantity = 1 } = req.body;
  const userId = req.user._id;

  if (!productId) throw new ApiError(400, "Product ID is required");
  const product = await Product.findById(productId);
  if (!product) throw new ApiError(404, "Product not found");
  if (product.stock < quantity)
    throw new ApiError(
      400,
      `Not enough stock for ${product.name}. Only ${product.stock} left.`
    );

  const user = await User.findById(userId);
  const existingCartItemIndex = user.cart.findIndex(
    (item) => item.product.toString() === productId
  );

  if (existingCartItemIndex > -1) {
    user.cart[existingCartItemIndex].quantity += quantity;
  } else {
    user.cart.push({ product: productId, quantity });
  }

  await user.save({ validateBeforeSave: false });
  const updatedUser = await User.findById(userId)
    .populate("cart.product")
    .select("cart")
    .lean();
  res
    .status(200)
    .json(
      new ApiResponse(
        200,
        updatedUser.cart,
        "Product added to cart successfully"
      )
    );
});

const removeFromCart = asyncHandler(async (req, res) => {
  const { cartItemId } = req.params;
  const userId = req.user._id;

  if (!mongoose.Types.ObjectId.isValid(cartItemId)) {
    throw new ApiError(400, "Invalid Cart Item ID format.");
  }

  await User.findByIdAndUpdate(userId, {
    $pull: { cart: { _id: cartItemId } },
  });

  const updatedUser = await User.findById(userId)
    .populate("cart.product", "name price mainImage stock")
    .select("cart")
    .lean();

  res
    .status(200)
    .json(
      new ApiResponse(
        200,
        updatedUser.cart || [],
        "Item removed from cart successfully"
      )
    );
});

const updateCartQuantity = asyncHandler(async (req, res) => {
  const { productId } = req.params;
  const { quantity } = req.body;
  const userId = req.user._id;

  if (!quantity || quantity < 1)
    throw new ApiError(400, "A valid quantity is required.");

  const user = await User.findOne({ _id: userId, "cart.product": productId });
  if (!user) throw new ApiError(404, "Product not found in cart");

  await User.updateOne(
    { _id: userId, "cart.product": productId },
    { $set: { "cart.$.quantity": quantity } }
  );

  const updatedUser = await User.findById(userId)
    .populate("cart.product")
    .select("cart")
    .lean();
  res
    .status(200)
    .json(new ApiResponse(200, updatedUser.cart, "Cart quantity updated"));
});

const placeOrder = asyncHandler(async (req, res) => {
  const { addressId } = req.body;
  const userId = req.user._id;

  if (!addressId) throw new ApiError(400, "Shipping address ID is required.");
  const user = await User.findById(userId).populate({
    path: "cart.product",
    select: "name price stock",
  });

  if (!user || !user.cart || user.cart.length === 0)
    throw new ApiError(400, "Your cart is empty. Cannot place an order.");

  const shippingAddress = user.addresses.id(addressId);
  if (!shippingAddress)
    throw new ApiError(404, "Shipping address not found in your profile.");

  let totalPrice = 0;
  const orderItems = [];
  const productStockUpdates = [];

  for (const item of user.cart) {
    const product = item.product;
    if (!product)
      throw new ApiError(
        400,
        `A product in your cart is no longer available. Please remove it and try again.`
      );
    if (product.stock < item.quantity)
      throw new ApiError(
        400,
        `Not enough stock for "${product.name}". Only ${product.stock} available.`
      );

    totalPrice += product.price * item.quantity;
    orderItems.push({
      name: product.name,
      product: product._id,
      quantity: item.quantity,
      price: product.price,
    });
    productStockUpdates.push({
      updateOne: {
        filter: { _id: product._id },
        update: { $inc: { stock: -item.quantity } },
      },
    });
  }

  const newOrder = await Order.create({
    user: userId,
    orderItems,
    shippingAddress: {
      street: shippingAddress.street,
      city: shippingAddress.city,
      state: shippingAddress.state,
      postalCode: shippingAddress.postalCode,
      country: shippingAddress.country,
    },
    totalPrice,
  });

  if (!newOrder)
    throw new ApiError(500, "Something went wrong while placing the order.");

  await Product.bulkWrite(productStockUpdates);
  user.cart = [];
  await user.save({ validateBeforeSave: false });

  res
    .status(201)
    .json(new ApiResponse(201, newOrder, "Order placed successfully!"));
});

const getMyOrders = asyncHandler(async (req, res) => {
  const orders = await Order.find({ user: req.user._id })
    .populate({ path: "orderItems.product", select: "name mainImage" })
    .sort({ createdAt: -1 })
    .lean();
  res
    .status(200)
    .json(new ApiResponse(200, orders, "All user orders fetched successfully"));
});

const getSingleOrder = asyncHandler(async (req, res) => {
  const { orderId } = req.params;
  const order = await Order.findOne({ _id: orderId, user: req.user._id })
    .populate({ path: "orderItems.product", select: "name mainImage price" })
    .lean();
  if (!order)
    throw new ApiError(
      404,
      "Order not found or you do not have permission to view it."
    );
  res
    .status(200)
    .json(new ApiResponse(200, order, "Order detail fetched successfully"));
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

export {
  getUserDashboardStats,
  getRecentUserOrders,
  getMyProfile,
  updateMyProfile,
  updateUserAvatar,
  getAddresses,
  addAddress,
  updateAddress,
  deleteAddress,
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
  getProductById
};
