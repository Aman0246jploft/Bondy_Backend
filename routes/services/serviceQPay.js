const axios = require("axios");
const { getQPayConfig, validateQPayConfig } = require("../../config/qpay");
const { logQPayEvent } = require("../../utils/qpayLogger");

// Access configuration dynamically
const getConfig = () => getQPayConfig();


// In-memory token cache to prevent redundant authentication calls
let tokenCache = {
    accessToken: null,
    refreshToken: null,
    expiresAt: 0,
};

/**
 * Clears the in-memory token cache (useful for testing or forced resets)
 */
const clearTokenCache = () => {
    tokenCache = {
        accessToken: null,
        refreshToken: null,
        expiresAt: 0,
    };
};

/**
 * Refreshes an expired access token using the refresh_token
 */
const refreshQPayToken = async () => {
    if (!tokenCache.refreshToken) {
        throw new Error("No refresh token available");
    }

    const config = getConfig();
    const startTime = Date.now();
    try {
        const response = await axios.post(
            `${config.baseUrl}/auth/refresh`,
            {},
            {
                headers: {
                    Authorization: `Bearer ${tokenCache.refreshToken}`,
                    "Content-Type": "application/json",
                },
                timeout: config.timeout,
            }
        );

        const data = response.data;
        const expiresIn = Number(data.expires_in) || 7200;
        // 5-minute pre-expiration buffer (or minimum 60s)
        const bufferSeconds = Math.min(300, Math.floor(expiresIn / 2));

        tokenCache = {
            accessToken: data.access_token,
            refreshToken: data.refresh_token || tokenCache.refreshToken,
            expiresAt: Date.now() + (expiresIn - bufferSeconds) * 1000,
        };

        logQPayEvent({
            eventType: "TOKEN_REFRESH",
            status: "SUCCESS",
            request: { url: `${config.baseUrl}/auth/refresh`, method: "POST" },
            response: { expiresIn: data.expires_in, tokenType: data.token_type },
            durationMs: Date.now() - startTime,
        });

        return tokenCache.accessToken;
    } catch (error) {
        logQPayEvent({
            eventType: "TOKEN_REFRESH",
            status: "FAILED",
            request: { url: `${config.baseUrl}/auth/refresh`, method: "POST" },
            error,
            durationMs: Date.now() - startTime,
        });
        console.warn("[QPay] Token refresh failed, falling back to basic auth:", error.response?.data || error.message);
        clearTokenCache();
        throw error;
    }
};

/**
 * Retrieves a valid QPay access token from cache, refresh, or fresh login
 * @param {Boolean} forceRefresh Force a new login
 */
const getQPayToken = async (forceRefresh = false) => {
    const now = Date.now();

    // 1. Return cached access token if still valid
    if (!forceRefresh && tokenCache.accessToken && tokenCache.expiresAt > now) {
        return tokenCache.accessToken;
    }

    // 2. Try refreshing token if we have a refresh_token
    if (!forceRefresh && tokenCache.refreshToken) {
        try {
            return await refreshQPayToken();
        } catch (_) {
            // Fall through to basic auth if refresh fails
        }
    }

    // 3. Obtain a fresh access token using Basic Auth credentials
    const config = getConfig();
    const startTime = Date.now();
    try {
        const credentials = Buffer.from(`${config.username}:${config.password}`).toString("base64");
        const response = await axios.post(
            `${config.baseUrl}/auth/token`,
            {},
            {
                headers: {
                    Authorization: `Basic ${credentials}`,
                    "Content-Type": "application/json",
                },
                timeout: config.timeout,
            }
        );

        const data = response.data;
        const expiresIn = Number(data.expires_in) || 7200;
        const bufferSeconds = Math.min(300, Math.floor(expiresIn / 2));

        tokenCache = {
            accessToken: data.access_token,
            refreshToken: data.refresh_token || null,
            expiresAt: now + (expiresIn - bufferSeconds) * 1000,
        };

        logQPayEvent({
            eventType: "TOKEN_AUTH",
            status: "SUCCESS",
            request: { url: `${config.baseUrl}/auth/token`, method: "POST", username: config.username },
            response: { expiresIn: data.expires_in, tokenType: data.token_type },
            durationMs: Date.now() - startTime,
        });

        return tokenCache.accessToken;
    } catch (error) {
        logQPayEvent({
            eventType: "TOKEN_AUTH",
            status: "FAILED",
            request: { url: `${config.baseUrl}/auth/token`, method: "POST", username: config.username },
            error,
            durationMs: Date.now() - startTime,
        });
        console.error("[QPay] Authentication Error:", error.response?.data || error.message);
        clearTokenCache();
        throw new Error(`Failed to authenticate with QPay: ${error.response?.data?.message || error.message}`);
    }
};

/**
 * Execute an authenticated QPay request with automatic 401 token renewal and retry
 */
