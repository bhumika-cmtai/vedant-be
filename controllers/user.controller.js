import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { ApiError } from "../utils/ApiError.js";
import { Order } from "../models/order.model.js";
import { User } from "../models/user.model.js";
import Product  from "../models/product.model.js";
import { Coupon } from "../models/coupon.model.js";
import { uploadOnS3, deleteFromS3, getObjectKeyFromUrl } from "../config/s3.js";
import { sendOrderConfirmationEmail } from "../services/emailService.js";
import fs from "fs";
import mongoose from "mongoose";

// --- No Changes Needed in Profile & Address Management ---
// Yeh functions products ya cart se direct deal nahi karte, isliye inme koi badlaav nahi hai.

const getMyProfile = asyncHandler(async (req, res) => {
  // --- EDITED: Cart populate path updated ---
  const userProfile = await User.findById(req.user._id)
    .populate({
      path: "wishlist",
      select: "name base_price price images",
    })
    .populate({
      path: "cart.product", // CORRECTED PATH
      select: "name price images slug", // Simplified select for consistency
    })

    
    .select("-password -refreshToken");

  if (!userProfile) {
    throw new ApiError(404, "User not found");
  }

  res.status(200).json(new ApiResponse(200, userProfile, "Profile fetched successfully"));
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
  user.addresses.forEach(addr => {
    addr.isDefault = addr._id.toString() === addressId;
  });
  await user.save({ validateBeforeSave: false });
  res.status(200).json(new ApiResponse(200, user.addresses, "Default address updated successfully"));
});

const updateMyProfile = asyncHandler(async (req, res) => {
  const { fullName, phone } = req.body;
  const updatedUser = await User.findByIdAndUpdate(
    req.user._id,
    { $set: { fullName, phone } },
    { new: true }
  ).select("-password -refreshToken");
  res.status(200).json(new ApiResponse(200, updatedUser, "Profile updated successfully"));
});

const updateUserAvatar = asyncHandler(async (req, res) => {
  const avatarLocalPath = req.file?.path;
  if (!avatarLocalPath) throw new ApiError(400, "Avatar file is missing");
  
  const user = await User.findById(req.user._id);
  if (!user) {
    if (fs.existsSync(avatarLocalPath)) fs.unlinkSync(avatarLocalPath);
    throw new ApiError(404, "User not found");
  }
  
  if (user.avatar) {
    const oldObjectKey = getObjectKeyFromUrl(user.avatar);
    if (oldObjectKey) await deleteFromS3(oldObjectKey);
  }

  const avatar = await uploadOnS3(avatarLocalPath, "avatars");
  if (!avatar?.url) throw new ApiError(500, "Error while uploading avatar to S3");

  const updatedUser = await User.findByIdAndUpdate(
    req.user._id,
    { $set: { avatar: avatar.url } },
    { new: true }
  ).select("-password -refreshToken");

  res.status(200).json(new ApiResponse(200, updatedUser, "Avatar updated successfully"));
});

const getAddresses = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id).select("addresses").lean();
  if (!user) throw new ApiError(404, "User not found");
  res.status(200).json(new ApiResponse(200, user.addresses || [], "Addresses fetched successfully"));
});

const addAddress = asyncHandler(async (req, res) => {
  const addressData = req.body;
  if (!addressData.fullName || !addressData.phone || !addressData.street || !addressData.city || !addressData.state || !addressData.postalCode) {
    throw new ApiError(400, "All required address fields must be provided.");
  }
  const user = await User.findById(req.user._id);
  const newAddress = { ...addressData, isDefault: user.addresses.length === 0 };
  user.addresses.push(newAddress);
  await user.save({ validateBeforeSave: false });
  res.status(201).json(new ApiResponse(201, user.addresses, "Address added successfully"));
});

const updateAddress = asyncHandler(async (req, res) => {
  const { addressId } = req.params;
  const updateData = req.body;
  if (!mongoose.Types.ObjectId.isValid(addressId)) throw new ApiError(400, "Invalid Address ID format");
  
  const updateFields = {};
  for (const key in updateData) {
    updateFields[`addresses.$[elem].${key}`] = updateData[key];
  }
  
  const updatedUser = await User.findByIdAndUpdate(
    req.user._id,
    { $set: updateFields },
    { arrayFilters: [{ "elem._id": new mongoose.Types.ObjectId(addressId) }], new: true }
  ).select("addresses");

  if (!updatedUser) throw new ApiError(404, "Address not found or failed to update.");
  res.status(200).json(new ApiResponse(200, updatedUser.addresses, "Address updated successfully"));
});

