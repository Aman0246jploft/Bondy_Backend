/**
 * QPay Gateway Configuration Module
 * Manages environment variables, endpoint resolution, and credential validation
 * for both Sandbox and Production modes.
 */
require("dotenv").config();

const QPAY_ENDPOINTS = {
    sandbox: "https://merchant-sandbox.qpay.mn/v2",
    production: "https://merchant.qpay.mn/v2",
};

/**
 * Resolves current QPay configuration dynamically from process.env
 */
const getQPayConfig = () => {
    const env = (process.env.QPAY_ENV || "sandbox").toLowerCase().trim();
    const isProduction = env === "production";

    const baseUrl = process.env.QPAY_BASE_URL || (
        isProduction ? QPAY_ENDPOINTS.production : QPAY_ENDPOINTS.sandbox
    );

    const username = process.env.QPAY_USERNAME || (isProduction ? "" : "TEST_MERCHANT");
    const password = process.env.QPAY_PASSWORD || (isProduction ? "" : "123456");
    const invoiceCode = process.env.QPAY_INVOICE_CODE || (isProduction ? "" : "TEST_INVOICE");
    const callbackUrl = process.env.QPAY_CALLBACK_URL || "";
    const callbackSecret = process.env.QPAY_CALLBACK_SECRET || "";
    const timeout = parseInt(process.env.QPAY_TIMEOUT_MS, 10) || 10000;

    return {
        env,
        isProduction,
        baseUrl,
        username,
        password,
        invoiceCode,
        callbackUrl,
        callbackSecret,
        timeout,
    };
};

/**
 * Validates configuration health and logs status safely (masking sensitive credentials)
 */
const validateQPayConfig = () => {
    const config = getQPayConfig();
    const errors = [];

    if (!config.username) {
        errors.push("QPAY_USERNAME is not defined.");
    }
    if (!config.password) {
        errors.push("QPAY_PASSWORD is not defined.");
    }
    if (!config.invoiceCode) {
        errors.push("QPAY_INVOICE_CODE is not defined.");
    }

    if (config.isProduction && (config.username === "TEST_MERCHANT" || config.invoiceCode === "TEST_INVOICE")) {
        console.warn("\x1b[33m⚠️  [QPay Warning] QPAY_ENV is set to 'production' but using default sandbox test credentials!\x1b[0m");
    }

    const maskedUser = config.username
        ? config.username.substring(0, 3) + "***"
        : "MISSING";

    console.log(`[QPay Config] Environment: ${config.env.toUpperCase()} | Base URL: ${config.baseUrl} | User: ${maskedUser} | Invoice Code: ${config.invoiceCode || "MISSING"}`);

    return {
        isValid: errors.length === 0,
        errors,
        config,
    };
};

module.exports = {
    getQPayConfig,
    validateQPayConfig,
    QPAY_ENDPOINTS,
};
