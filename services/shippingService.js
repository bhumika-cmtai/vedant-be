import { Order } from "../models/order.model.js";
import Product from "../models/product.model.js";
import { shiprocketApi } from "../utils/shiprocketService.js";

/**
 * @description Creates an order in Shiprocket using a locally saved order.
 * @param {import("mongoose").Document} order - The Mongoose order document.
 * @param {string} userEmail - The email of the user who placed the order.
 */
export const createShiprocketOrder = async (order, userEmail) => {
    try {
        console.log(`Step 1: Creating Shiprocket order for local order ID: ${order._id}`);

        let totalWeight = 0;
        let maxLength = 0;
        let maxBreadth = 0;
        let maxHeight = 0;

        for (const item of order.orderItems) {
            const product = await Product.findById(item.product_id); // Corrected line
            if (!product) continue;

            if (item.sku_variant) {
                const variant = product.variants.find(v => v.sku === item.sku_variant);
                if (variant) {
                    totalWeight += (variant.weight || 0.1) * item.quantity; // Add a small default
                    maxLength = Math.max(maxLength, variant.length || 10);
                    maxBreadth = Math.max(maxBreadth, variant.breadth || 10);
                    maxHeight = Math.max(maxHeight, variant.height || 10);
                }
            } else {
                totalWeight += (product.weight || 0.1) * item.quantity;
                maxLength = Math.max(maxLength, product.length || 10);
                maxBreadth = Math.max(maxBreadth, product.breadth || 10);
                maxHeight = Math.max(maxHeight, product.height || 10);
            }
        }
        console.log("-----product specifications-----")
        console.log(totalWeight)
        console.log(maxLength)
        console.log(maxBreadth)
        console.log(maxHeight)

        const orderPayload = {
            order_id: order._id.toString(),
            order_date: order.createdAt,
            pickup_location: "Primary",
            billing_customer_name: order.shippingAddress.fullName.split(' ')[0],
            billing_last_name: order.shippingAddress.fullName.split(' ').slice(1).join(' ') || order.shippingAddress.fullName.split(' ')[0],
            billing_address: order.shippingAddress.street,
            billing_city: order.shippingAddress.city,
            billing_pincode: order.shippingAddress.postalCode,
            billing_state: order.shippingAddress.state,
            billing_country: order.shippingAddress.country,
            billing_email: userEmail,
            billing_phone: order.shippingAddress.phone,
            shipping_is_billing: true,
            order_items: order.orderItems.map(item => ({
                name: item.product_name,
                sku: item.sku_variant || item.product_id.toString(),
                units: item.quantity,
                selling_price: item.price_per_item,
                hsn: 441122,
            })),
            payment_method: order.paymentMethod === 'COD' ? "COD" : "Prepaid",
            sub_total: order.itemsPrice,
            length: maxLength,
            breadth: maxBreadth,
            height: maxHeight,
            weight: totalWeight 
        };

        const { data: createOrderResponse } = await shiprocketApi.post('/orders/create/adhoc', orderPayload);
        
        if (!createOrderResponse.order_id || !createOrderResponse.shipment_id) {
            console.warn(`Shiprocket API success, but no order_id/shipment_id returned for local order ${order._id}.`, createOrderResponse);
            return;
        }

        const shipmentId = createOrderResponse.shipment_id;
        console.log(`Step 2: Shiprocket order created [${createOrderResponse.order_id}]. Now generating AWB for shipment [${shipmentId}].`);

        const { data: awbResponse } = await shiprocketApi.post('/courier/assign/awb', {
            shipment_id: shipmentId
        });

        if (!awbResponse.response?.data?.awb_code) {
            console.error(`Failed to auto-generate AWB for shipment ${shipmentId}. Message:`, awbResponse.message);
            await Order.findByIdAndUpdate(order._id, { $set: { "shipmentDetails.shiprocketOrderId": createOrderResponse.order_id, "shipmentDetails.shiprocketShipmentId": shipmentId } });
            return;
        }
        
        const awbData = awbResponse.response.data;
        console.log(`Step 3: AWB [${awbData.awb_code}] generated. Now scheduling pickup...`);

        // --- THE FINAL AUTOMATION STEP: SCHEDULE THE PICKUP ---
        const pickupResponse = await shiprocketApi.post('/courier/generate/pickup', {
            shipment_id: [shipmentId] // The API expects an array of shipment IDs
        });

        // Check if pickup was successful
        if (pickupResponse.data?.pickup_status !== "scheduled") {
             console.warn(`Pickup scheduling failed or was queued for shipment ${shipmentId}. Status:`, pickupResponse.data);
        } else {
            console.log(`Step 4: Pickup successfully scheduled for shipment ${shipmentId}.`);
        }
        // --- END OF FINAL STEP ---

        console.log(`Step 5: Updating local database with all shipment details.`);
        await Order.findByIdAndUpdate(order._id, {
            $set: {
                "orderStatus": "Shipped",
                "shipmentDetails.shiprocketOrderId": createOrderResponse.order_id,
                "shipmentDetails.shiprocketShipmentId": shipmentId,
                "shipmentDetails.trackingNumber": awbData.awb_code,
                "shipmentDetails.courier": awbData.courier_name,
                "shipmentDetails.trackingUrl": awbData.awb_code_url,
            }
        });

        console.log(`Order ${order._id} fully automated and marked as Shipped.`);
        
    } catch (error) {
        
        console.error(`CRITICAL ERROR during Shiprocket automation for local order ${order._id}.`);
        console.log("--------errrorrrr---------")
        console.log(error)
        console.error("Error Response:", error.response?.data || error.message);
    }
}