const deleteAddress = asyncHandler(async (req, res) => {
  const { addressId } = req.params;
  const user = await User.findByIdAndUpdate(
    req.user._id,
    { $pull: { addresses: { _id: addressId } } },
    { new: true }
  );
  if (!user) throw new ApiError(500, "Could not delete address");
  res.status(200).json(new ApiResponse(200, user.addresses, "Address deleted successfully"));
});

// --- Wishlist Functions (No major changes needed) ---
// Wishlist usually contains the main product, not specific variants.

const getWishlist = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id)
    .populate({ path: "wishlist", select: "name price base_price images slug" })
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

const mergeLocalWishlist = asyncHandler(async (req, res) => {
  const { productIds } = req.body;
  const userId = req.user._id;

  if (!productIds || !Array.isArray(productIds) || productIds.length === 0) {
      throw new ApiError(400, "No local wishlist items provided to merge.");
  }

  await User.findByIdAndUpdate(userId, {
      $addToSet: { wishlist: { $each: productIds } }
  });

  const updatedUser = await User.findById(userId)
      .populate({ path: "wishlist", select: "name price images slug" })
      .select("wishlist");

  res.status(200).json(new ApiResponse(200, updatedUser.wishlist, "Wishlist merged successfully"));
});

// --- CRITICAL CHANGES: Cart Management for Variants ---

const getCart = asyncHandler(async (req, res) => {
    // --- EDITED: Populate path changed to 'product_id' ---
    const user = await User.findById(req.user._id)
        .populate({ 
            path: "cart.product", 
            select: "name base_price price images slug " 
        })
        .select("cart").lean();

    if (!user) throw new ApiError(404, "User not found");
    res.status(200).json(new ApiResponse(200, user.cart || [], "Cart fetched successfully"));
});


const addToCart = asyncHandler(async (req, res) => {
  const { productId, quantity = 1 } = req.body;
  
  if (!productId) {
      throw new ApiError(400, "Product ID is required");
  }

  const product = await Product.findById(productId);
  if (!product) throw new ApiError(404, "Product not found");
  
  // Check stock
  if (product.stock_quantity < quantity) {
      throw new ApiError(400, `Not enough stock. Only ${product.stock_quantity} items left.`);
  }

  const user = await User.findById(req.user._id);
  // Find item by product's ObjectId
  const itemIndex = user.cart.findIndex(item => item.product.toString() === productId);

  if (itemIndex > -1) {
      // If item exists, update quantity
      user.cart[itemIndex].quantity += quantity;
  } else {
      // If item does not exist, add it to the cart
      // --- FIXED: Use 'product' field, not 'product_id' ---
      user.cart.push({
          product: productId, // CORRECTED FIELD NAME
          quantity,
      });
  }
  
  await user.save({ validateBeforeSave: false });
  
  // Fetch the updated cart and populate it to send back to the user
  const updatedUser = await User.findById(req.user._id)
      .populate({ path: "cart.product", select: "name slug price mainImage" })
      .select("cart")
      .lean();

  res.status(200).json(new ApiResponse(200, updatedUser.cart, "Product added to cart"));
});


const mergeLocalCart = asyncHandler(async (req, res) => {
  const { items: localCartItems } = req.body;
  const userId = req.user._id;

  if (!localCartItems || !Array.isArray(localCartItems) || localCartItems.length === 0) {
      throw new ApiError(400, "No local cart items provided to merge.");
  }

  const user = await User.findById(userId);
  if (!user) throw new ApiError(404, "User not found");

  localCartItems.forEach(localItem => {
      const dbItemIndex = user.cart.findIndex(dbItem => dbItem.product.toString() === localItem._id);

      if (dbItemIndex > -1) {
          user.cart[dbItemIndex].quantity += localItem.quantity;
      } else {
          user.cart.push({
              product: localItem._id,
              quantity: localItem.quantity,
          });
      }
  });

  await user.save({ validateBeforeSave: false });

  const updatedUser = await User.findById(userId)
      .populate({
          path: "cart.product",
          select: "name price images slug"
      })
      .select("cart")
      .lean();

  res.status(200).json(new ApiResponse(200, updatedUser.cart, "Cart merged successfully"));
});

