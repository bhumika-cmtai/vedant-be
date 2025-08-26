// /controllers/tracking.controller.js

import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { Order } from "../models/order.model.js";
import { ApiError } from "../utils/ApiError.js";
import axios from "axios";

const getDelhiveryTrackingStatus = async (trackingNumber) => {
  try {
    console.log(`Fetching status for tracking number (AWB): ${trackingNumber}`);

    if (
      !process.env.DELIVERY_ONE_API_URL ||
      !process.env.DELIVERY_ONE_API_KEY
    ) {
      throw new ApiError(
        500,
        "Delhivery API URL or Key is not configured in .env file."
      );
    }

    const response = await axios.get(
      `${process.env.DELIVERY_ONE_API_URL}/api/v1/packages/json/`,
      {
        params: { waybill: trackingNumber },
        headers: {
          Authorization: `Token ${process.env.DELIVERY_ONE_API_KEY}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
      }
    );

    const { ShipmentData } = response.data;

    // ===== FIX: Delhivery API response ke naye structure ko handle kiya gaya hai =====
    if (
      ShipmentData &&
      ShipmentData.length > 0 &&
      ShipmentData[0].Shipment &&
      ShipmentData[0].Shipment.Status
    ) {
      const latestStatus = ShipmentData[0].Shipment.Status;

      return {
        status: latestStatus.Status,
        location: latestStatus.StatusLocation, // Sahi field 'StatusLocation' hai
        timestamp: latestStatus.StatusDateTime,
      };
    }

    console.warn(
      `Could not parse a valid status from Delhivery response for AWB: ${trackingNumber}`
    );
    return {
      status: "Info Received",
      location: "N/A",
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    if (error.response) {
      console.error(
        "Delhivery Tracking API Error Response:",
        JSON.stringify(error.response.data)
      );
    } else {
      console.error("Delhivery Tracking API Request Error:", error.message);
    }
    throw new ApiError(
      502,
      "Failed to fetch tracking status from courier partner."
    );
  }
};

export const trackOrder = asyncHandler(async (req, res) => {
  const { orderId } = req.params;
  const order = await Order.findById(orderId);
  if (!order) throw new ApiError(404, "Order not found.");

  if (
    req.user.role !== "admin" &&
    order.user.toString() !== req.user._id.toString()
  ) {
    throw new ApiError(403, "Not authorized to track this order.");
  }

  const trackingNumber = order.shipmentDetails?.trackingNumber;
  if (!trackingNumber)
    throw new ApiError(
      400,
      "Order has not been shipped yet or tracking number is missing."
    );

  const liveStatus = await getDelhiveryTrackingStatus(trackingNumber);

  res.status(200).json(
    new ApiResponse(
      200,
      {
        orderStatus: order.orderStatus,
        liveCourierStatus: liveStatus,
      },
      "Tracking status fetched successfully."
    )
  );
});
