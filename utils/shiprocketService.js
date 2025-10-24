import axios from "axios";
import { ApiError } from "./ApiError.js";

// In-memory cache for the auth token to avoid requesting it on every call
let shiprocketToken = null;
let tokenExpiryTime = null;

/**
 * Gets a valid authentication token from Shiprocket, refreshing it if necessary.
 * @returns {Promise<string>} The auth token.
 */
const getAuthToken = async () => {
  if (shiprocketToken && new Date() < tokenExpiryTime) {
    return shiprocketToken;
  }

  try {
    console.log("Generating new Shiprocket token...");
    const response = await axios.post(
      "https://apiv2.shiprocket.in/v1/external/auth/login",
      {
        email: process.env.SHIPROCKET_EMAIL,
        password: process.env.SHIPROCKET_PASSWORD,
      }
    );

    if (!response.data?.token) {
      throw new Error("No token found in Shiprocket auth response.");
    }
    
    shiprocketToken = response.data.token;
    // Shiprocket token lasts 10 days, we'll refresh it after 9 for safety.
    tokenExpiryTime = new Date(new Date().getTime() + 9 * 24 * 60 * 60 * 1000);
    console.log("Shiprocket token generated successfully.");
    return shiprocketToken;

  } catch (error) {
    console.error("Critical Error: Failed to authenticate with Shiprocket:", error.response?.data || error.message);
    throw new ApiError(500, "Could not authenticate with the shipping service.");
  }
};

/**
 * Pre-configured Axios instance for Shiprocket API calls.
 * Automatically attaches the authorization token to every request.
 */
export const shiprocketApi = axios.create({
  baseURL: "https://apiv2.shiprocket.in/v1/external",
});

shiprocketApi.interceptors.request.use(
  async (config) => {
    const token = await getAuthToken();
    config.headers.Authorization = `Bearer ${token}`;
    config.headers['Content-Type'] = 'application/json';
    return config;
  },
  (error) => Promise.reject(error)
);