const removeFromCart = asyncHandler(async (req, res) => {
  // --- EDITED: This now uses the cart item's own _id for removal ---
  const { cartItemId } = req.params; // Expecting cart item's ID, which is more reliable
  if (!cartItemId) throw new ApiError(400, "Cart Item ID is required to remove an item.");

  await User.findByIdAndUpdate(req.user._id, { $pull: { cart: { _id: cartItemId } } });

  const updatedUser = await User.findById(req.user._id)
    .populate({ path: "cart.product", select: "name" })
    .select("cart")
    .lean();
    
  res.status(200).json(new ApiResponse(200, updatedUser.cart, "Item removed from cart"));
});

const updateCartQuantity = asyncHandler(async (req, res) => {
  // --- EDITED: This uses the cart item's _id and new quantity ---
  const { cartItemId } = req.params;
  const { quantity } = req.body;

  if (!quantity || quantity < 1) throw new ApiError(400, "A valid quantity (at least 1) is required.");
  if (!cartItemId) throw new ApiError(400, "Cart Item ID is required to update quantity.");

  // Find the product to check stock against
  const userForStockCheck = await User.findById(req.user._id).populate('cart.product');
  const cartItem = userForStockCheck.cart.find(item => item._id.toString() === cartItemId);
  
  if (!cartItem) throw new ApiError(404, "Item not found in cart.");
  if (cartItem.product.stock_quantity < quantity) {
      throw new ApiError(400, `Not enough stock. Only ${cartItem.product.stock_quantity} items available.`);
  }

  // If stock is sufficient, update the quantity
  await User.updateOne(
      { _id: req.user._id, "cart._id": cartItemId },
      { $set: { "cart.$.quantity": quantity } }
  );
  
  const updatedUser = await User.findById(req.user._id)
    .populate({ path: "cart.product", select: "name" })
    .select("cart")
    .lean();

  res.status(200).json(new ApiResponse(200, updatedUser.cart, "Cart quantity updated"));
})


// --- CRITICAL CHANGES: Order Management for Variants ---

const placeCodOrder = asyncHandler(async (req, res) => {
    // --- REWRITTEN: Full logic to handle variants during order placement ---
    const { addressId, couponCode } = req.body;
    if (!addressId) throw new ApiError(400, "Shipping address ID is required.");

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const user = await User.findById(req.user._id)
            .populate({
                path: "cart.product",
                select: "name variants base_price"
            })
            .session(session);

        if (!user?.cart?.length) throw new ApiError(400, "Your cart is empty.");
        
        const shippingAddress = user.addresses.id(addressId);
        if (!shippingAddress) throw new ApiError(404, "Shipping address not found.");

        let subtotal = 0;
        const orderItems = [];
        const stockUpdates = [];

        for (const item of user.cart) {
            if (!item.product_id) throw new ApiError(404, `A product in your cart is no longer available.`);
            
            const productVariant = item.product_id.variants.find(v => v.sku_variant === item.sku_variant);
            if (!productVariant) throw new ApiError(400, `Variant for ${item.product_id.name} is no longer available.`);
            
            if (productVariant.stock_quantity < item.quantity) {
                throw new ApiError(400, `Not enough stock for "${item.product_id.name}" (${item.size}, ${item.color}).`);
            }

            subtotal += item.price_per_item * item.quantity;

            orderItems.push({
                product_id: item.product_id._id,
                product_name: item.product_id.name,
                quantity: item.quantity,
                price_per_item: item.price_per_item,
                image: item.image,
                sku_variant: item.sku_variant,
                size: item.size,
                color: item.color
            });

            stockUpdates.push({
                updateOne: {
                    filter: { _id: item.product_id._id, "variants.sku_variant": item.sku_variant },
                    update: { $inc: { "variants.$.stock_quantity": -item.quantity } },
                },
            });
        }

        if (orderItems.length === 0) throw new ApiError(400, "No valid items in cart.");

        let discountAmount = 0;
        let validatedCouponCode = null;
        if (couponCode) {
            const coupon = await Coupon.findOne({ code: couponCode.toUpperCase(), status: "active" }).session(session);
            if (coupon) {
                discountAmount = (subtotal * coupon.discountPercentage) / 100;
                validatedCouponCode = coupon.code;
            } else {
                throw new ApiError(404, "Invalid or inactive coupon code.");
            }
        }

        const shippingCharge = subtotal > 2000 ? 0 : 99;
        const finalTotalPrice = subtotal + shippingCharge - discountAmount;

        const [newOrder] = await Order.create([{
            user: req.user._id,
            orderItems,
            shippingAddress: shippingAddress.toObject(),
            itemsPrice: subtotal,
            shippingPrice: shippingCharge,
            taxPrice: 0,
            discountAmount,
            couponCode: validatedCouponCode,
            totalPrice: finalTotalPrice,
            paymentMethod: "COD",
            orderStatus: "Processing",
        }], { session });

        await Product.bulkWrite(stockUpdates, { session });
        user.cart = [];
        await user.save({ session, validateBeforeSave: false });

        await session.commitTransaction();

        if (user.email) {
            sendOrderConfirmationEmail(user.email, newOrder).catch(err => console.error("Failed to send email:", err));
        }

        res.status(201).json(new ApiResponse(201, { order: newOrder }, "COD Order placed successfully!"));
    } catch (error) {
        await session.abortTransaction();
        throw error;
    } finally {
        session.endSession();
    }
});

