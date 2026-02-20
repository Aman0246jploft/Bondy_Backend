const express = require("express");
const router = express.Router();
const Wishlist = require("../../db/models/Wishlist");
const { apiSuccessRes, apiErrorRes, formatResponseUrl } = require("../../utils/globalFunction");
const HTTP_STATUS = require("../../utils/statusCode");
const validateRequest = require("../../middlewares/validateRequest");
const {
    addToWishlistSchema,
    removeFromWishlistSchema,
} = require("../services/validations/wishlistValidation");

// Add to Wishlist
const addToWishlist = async (req, res) => {
    try {
        const userId = req.user.userId;
        const { entityId, entityModel } = req.body;

        // Check if already exists
        const existingItem = await Wishlist.findOne({ userId, entityId, entityModel });
        if (existingItem) {
            return apiErrorRes(
                HTTP_STATUS.BAD_REQUEST,
                res,
                "Item already in wishlist"
            );
        }

        const newItem = new Wishlist({
            userId,
            entityId,
            entityModel
        });

        await newItem.save();

        return apiSuccessRes(
            HTTP_STATUS.CREATED,
            res,
            "Added to wishlist",
            newItem
        );

    } catch (error) {
        console.error("Error in addToWishlist:", error);
        return apiErrorRes(HTTP_STATUS.SERVER_ERROR, res, error.message);
    }
};

// Remove from Wishlist
const removeFromWishlist = async (req, res) => {
    try {
        const userId = req.user.userId;
        const { entityId } = req.body;

        const deletedItem = await Wishlist.findOneAndDelete({ userId, entityId });

        if (!deletedItem) {
            return apiErrorRes(
                HTTP_STATUS.NOT_FOUND,
                res,
                "Item not found in wishlist"
            );
        }

        return apiSuccessRes(
            HTTP_STATUS.OK,
            res,
            "Removed from wishlist"
        );

    } catch (error) {
        console.error("Error in removeFromWishlist:", error);
        return apiErrorRes(HTTP_STATUS.SERVER_ERROR, res, error.message);
    }
};

// Get User Wishlist
const getUserWishlist = async (req, res) => {
    try {
        const userId = req.user.userId;
        const { page = 1, limit = 10, type } = req.query;

        const query = { userId };
        if (type) { // Filter by type (Event/Course)
            const modelType = type.charAt(0).toUpperCase() + type.slice(1).toLowerCase(); // Capitalize
            if (['Event', 'Course'].includes(modelType)) {
                query.entityModel = modelType;
            }
        }

        const options = {
            page: parseInt(page, 10),
            limit: parseInt(limit, 10),
            sort: { createdAt: -1 },
            populate: {
                path: 'entityId',
                select: 'name title eventTitle courseTitle startDate startTime image posterImage galleryImages venueAddress city state country schedules price' // Select necessary fields
            }
        };

        // Standard Mongoose Find with skip/limit because Wishlist is not using mongoose-paginate-v2 plugin directly on the model likely
        const totalDocs = await Wishlist.countDocuments(query);
        const totalPages = Math.ceil(totalDocs / options.limit);
        const skip = (options.page - 1) * options.limit;

        let wishlist = await Wishlist.find(query)
            .sort(options.sort)
            .skip(skip)
            .limit(options.limit)
            .populate('entityId')
            .lean();

        // Format images and structure success response
        wishlist = wishlist.map(item => {
            if (item.entityId) {
                // Format images based on entity type (Event or Course)
                // Images might be 'image', 'posterImage', 'galleryImages' etc.
                if (item.entityId.posterImage) {
                    if (Array.isArray(item.entityId.posterImage)) {
                        item.entityId.posterImage = item.entityId.posterImage.map(formatResponseUrl);
                    } else {
                        item.entityId.posterImage = formatResponseUrl(item.entityId.posterImage);
                    }
                }
                if (item.entityId.galleryImages) {
                    if (Array.isArray(item.entityId.galleryImages)) {
                        item.entityId.galleryImages = item.entityId.galleryImages.map(formatResponseUrl);
                    }
                }
                if (item.entityId.image) { // Some models might use just 'image'
                    item.entityId.image = formatResponseUrl(item.entityId.image);
                }
                // Add any other image fields if necessary, or check schema.
            }
            return item;
        });

        return apiSuccessRes(
            HTTP_STATUS.OK,
            res,
            "Wishlist fetched successfully",
            {
                docs: wishlist,
                totalDocs,
                limit: options.limit,
                page: options.page,
                totalPages
            }
        );

    } catch (error) {
        console.error("Error in getUserWishlist:", error);
        return apiErrorRes(
            HTTP_STATUS.SERVER_ERROR,
            res,
            error.message
        );
    }
};

// Routes
router.post("/add", validateRequest(addToWishlistSchema), addToWishlist);
router.delete("/remove", validateRequest(removeFromWishlistSchema), removeFromWishlist);
router.get("/my-wishlist", getUserWishlist);

module.exports = router;
