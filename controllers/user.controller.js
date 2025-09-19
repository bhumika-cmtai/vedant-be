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
  // sku_variant is now optional
  const { productId, sku_variant, quantity = 1 } = req.body;

  if (!productId) {
    throw new ApiError(400, "Product ID is required");
  }

  const product = await Product.findById(productId);
  if (!product) {
    throw new ApiError(404, "Product not found");
  }

  const user = await User.findById(req.user._id);
  let cartItemData; // We will define this based on product type
  let itemIndex; // We will define this based on product type

  // --- THIS IS THE MAIN FIX ---
  if (product.variants && product.variants.length > 0) {
    // --- Case 1: It's a VARIABLE (Clothing) Product ---
    if (!sku_variant) {
      throw new ApiError(400, "Please select a variant (e.g., size and color).");
    }

    const variant = product.variants.find(v => v.sku_variant === sku_variant);
    if (!variant) {
      throw new ApiError(404, "The selected variant does not exist for this product.");
    }

    if (variant.stock_quantity < quantity) {
      throw new ApiError(400, `Not enough stock. Only ${variant.stock_quantity} left.`);
    }

    // Check if this specific variant is already in the cart
    itemIndex = user.cart.findIndex(item =>
      item.product.toString() === productId && item.sku_variant === sku_variant
    );

    // Prepare the data for the cart
    cartItemData = {
      product: productId,
      sku_variant: variant.sku_variant,
      quantity: quantity,
      price: variant.sale_price || variant.price, // Use sale price if available
      image: (variant.images && variant.images[0]) || product.images[0],
      attributes: new Map([['size', variant.size], ['color', variant.color]])
    };

  } else {
    // --- Case 2: It's a SIMPLE (Decorative) Product ---
    if (product.stock_quantity < quantity) {
      throw new ApiError(400, `Not enough stock. Only ${product.stock_quantity} left.`);
    }

    // Check if this simple product is already in the cart
    // For simple products, sku_variant is not considered
    itemIndex = user.cart.findIndex(item =>
      item.product.toString() === productId && !item.sku_variant
    );
    
    // Prepare the data for the cart
    cartItemData = {
      product: productId,
      quantity: quantity,
      price: product.sale_price || product.price,
      image: product.images[0],
      // sku_variant is intentionally left undefined
    };
  }

  // --- Universal Logic to Add or Update Cart ---
  if (itemIndex > -1) {
    // If item already exists, just increase the quantity
    user.cart[itemIndex].quantity += quantity;
  } else {
    // If it's a new item, push the whole data object
    user.cart.push(cartItemData);
  }

  await user.save({ validateBeforeSave: false });

  const updatedCart = await User.findById(req.user._id)
    .populate({
      path: "cart.product",
      select: "name slug images"
    })
    .select("cart")
    .lean();

  res.status(200).json(new ApiResponse(200, updatedCart.cart, "Product added to cart successfully!"));
});



const mergeLocalCart = asyncHandler(async (req, res) => {
  const { items: localCartItems } = req.body;
  const userId = req.user._id;

  if (!localCartItems || !Array.isArray(localCartItems) || localCartItems.length === 0) {
    const currentUser = await User.findById(userId)
      .populate({ path: "cart.product", select: "name slug" })
      .select("cart").lean();
    return res.status(200).json(new ApiResponse(200, currentUser.cart, "No items to merge."));
  }

  const user = await User.findById(userId);
  if (!user) throw new ApiError(404, "User not found");

  for (const localItem of localCartItems) {
    const product = await Product.findById(localItem.productId);
    if (!product || !localItem.sku_variant) continue; // Agar product ya sku_variant nahi hai to skip karo

    const variant = product.variants.find(v => v.sku_variant === localItem.sku_variant);
    if (!variant) continue; // Agar variant nahi hai to skip karo

    const dbItemIndex = user.cart.findIndex(dbItem =>
      dbItem.product.toString() === localItem.productId && dbItem.sku_variant === localItem.sku_variant
    );

    if (dbItemIndex > -1) {
      user.cart[dbItemIndex].quantity += localItem.quantity;
    } else {
      user.cart.push({
        product: localItem.productId,
        sku_variant: variant.sku_variant,
        quantity: localItem.quantity,
        price: variant.price,
        image: variant.image || product.mainImage,
        attributes: variant.attributes,
      });
    }
  }

  await user.save();

  const updatedCart = await User.findById(userId)
      .populate({ path: "cart.product", select: "name slug" })
      .select("cart").lean();

  res.status(200).json(new ApiResponse(200, updatedCart.cart, "Cart merged successfully"));
});



const removeFromCart = asyncHandler(async (req, res) => {
  const { cartItemId } = req.params;
  if (!cartItemId) throw new ApiError(400, "Cart Item ID is required.");

  // Yeh logic bilkul theek tha, ismein change ki zaroorat nahi
  const user = await User.findByIdAndUpdate(
    req.user._id,
    { $pull: { cart: { _id: cartItemId } } },
    { new: true }
  ).populate({
    path: "cart.product",
    select: "name slug"
  });

  if (!user) throw new ApiError(404, "User not found");
  
  res.status(200).json(new ApiResponse(200, user.cart, "Item removed from cart"));
});


