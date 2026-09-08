# 💳 QPay Payment API Documentation

This document describes the API specifications for integrating **QPay** (Mongolia's national QR & mobile banking payment system) into client applications (Web, iOS, Android, Flutter, React Native).

---

## 1. General Specifications

* **Base URL**: `https://<YOUR_BACKEND_HOST>/api/v1/booking`
* **Content-Type**: `application/json`
* **Authentication**: All client requests require a valid user JWT token:
  ```http
  Authorization: Bearer <USER_JWT_TOKEN>
  ```

---

## 2. API Reference

### 2.1 Initiate QPay Payment

Creates a payment invoice with QPay and returns the Base64 QR code image and deep links for 23+ Mongolian banking apps.

* **Method**: `POST`
* **Path**: `/qpay/initiate`
* **Full URL**: `https://<YOUR_BACKEND_HOST>/api/v1/booking/qpay/initiate`
* **Auth Required**: `Yes` (`Bearer Token`)

#### Request Headers
```http
Authorization: Bearer <JWT_TOKEN>
Content-Type: application/json
```

#### Request Body
```json
{
  "transactionId": "6a9f988423676465fbcfcd23"
}
```

| Parameter | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `transactionId` | String (ObjectId) | **Yes** | The booking transaction ID returned when initiating a booking. |

#### Success Response (`200 OK`)
```json
{
  "status": 200,
  "message": "QPay invoice created",
  "data": {
    "invoice_id": "0b01196d-49c2-4277-a1a7-ad8253906934",
    "qr_image": "iVBORw0KGgoAAAANSUhEUgAAASwAAAEsCAYAAAB5fY51AAAABmJLR0QA...",
    "qr_text": "0002010102121531279404962794049600260910000084827540014A...",
    "qPay_shortUrl": "https://qpay.mn/s/example",
    "urls": [
      {
        "name": "Khan bank",
        "description": "Хаан банк",
        "logo": "https://qpay.mn/q/logo/khanbank.png",
        "link": "khanbank://q?qPay_QRcode=00020101021215312794049627940496..."
      },
      {
        "name": "Social Pay",
        "description": "Голомт банк",
        "logo": "https://qpay.mn/q/logo/socialpay.png",
        "link": "socialpay-payment://q?qPay_QRcode=00020101021215312794049627940496..."
      },
      {
        "name": "State bank 3.0",
        "description": "Төрийн банк 3.0",
        "logo": "https://qpay.mn/q/logo/state_3.png",
        "link": "statebankmongolia://q?qPay_QRcode=00020101021215312794049627940496..."
      },
      {
        "name": "Xac bank",
        "description": "Хас банк",
        "logo": "https://qpay.mn/q/logo/xacbank.png",
        "link": "xacbank://q?qPay_QRcode=00020101021215312794049627940496..."
      },
      {
        "name": "Trade and Development bank",
        "description": "TDB online",
        "logo": "https://qpay.mn/q/logo/tdbbank.png",
        "link": "tdbbank://q?qPay_QRcode=00020101021215312794049627940496..."
      },
      {
        "name": "M bank",
        "description": "М банк",
        "logo": "https://qpay.mn/q/logo/mbank.png",
        "link": "mbank://q?qPay_QRcode=00020101021215312794049627940496..."
      },
      {
        "name": "Monpay",
        "description": "Мон Пэй",
        "logo": "https://qpay.mn/q/logo/monpay.png",
        "link": "monpay://q?qPay_QRcode=00020101021215312794049627940496..."
      }
    ]
  }
}
```

#### Response Fields
| Field | Type | Description |
| :--- | :--- | :--- |
| `invoice_id` | String | Unique QPay invoice UUID. |
| `qr_image` | String (Base64) | Base64 PNG image string. Render with `<img src="data:image/png;base64,${qr_image}" />`. |
| `qr_text` | String | Raw EMV QR string payload. |
| `qPay_shortUrl` | String | Fallback payment web link. |
| `urls` | Array\<Object\> | List of 23 bank objects containing `name`, `description`, `logo` URL, and `link` deep link. |

---

### 2.2 Check Payment Status (Polling Endpoint)

Polls QPay and checks whether the payment was completed by the customer in their banking app.

* **Method**: `POST`
* **Path**: `/qpay/check`
* **Full URL**: `https://<YOUR_BACKEND_HOST>/api/v1/booking/qpay/check`
* **Auth Required**: `Yes` (`Bearer Token`)

#### Request Headers
```http
Authorization: Bearer <JWT_TOKEN>
Content-Type: application/json
```

#### Request Body
```json
{
  "transactionId": "6a9f988423676465fbcfcd23"
}
```

---

#### Case A: Payment Still Pending (`200 OK`)
Returned when the user has not yet approved the transaction in their bank app.

```json
{
  "status": 200,
  "message": "Payment pending",
  "data": {
    "status": "PENDING",
    "transactionId": "6a9f988423676465fbcfcd23"
  }
}
```
* **Client Action**: Continue polling every 3 seconds.

---

#### Case B: Payment Successful (`200 OK`)
Returned when the payment is confirmed. The booking is marked `PAID`, scannable attendee tickets are issued, and organizer earnings are credited.

```json
{
  "status": 200,
  "message": "Booking confirmed successfully",
  "data": {
    "status": "PAID",
    "transaction": {
      "_id": "6a9f988423676465fbcfcd23",
      "bookingId": "BNDY-MANUAL-113284",
      "status": "PAID",
      "totalAmount": 15000,
      "ticketName": "VIP Pass",
      "bookingType": "EVENT",
      "qty": 1
    },
    "tickets": [
      {
        "_id": "6a9f992ccf1ee7d530015f00",
        "ticketNumber": "TKT-MANUAL-1788844332250-1",
        "ticketName": "VIP Pass",
        "ticketIndex": 1,
        "isPass": false,
        "status": "ACTIVE",
        "qrCodeData": "TICKET-ATTENDEE-BNDY-MANUAL-113284-1-1788844332250"
      }
    ]
  }
}
```
* **Client Action**: Stop polling immediately. Transition to the success screen and display the tickets.

---

## 3. Error Responses

All error responses adhere to standard format:

```json
{
  "status": 400,
  "message": "Error description here"
}
```

### Common Error Codes

| HTTP Status | Error Message | Description / Fix |
| :--- | :--- | :--- |
| `400 Bad Request` | `"transactionId" is required` | The request body did not include `transactionId`. |
| `400 Bad Request` | `Booking is already paid` | The booking was already paid. No need to re-initiate payment. |
| `400 Bad Request` | `Transaction amount must be greater than zero for QPay` | Free transactions (0 MNT) should use free direct enrollment. |
| `401 Unauthorized` | `Unauthorized` / `Token expired` | Missing or expired JWT token in `Authorization` header. |
| `404 Not Found` | `Transaction not found` | The provided `transactionId` does not exist or belongs to another user. |
| `500 Server Error` | `Internal server error` | QPay upstream error or internal service issue. |

---

## 4. Client Implementation Guide

### Polling Implementation Pattern

```javascript
import axios from "axios";

async function monitorQPayPayment(transactionId, onPaid, onTimeout) {
  const POLL_INTERVAL_MS = 3000;   // 3 seconds
  const MAX_POLL_TIME_MS = 300000; // 5 minutes

  const startTime = Date.now();

  const intervalId = setInterval(async () => {
    // Check if timeout reached
    if (Date.now() - startTime > MAX_POLL_TIME_MS) {
      clearInterval(intervalId);
      onTimeout();
      return;
    }

    try {
      const response = await axios.post(
        "/api/v1/booking/qpay/check",
        { transactionId },
        { headers: { Authorization: `Bearer ${userToken}` } }
      );

      if (response.data?.data?.status === "PAID") {
        clearInterval(intervalId);
        onPaid(response.data.data);
      }
    } catch (error) {
      console.warn("QPay status check error:", error.response?.data || error.message);
    }
  }, POLL_INTERVAL_MS);

  // Return cancel function in case user leaves the screen
  return () => clearInterval(intervalId);
}
```

---

## 5. Mobile Deep Linking Schemes

When implementing on iOS or Android, open the bank links directly via your mobile framework's URL launcher:

```javascript
// React Native
import { Linking } from 'react-native';

const handleBankSelect = async (bankUrl) => {
  const canOpen = await Linking.canOpenURL(bankUrl);
  if (canOpen) {
    await Linking.openURL(bankUrl);
  } else {
    alert("Banking app is not installed on this device. Please scan the QR code.");
  }
};
```
