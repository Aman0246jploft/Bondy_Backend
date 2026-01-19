# Transaction and Payout Flow Documentation

This document describes how transactions are handled, how commissions are calculated, and how organizers are paid.

## 1. Lifecycle of a Transaction

1.  **Initiate Booking**:
    *   User selects an Event or Course.
    *   System calculates `basePrice`, `discountAmount`, and `taxAmount`.
    *   A `Transaction` record is created with status `PENDING`.
2.  **Confirm Payment**:
    *   Once payment is verified (via mock or real gateway), the status changes to `PAID`.
    *   **Commission Calculation** happens at this stage.
    *   **Organizer Earnings** are updated at this stage.
3.  **Check-in**:
    *   Organizers scan the QR code to mark attendance.

## 2. Commission & Earnings Calculation

When a transaction is marked as `PAID`:

1.  **Determine Commission Percentage**:
    *   System fetches the **Global Commission Settings** (managed by the Admin) for the specific category (`EVENT` or `COURSE`).
2.  **Calculate Split**:
    *   **Net Base Price** = `basePrice - discountAmount`
    *   **Commission Amount** = `Net Base Price * (Commission Percentage / 100)`
    *   **Organizer Earning** = `Net Base Price - Commission Amount`

> [!NOTE]
> Taxes are collected separately and are currently not factored into the organizer's earnings or commission calculation (i.e., the platform does not take a cut of the tax).

## 3. Payout Process

1.  **Accrual**: Each successful booking adds to the organizer's `payoutBalance` and `totalEarnings`.
2.  **Request/List**: Admins can see a list of organizers with a positive `payoutBalance`.
3.  **Payment**:
    *   Admin performs a manual bank transfer using the organizer's `bankDetails`.
    *   Admin marks the payout as `PAID` via the Admin API.
    *   System creates a `Payout` record and deducts the amount from the organizer's `payoutBalance`.

## 4. Admin Statistics

Admins have access to global statistics, including:
- **Platform Volume**: Sum of all `totalAmount` from `PAID` transactions.
- **Platform Revenue**: Sum of all `commissionAmount`.
- **Pending Payouts**: Sum of all `payoutBalance` across all organizers.
- **Completed Payouts**: Sum of all `amount` from `PAID` payouts.