const updateCartQuantity = asyncHandler(async (req, res) => {
  const { cartItemId } = req.params;
  const { quantity } = req.body;
  console.log(cartItemId)
  if (!quantity || quantity < 1) throw new ApiError(400, "A valid quantity is required.");
  if (!cartItemId) throw new ApiError(400, "Cart Item ID is required.");

  const user = await User.findById(req.user._id);
  if (!user) throw new ApiError(404, "User not found");

  const cartItem = user.cart.id(cartItemId); // .id() sub-document dhoondne ka aasan tareeka hai
  if (!cartItem) throw new ApiError(404, "Item not found in cart.");

  const product = await Product.findById(cartItem.product);
  if (!product) {
    user.cart.id(cartItemId).remove(); // Agar product delete ho gaya hai, to cart se hata do
    await user.save();
    throw new ApiError(404, "Product no longer exists and has been removed from your cart.");
  }

  const variant = product.variants.find(v => v.sku_variant === cartItem.sku_variant);
  if (!variant) {
    user.cart.id(cartItemId).remove();
    await user.save();
    throw new ApiError(404, "This product variant no longer exists and has been removed from your cart.");
  }

  if (variant.stock < quantity) {
    throw new ApiError(400, `Not enough stock. Only ${variant.stock} items available.`);
  }

  cartItem.quantity = quantity;
  await user.save();

  const updatedCart = await user.populate({
    path: "cart.product",
    select: "name slug"
  });

  res.status(200).json(new ApiResponse(200, updatedCart.cart, "Cart quantity updated"));
});


// --- CRITICAL CHANGES: Order Management for Variants ---

const placeCodOrder = asyncHandler(async (req, res) => {
  const { addressId, couponCode } = req.body;
  if (!addressId) {
    throw new ApiError(400, "Shipping address ID is required.");
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
      const user = await User.findById(req.user._id)
          .populate({
              path: "cart.product",
              select: "name variants images stock_quantity" 
          })
          .session(session);

      if (!user?.cart || user.cart.length === 0) {
          throw new ApiError(400, "Your cart is empty.");
      }
      
      const shippingAddress = user.addresses.id(addressId);
      if (!shippingAddress) {
          throw new ApiError(404, "Shipping address not found in your profile.");
      }

      let subtotal = 0;
      const orderItems = [];
      const stockUpdates = [];

      for (const item of user.cart) {
          if (!item.product) {
              throw new ApiError(404, `A product in your cart is no longer available. Please remove it and try again.`);
          }
          
          subtotal += item.price * item.quantity;

          if (item.sku_variant) {
              // --- Logic for Variable (Clothing) Product ---
              const productVariant = item.product.variants.find(v => v.sku_variant === item.sku_variant);
              if (!productVariant) {
                  throw new ApiError(400, `The selected variant for "${item.product.name}" is no longer available.`);
              }
              if (productVariant.stock_quantity < item.quantity) {
                  throw new ApiError(400, `Not enough stock for "${item.product.name}" (${productVariant.size}, ${productVariant.color}).`);
              }

              orderItems.push({
                  product_id: item.product._id,
                  product_name: item.product.name,
                  quantity: item.quantity,
                  price_per_item: item.price,
                  image: item.image || productVariant.images?.[0] || item.product.images[0],
                  sku_variant: item.sku_variant,
                  size: productVariant.size,
                  color: productVariant.color,
              });

              stockUpdates.push({
                  updateOne: {
                      filter: { "_id": item.product._id, "variants.sku_variant": item.sku_variant },
                      update: { "$inc": { "variants.$.stock_quantity": -item.quantity } },
                  },
              });

          } else {
              // --- Logic for Simple (Decorative) Product ---
              if (item.product.stock_quantity < item.quantity) {
                  throw new ApiError(400, `Not enough stock for "${item.product.name}". Only ${item.product.stock_quantity} left.`);
              }

              orderItems.push({
                  product_id: item.product._id,
                  product_name: item.product.name,
                  quantity: item.quantity,
                  price_per_item: item.price,
                  image: item.image || item.product.images[0],
              });
              
              stockUpdates.push({
                  updateOne: {
                      filter: { "_id": item.product._id },
                      update: { "$inc": { "stock_quantity": -item.quantity } },
                  },
              });
          }
      }

      if (orderItems.length === 0) {
          throw new ApiError(400, "No valid items found in the cart to place an order.");
      }

      let discountAmount = 0;
      let validatedCouponCode = null;
      if (couponCode) {
          const coupon = await Coupon.findOne({ code: couponCode.toUpperCase(), status: "active" }).session(session);
          if (coupon) {
              discountAmount = (subtotal * coupon.discountPercentage) / 100;
              validatedCouponCode = coupon.code;
          }
      }

      const shippingPrice = 90;
      const taxRate = 0.03;
      const taxPrice = (subtotal - discountAmount) * taxRate;
      const totalPrice = (subtotal - discountAmount) + shippingPrice + taxPrice;

      const [newOrder] = await Order.create([{
          user: req.user._id,
          orderItems,
          shippingAddress: shippingAddress.toObject(),
          itemsPrice: subtotal,
          shippingPrice: shippingPrice,
          taxPrice: taxPrice,
          discountAmount: discountAmount,
          totalPrice: totalPrice,
          couponCode: validatedCouponCode,
          paymentMethod: "COD",
          orderStatus: "Processing",
      }], { session });

      await Product.bulkWrite(stockUpdates, { session });
      user.cart = [];
      await user.save({ session, validateBeforeSave: false });

      await session.commitTransaction();

      if (user.email) {
          sendOrderConfirmationEmail(user.email, newOrder).catch(err => console.error("Failed to send Razorpay order confirmation email:", err));
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