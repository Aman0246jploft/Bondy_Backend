const axios = require("axios");

// Read QPay configuration from environment variables, or use sensible defaults for testing
const QPAY_ENV = process.env.NODE_ENV

const BASE_URL = QPAY_ENV === "production" ? "https://merchant.qpay.mn" : "https://merchant.qpay.mn";
const CLIENT_ID = process.env.QPAY_CLIENT_ID || "BONDY_MN";
const CLIENT_SECRET = process.env.QPAY_CLIENT_SECRET || "2wkSf6Xd";

/**
 * Gets the QPay Access Token using Basic Auth.
 */
const getAccessToken = async () => {
    try {
        const authString = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64");

        const response = await axios.post(
            `${BASE_URL}/v2/auth/token`,
            {},
            {
                headers: {
                    Authorization: `Basic ${authString}`,
                    "Content-Type": "application/json"
                }
            }
        );

        if (response.data && response.data.access_token) {
            return response.data.access_token;
        }
        throw new Error("Failed to get QPay access token");
    } catch (error) {
        console.error("QPay getAccessToken Error:", error?.response?.data || error.message);
        throw new Error("Failed to authenticate with QPay");
    }
};

/**
 * Creates an invoice in QPay.
 */
const createInvoice = async (invoiceData) => {
    try {
        const token = await getAccessToken();

        const response = await axios.post(
            `${BASE_URL}/v2/invoice`,
            invoiceData,
            {
                headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/json"
                }
            }
        );

        return response.data;
    } catch (error) {
        console.error("QPay createInvoice Error:", error?.response?.data || error.message);
        throw new Error("Failed to create QPay invoice");
    }
};

/**
 * Checks the payment status of an invoice in QPay.
 */
const checkPayment = async (invoiceId) => {
    try {
        const token = await getAccessToken();

        const response = await axios.post(
            `${BASE_URL}/v2/payment/check`,
            {
                object_type: "INVOICE",
                object_id: invoiceId,
                offset: {
                    page_number: 1,
                    page_limit: 100
                }
            },
            {
                headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/json"
                }
            }
        );

        return response.data;
    } catch (error) {
        console.error("QPay checkPayment Error:", error?.response?.data || error.message);
        throw new Error("Failed to check QPay payment status");
    }
};

module.exports = {
    getAccessToken,
    createInvoice,
    checkPayment
};