const executeQPayRequest = async (requestFn) => {
    let token = await getQPayToken();
    try {
        return await requestFn(token);
    } catch (error) {
        if (error.response && error.response.status === 401) {
            console.warn("[QPay] Received 401 Unauthorized. Retrying with fresh token...");
            token = await getQPayToken(true);
            return await requestFn(token);
        }
        throw error;
    }
};

/**
 * Creates an invoice in QPay
 * @param {Object} options
 * @param {Number} options.amount - Total amount to pay in MNT
 * @param {String} options.senderInvoiceNo - Unique booking ID (e.g. BNDY-123456)
 * @param {String} [options.invoiceReceiverCode] - Customer/terminal identifier
 * @param {String} [options.invoiceDescription] - Description displayed to customer
 * @param {String} [options.callbackUrl] - Webhook callback URL
 */
const createQPayInvoice = async ({
    amount,
    senderInvoiceNo,
    invoiceReceiverCode,
    invoiceDescription,
    callbackUrl,
}) => {
    const config = getConfig();
    const startTime = Date.now();
    let payload = null;
    try {
        const resolvedCallbackUrl = callbackUrl || (
            config.callbackUrl
                ? `${config.callbackUrl}?booking_id=${encodeURIComponent(senderInvoiceNo)}${config.callbackSecret ? `&secret=${encodeURIComponent(config.callbackSecret)}` : ""}`
                : undefined
        );

        payload = {
            invoice_code: config.invoiceCode,
            sender_invoice_no: String(senderInvoiceNo),
            invoice_receiver_code: String(invoiceReceiverCode || senderInvoiceNo),
            invoice_description: invoiceDescription || `Payment for booking ${senderInvoiceNo}`,
            sender_branch_code: "ONLINE",
            amount: Number(amount),
            callback_url: resolvedCallbackUrl,
        };

        const response = await executeQPayRequest((token) =>
            axios.post(`${config.baseUrl}/invoice`, payload, {
                headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/json",
                },
                timeout: config.timeout,
            })
        );

        logQPayEvent({
            eventType: "INVOICE_CREATE",
            bookingId: String(senderInvoiceNo),
            invoiceId: response.data?.invoice_id,
            status: "SUCCESS",
            request: { url: `${config.baseUrl}/invoice`, method: "POST", payload },
            response: response.data,
            durationMs: Date.now() - startTime,
        });

        return response.data;
    } catch (error) {
        logQPayEvent({
            eventType: "INVOICE_CREATE",
            bookingId: String(senderInvoiceNo),
            status: "FAILED",
            request: { url: `${config.baseUrl}/invoice`, method: "POST", payload },
            error,
            durationMs: Date.now() - startTime,
        });
        console.error("[QPay] Invoice Creation Error:", error.response?.data || error.message);
        throw new Error(error.response?.data?.message || "Failed to create QPay invoice");
    }
};

/**
 * Checks the payment status of an invoice in QPay
 * @param {String} invoiceId - QPay invoice_id (UUID)
 */
const checkQPayPayment = async (invoiceId) => {
    const config = getConfig();
    const startTime = Date.now();
    let payload = null;
    try {
        payload = {
            object_type: "INVOICE",
            object_id: String(invoiceId),
            offset: {
                page_number: 1,
                page_limit: 100,
            },
        };

        const response = await executeQPayRequest((token) =>
            axios.post(`${config.baseUrl}/payment/check`, payload, {
                headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/json",
                },
                timeout: config.timeout,
            })
        );

        const isPaid = (response.data.count > 0 || (response.data.paid_amount && response.data.paid_amount > 0)) &&
            (response.data.rows && response.data.rows.some((r) => r.payment_status === "PAID" || r.payment_status === "SUCCESS"));

        logQPayEvent({
            eventType: "PAYMENT_CHECK",
            invoiceId: String(invoiceId),
            status: isPaid ? "SUCCESS" : "PENDING",
            request: { url: `${config.baseUrl}/payment/check`, method: "POST", payload },
            response: response.data,
            durationMs: Date.now() - startTime,
        });

        return response.data;
    } catch (error) {
        logQPayEvent({
            eventType: "PAYMENT_CHECK",
            invoiceId: String(invoiceId),
            status: "FAILED",
            request: { url: `${config.baseUrl}/payment/check`, method: "POST", payload },
            error,
            durationMs: Date.now() - startTime,
        });
        console.error("[QPay] Payment Check Error:", error.response?.data || error.message);
        throw new Error(error.response?.data?.message || "Failed to check QPay payment status");
    }
};

/**
 * Retrieves payment details by QPay payment ID
 * @param {String} paymentId - QPay payment_id
 */
