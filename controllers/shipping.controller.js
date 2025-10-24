import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { ApiError } from "../utils/ApiError.js";
import {shiprocketApi} from "../utils/shiprocketService.js";
import { Order } from "../models/order.model.js";


/**
 * @desc Checks courier serviceability and gets shipping rates
 * @route POST /api/v1/shipping/serviceability
 * @access Private (Logged-in User)
 */
const checkServiceability = asyncHandler(async (req, res) => {
    const { delivery_postcode, weight_in_kg = 0.5 } = req.body;
    console.log("----delivery_postcode,weight_in_kg ---", delivery_postcode, weight_in_kg)
    if (!delivery_postcode) {
        console.log("---delivery_postcode error---")
        throw new ApiError(400, "Delivery pincode is required.");
    }

    const pickup_postcode = process.env.PICKUP_PINCODE;
    console.log("pickup postcode ", pickup_postcode)
    if (!pickup_postcode) {
        console.log("---!pickup_postcode error---")
        throw new ApiError(500, "Pickup pincode is not configured on the server.");
    }

    try {
        const response = await shiprocketApi.get('/courier/serviceability/', {
            params: {
                pickup_postcode,
                delivery_postcode,
                weight: weight_in_kg, // weight must be in kg
                cod: 1, // Check for both prepaid and COD
            }
        });
        console.log("---- response ----",response)
        const data = response.data.data;

        if (response.data.status !== 200 || data.available_courier_companies?.length === 0) {
            console.log("------No shipping service available for this pincode------")
            return res.status(200).json(new ApiResponse(200, { shippingPrice: null }, "No shipping service available for this pincode."));
        }

        // Find the rate for the courier company recommended by Shiprocket
        const recommendedCourierId = data.recommended_courier_company_id;
        const recommendedCourier = data.available_courier_companies.find(c => c.courier_company_id == recommendedCourierId);

        console.log("-----recommendedCourierId, recommendedCourier--------")
        // If the recommended one isn't found, take the first from the list (usually the cheapest)
        const shippingPrice = recommendedCourier ? recommendedCourier.rate : data.available_courier_companies[0].rate;
        console.log("--------shippingPrice---------")

        return res.status(200).json(new ApiResponse(200, { shippingPrice }, "Shipping rate calculated successfully."));

    } catch (error) {
        console.error("Shiprocket serviceability error:", error.response?.data || error.message);
        throw new ApiError(500, "Error fetching shipping availability.");
    }
});

export const trackOrder = asyncHandler(async (req, res) => {
    const { orderId } = req.params;
    const order = await Order.findById(orderId).lean();

    if (!order) {
        throw new ApiError(404, "Order not found.");
    }

    if (req.user.role !== 'admin' && order.user.toString() !== req.user._id.toString()) {
        throw new ApiError(403, "You are not authorized to view tracking for this order.");
    }

    const { trackingNumber, shiprocketShipmentId, shiprocketOrderId } = order.shipmentDetails || {};

    if (!shiprocketShipmentId && !shiprocketOrderId) {
        // Return a custom object that mimics the TrackingData structure
        return res.status(200).json(new ApiResponse(200, {
            track_status: 0, // Use 0 to indicate processing
            shipment_status: 0,
            shipment_track: [],
            shipment_track_activities: null,
            error: "Order has been placed but is awaiting shipment."
        }, "Tracking status fetched."));
    }

    try {
        const trackingParams = {};
        if (trackingNumber) trackingParams.awb = trackingNumber;
        if (shiprocketShipmentId) trackingParams.shipment_id = shiprocketShipmentId;
        if (shiprocketOrderId) trackingParams.order_id = shiprocketOrderId;

        const { data: rawResponse } = await shiprocketApi.get('/courier/track', { params: trackingParams });
        
        if (!Array.isArray(rawResponse) || rawResponse.length === 0) {
            throw new ApiError(404, "Tracking information not found in the shipping partner's system.");
        }

        const firstElement = rawResponse[0];
        const responseData = Object.values(firstElement)[0];

        if (!responseData || !responseData.tracking_data) {
            throw new ApiError(404, responseData?.message || "Invalid response structure from the shipping partner.");
        }

        const trackingData = responseData.tracking_data;

        // THIS IS THE MOST IMPORTANT PART:
        // We are NOT throwing an error for track_status: 0.
        // We are successfully returning the data received from Shiprocket.
        // The `fulfilled` case in the frontend Redux slice will handle this.
        return res.status(200).json(new ApiResponse(200, trackingData, "Tracking data fetched successfully."));

    } catch (error) {
        // This catch block will now only be triggered for genuine network errors or 500-level server errors.
        const errorMessage = error.response?.data?.message || error.message || "Failed to retrieve tracking information.";
        console.error("Shiprocket tracking error:", errorMessage);
        // This will trigger the `rejected` case in the frontend Redux slice.
        throw new ApiError(error.statusCode || 500, errorMessage);
    }
});

export { checkServiceability };