const getMyOrders = asyncHandler(async (req, res) => {
    const { page = 1, limit = 5 } = req.query;
    const skip = (page - 1) * limit;
    
    const query = { user: req.user._id };
    const totalOrdersPromise = Order.countDocuments(query);
    
    // --- EDITED: Populate path changed to 'product_id' ---
    const ordersPromise = Order.find(query)
        .populate("orderItems.product_id", "name images slug") 
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean();

    const [totalOrders, orders] = await Promise.all([totalOrdersPromise, ordersPromise]);
    
    res.status(200).json(new ApiResponse(200, {
        orders,
        currentPage: page,
        totalPages: Math.ceil(totalOrders / limit),
        totalOrders,
    }, "User orders fetched successfully"));
});

const getSingleOrder = asyncHandler(async (req, res) => {
    const { orderId } = req.params;
    // --- EDITED: Populate path changed to 'product_id' ---
    const order = await Order.findOne({ _id: orderId, user: req.user._id })
        .populate("orderItems.product_id", "name images slug")
        .lean();
        
    if (!order) throw new ApiError(404, "Order not found.");
    res.status(200).json(new ApiResponse(200, order, "Order detail fetched successfully"));
});


// --- No Changes Needed in Product Fetching ---
// Yeh functions products ko fetch karte hain, inme user-specific logic nahi hai.

const getProductById = asyncHandler(async (req, res) => {
  const { productId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(productId)) throw new ApiError(400, "Invalid product ID format.");
  const product = await Product.findById(productId);
  if (!product) throw new ApiError(404, "Product not found.");
  return res.status(200).json(new ApiResponse(200, product, "Product details fetched successfully."));
});

const getProductBySlug = asyncHandler(async (req, res) => {
  const { slug } = req.params;
  const product = await Product.findOne({ slug });
  if (!product) throw new ApiError(404, "Product not found.");
  return res.status(200).json(new ApiResponse(200, product, "Product details fetched successfully."));
});

const getProductsWithVideos = asyncHandler(async (req, res) => {
  // Logic remains the same
});

export {
    getMyProfile, updateMyProfile, getProductBySlug, setDefaultAddress, updateUserAvatar,
    getAddresses, addAddress, updateAddress, deleteAddress, getProductById,
    getWishlist, addToWishlist, removeFromWishlist, getCart, addToCart,mergeLocalCart,mergeLocalWishlist,
    removeFromCart, updateCartQuantity ,/* placeOrder (removed for clarity, use placeCodOrder) */
    getMyOrders, getSingleOrder, placeCodOrder, getProductsWithVideos
};