const getQPayPayment = async (paymentId) => {
    const config = getConfig();
    const startTime = Date.now();
    try {
        const response = await executeQPayRequest((token) =>
            axios.get(`${config.baseUrl}/payment/${encodeURIComponent(paymentId)}`, {
                headers: {
                    Authorization: `Bearer ${token}`,
                },
                timeout: config.timeout,
            })
        );

        logQPayEvent({
            eventType: "GET_PAYMENT_DETAILS",
            paymentId: String(paymentId),
            status: "SUCCESS",
            request: { url: `${config.baseUrl}/payment/${paymentId}`, method: "GET" },
            response: response.data,
            durationMs: Date.now() - startTime,
        });

        return response.data;
    } catch (error) {
        logQPayEvent({
            eventType: "GET_PAYMENT_DETAILS",
            paymentId: String(paymentId),
            status: "FAILED",
            request: { url: `${config.baseUrl}/payment/${paymentId}`, method: "GET" },
            error,
            durationMs: Date.now() - startTime,
        });
        console.error("[QPay] Get Payment Error:", error.response?.data || error.message);
        throw new Error(error.response?.data?.message || "Failed to retrieve QPay payment info");
    }
};

/**
 * Cancels an existing unpaid invoice in QPay
 * @param {String} invoiceId - QPay invoice_id (UUID)
 */
const cancelQPayInvoice = async (invoiceId) => {
    const config = getConfig();
    try {
        const response = await executeQPayRequest((token) =>
            axios.delete(`${config.baseUrl}/invoice/${encodeURIComponent(invoiceId)}`, {
                headers: {
                    Authorization: `Bearer ${token}`,
                },
                timeout: config.timeout,
            })
        );

        return response.data;
    } catch (error) {
        console.error("[QPay] Invoice Cancel Error:", error.response?.data || error.message);
        throw new Error(error.response?.data?.message || "Failed to cancel QPay invoice");
    }
};

/**
 * Refunds a paid transaction in QPay
 * @param {String} paymentId - QPay payment_id
 */
const refundQPayPayment = async (paymentId) => {
    const config = getConfig();
    try {
        const response = await executeQPayRequest((token) =>
            axios.delete(`${config.baseUrl}/payment/refund/${encodeURIComponent(paymentId)}`, {
                headers: {
                    Authorization: `Bearer ${token}`,
                },
                timeout: config.timeout,
            })
        );

        return response.data;
    } catch (error) {
        console.error("[QPay] Refund Error:", error.response?.data || error.message);
        throw new Error(error.response?.data?.message || "Failed to refund QPay payment");
    }
};

/**
 * Cancels a card transaction in QPay
 * @param {String} paymentId - QPay payment_id
 * @param {Object} options - { callback_url, note }
 */
const cancelQPayPayment = async (paymentId, options = {}) => {
    const config = getConfig();
    try {
        const response = await executeQPayRequest((token) =>
            axios.delete(`${config.baseUrl}/payment/cancel/${encodeURIComponent(paymentId)}`, {
                headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/json",
                },
                data: {
                    callback_url: options.callback_url || undefined,
                    note: options.note || "Cancellation request",
                },
                timeout: config.timeout,
            })
        );

        return response.data;
    } catch (error) {
        console.error("[QPay] Cancel Payment Error:", error.response?.data || error.message);
        throw new Error(error.response?.data?.message || "Failed to cancel QPay payment");
    }
};

/**
 * Creates an electronic tax receipt (E-Barimt) for a paid transaction
 * @param {String} paymentId - QPay payment_id
 * @param {String} [receiverType="CITIZEN"] - "CITIZEN" or "COMPANY"
 */
const createEbarimtReceipt = async (paymentId, receiverType = "CITIZEN") => {
    const config = getConfig();
    try {
        const payload = {
            payment_id: String(paymentId),
            ebarimt_receiver_type: receiverType,
        };

        const response = await executeQPayRequest((token) =>
            axios.post(`${config.baseUrl}/ebarimt_v3/create`, payload, {
                headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/json",
                },
                timeout: config.timeout,
            }).catch(async (err) => {
                // Fallback to legacy v2 endpoint if v3 not enabled on merchant
                if (err.response && err.response.status === 404) {
                    return axios.post(`${config.baseUrl}/ebarimt/create`, payload, {
                        headers: {
                            Authorization: `Bearer ${token}`,
                            "Content-Type": "application/json",
                        },
                        timeout: config.timeout,
                    });
                }
                throw err;
            })
        );

        return response.data;
    } catch (error) {
        console.error("[QPay] E-Barimt Error:", error.response?.data || error.message);
        throw new Error(error.response?.data?.message || "Failed to create E-Barimt receipt");
    }
};

module.exports = {
    get QPAY_BASE_URL() { return getConfig().baseUrl; },
    get QPAY_INVOICE_CODE() { return getConfig().invoiceCode; },
    get QPAY_CALLBACK_SECRET() { return getConfig().callbackSecret; },
    getQPayConfig,
    validateQPayConfig,
    getQPayToken,
    refreshQPayToken,
    clearTokenCache,
    createQPayInvoice,
    checkQPayPayment,
    getQPayPayment,
    cancelQPayInvoice,
    refundQPayPayment,
    cancelQPayPayment,
    createEbarimtReceipt,
};

