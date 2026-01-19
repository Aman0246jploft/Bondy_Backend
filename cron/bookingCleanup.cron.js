const cron = require("node-cron");
const { Transaction } = require("../db");

// Run every 15 minutes
cron.schedule("*/15 * * * *", async () => {
    try {
        const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);

        const result = await Transaction.updateMany(
            {
                status: "PENDING",
                createdAt: { $lt: thirtyMinutesAgo },
            },
            {
                $set: { status: "CANCELLED" },
            }
        );

        if (result.modifiedCount > 0) {
            console.log(`✅ Cleaned up ${result.modifiedCount} stale pending transactions`);
        }
    } catch (error) {
        console.error("❌ Booking cleanup cron error:", error);
    }
});
