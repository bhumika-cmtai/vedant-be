import axios from 'axios';

// Create an axios instance configured for the Delivery One API
const deliveryOneAPI = axios.create({
    baseURL: process.env.DELIVERY_ONE_API_URL,
    headers: {
        'Authorization': `Bearer ${process.env.DELIVERY_ONE_API_KEY}`,
        'Content-Type': 'application/json'
    }
});

/**
 * MOCK FUNCTION: Creates a shipment with the Delivery One partner.
 * IMPORTANT: You MUST replace the mock logic with the actual API call 
 * provided in the Delivery One documentation.
 * @param {object} orderDetails - Contains info like address, product details, etc.
 * @returns {Promise<object>} - A promise that resolves with the shipment details from the API.
 */
export const createShipment = async (orderDetails) => {
    try {
        const mockResponse = {
            success: true,
            trackingNumber: `DO12345${Math.floor(Math.random() * 90000) + 10000}`,
            status: 'PROCESSING', // The initial status from the courier
        };

        return Promise.resolve(mockResponse);

    } catch (error) {
        // Log the actual error from the courier API for debugging
        console.error("Error creating shipment with Delivery One:", error.response?.data || error.message);
        throw new Error("Failed to create shipment with courier partner.");
    }
};