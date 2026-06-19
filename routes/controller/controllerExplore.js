const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const HTTP_STATUS = require("../../utils/statusCode");
const { apiErrorRes, apiSuccessRes, formatResponseUrl } = require("../../utils/globalFunction");
const { getEvents } = require("./controllerEvent");
const { getCourses } = require("./controllerCourse");
const { Event, Course, SearchHistory } = require("../../db");

/**
 * Creates a mock response object to intercept JSON output from controllers
 */
const createMockRes = (onJson) => {
  const mockRes = {
    statusCode: 200,
    status: function (code) {
      this.statusCode = code;
      return this;
    },
    json: function (data) {
      onJson(this.statusCode, data);
      return this;
    },
    send: function (data) {
      onJson(this.statusCode, data);
      return this;
    },
  };
  return mockRes;
};

const getExploreList = async (req, res) => {
  try {
    const originalPage = parseInt(req.query.page || 1, 10);
    const originalLimit = parseInt(req.query.limit || 10, 10);
    const fetchLimit = originalPage * originalLimit;

    // Create a modified request object fetching enough items for accurate pagination
    const mockReq = Object.create(req);
    mockReq.query = {
      ...req.query,
      page: 1,
      limit: fetchLimit,
      status: req.query.status || "Upcoming,Live",
    };

    let eventsData = null;
    let eventsStatusCode = null;
    const mockResEvents = createMockRes((code, data) => {
      eventsStatusCode = code;
      eventsData = data;
    });

    let coursesData = null;
    let coursesStatusCode = null;
    const mockResCourses = createMockRes((code, data) => {
      coursesStatusCode = code;
      coursesData = data;
    });

    // Execute both controllers in parallel
    await Promise.all([
      getEvents(mockReq, mockResEvents),
      getCourses(mockReq, mockResCourses),
    ]);

    // Check if both failed
    if (eventsStatusCode >= 400 && coursesStatusCode >= 400) {
      return apiErrorRes(eventsStatusCode || 500, res, (eventsData && eventsData.message) ? eventsData.message : "Error fetching data");
    }

    const mixedList = [];
    let totalCount = 0;

    // Process events
    if (eventsData && eventsData.status && eventsData.data && Array.isArray(eventsData.data.events)) {
      totalCount += eventsData.data.total || 0;
      eventsData.data.events.forEach((item) => {
        mixedList.push({ ...item, exploreType: "event", courseType: null });
      });
    }

    // Process courses
    if (coursesData && coursesData.status && coursesData.data) {
      // Courses sometimes return array in 'courses' or directly, depends on format, usually data.courses
      const courseArray = coursesData.data.courses || [];
      totalCount += coursesData.data.totalCourses || coursesData.data.total || 0;
      courseArray.forEach((item) => {
        mixedList.push({ ...item, exploreType: "course", courseType: item.enrollmentType || "unknown" });
      });
    }

    // Sort the combined list
    // 1. By distance if geospatial search was used
    // 2. Fallback to createdAt or startDate based on filters
    const isPast = req.query.filter && req.query.filter.toLowerCase().includes("past");
    const isNewest = req.query.filter && (req.query.filter.toLowerCase().includes("latest") || req.query.filter.toLowerCase().includes("newest"));

    mixedList.sort((a, b) => {
      if (a.distance !== undefined && b.distance !== undefined) {
        return a.distance - b.distance;
      }

      if (isNewest) {
        return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
      }

      if (isPast) {
        return new Date(b.endDate || b.startDate || 0) - new Date(a.endDate || a.startDate || 0);
      }

      // Default sort for upcoming/active items
      return new Date(a.startDate || a.createdAt || 0) - new Date(b.startDate || b.createdAt || 0);
    });

    // Paginate the sorted mixed list
    const startIndex = (originalPage - 1) * originalLimit;
    const endIndex = originalPage * originalLimit;
    const paginatedList = mixedList.slice(startIndex, endIndex);

    return apiSuccessRes(HTTP_STATUS.OK, res, "Explore list fetched successfully", {
      list: paginatedList,
      total: totalCount,
      totalPages: Math.ceil(totalCount / originalLimit),
      page: originalPage,
      limit: originalLimit,
    });

  } catch (error) {
    console.error("Error in getExploreList:", error);
    return apiErrorRes(HTTP_STATUS.SERVER_ERROR, res, error.message);
  }
};

const getShareUrl = async (req, res) => {
  try {
    const { id, type } = req.query;

    if (!id || !type) {
      return apiErrorRes(HTTP_STATUS.BAD_REQUEST, res, "id and type (event/course) are required");
    }

    const frontendUrl = process.env.FRONTEND_URL || "https://bondy-user.tasksplan.com";
    let shareUrl = "";

    if (type.toLowerCase() === "event") {
      shareUrl = `${frontendUrl}/eventDetails?id=${id}`;
    } else if (type.toLowerCase() === "course") {
      shareUrl = `${frontendUrl}/programDetails?id=${id}`;
    } else {
      return apiErrorRes(HTTP_STATUS.BAD_REQUEST, res, "Invalid type. Must be 'event' or 'course'");
    }

    return apiSuccessRes(HTTP_STATUS.OK, res, "Share URL generated successfully", {
      shareUrl,
      type
    });
  } catch (error) {
    console.error("Error in getShareUrl:", error);
    return apiErrorRes(HTTP_STATUS.SERVER_ERROR, res, error.message);
  }
};

const searchExplore = async (req, res) => {
  try {
    const { q, limit = 10, page = 1, saveHistory, categoryId, type } = req.query;
    const parsedLimit = parseInt(limit, 10) || 10;
    const parsedPage = parseInt(page, 10) || 1;
    const skip = (parsedPage - 1) * parsedLimit;

    // Save recent search ONLY when explicitly requested (e.g. saveHistory=true or via the POST endpoint)
    if (q && (saveHistory === "true" || saveHistory === true) && req.user && req.user.userId) {
      const userId = req.user.userId;
      const cleanQuery = q.trim();
      if (cleanQuery) {
        await SearchHistory.findOneAndUpdate(
          { userId, query: cleanQuery },
          { userId, query: cleanQuery },
          { upsert: true, new: true }
        );
      }
    }

    const hasQuery = q && q.trim();
    const hasCategory = categoryId && categoryId.trim();
    const hasType = type && type.trim();

    if (!hasQuery && !hasCategory && !hasType) {
      return apiSuccessRes(HTTP_STATUS.OK, res, "Search results fetched successfully", {
        list: [],
        total: 0,
        totalPages: 0,
        page: parsedPage,
        limit: parsedLimit,
      });
    }

    let searchEvents = true;
    let searchCourses = true;

    if (hasType) {
      const typeLower = type.trim().toLowerCase();
      if (typeLower === "event" || typeLower === "events") {
        searchEvents = true;
        searchCourses = false;
      } else if (typeLower === "course" || typeLower === "courses") {
        searchEvents = false;
        searchCourses = true;
      }
    }

    // Build event query
    let eventQuery = {
      isDraft: false,
      status: { $in: ["Upcoming", "Live"] }
    };

    if (hasCategory) {
      eventQuery.eventCategory = categoryId;
    }

    if (hasQuery) {
      const regex = new RegExp(q.trim(), "i");
      eventQuery.eventTitle = { $regex: regex };
    }

    // Build course query
    let courseQuery = {
      isDraft: false,
      status: { $in: ["Upcoming", "Live"] }
    };

    if (hasCategory) {
      courseQuery.courseCategory = categoryId;
    }

    if (hasQuery) {
      const regex = new RegExp(q.trim(), "i");
      courseQuery.courseTitle = { $regex: regex };
    }

    let events = [];
    let courses = [];

    const promises = [];
    if (searchEvents) {
      promises.push(
        Event.find(eventQuery)
          .select("_id eventTitle posterImage startDate endDate startTime endTime timeZone")
          .lean()
      );
    } else {
      promises.push(Promise.resolve([]));
    }

    if (searchCourses) {
      promises.push(
        Course.find(courseQuery)
          .select("_id courseTitle posterImage startDate endDate timeZone batches")
          .lean()
      );
    } else {
      promises.push(Promise.resolve([]));
    }

    const [rawEvents, rawCourses] = await Promise.all(promises);
    events = rawEvents;
    courses = rawCourses;

    const getFirstImage = (posterImage) => {
      if (Array.isArray(posterImage) && posterImage.length > 0) {
        return formatResponseUrl(posterImage[0]);
      }
      return null;
    };

    const formattedEvents = events.map(e => ({
      _id: e._id,
      title: e.eventTitle,
      posterImage: getFirstImage(e.posterImage),
      startDate: e.startDate,
      endDate: e.endDate,
      startTime: e.startTime,
      endTime: e.endTime,
      timeZone: e.timeZone,
      type: "event",
      exploreType: "event",
    }));

    const formattedCourses = courses.map(c => {
      let earliestStartTime = "00:00";
      let latestEndTime = "23:59";
      let courseTotalSeats = 0;
      if (c.batches && c.batches.length > 0) {
        const startTimes = c.batches.map((b) => b.startTime).filter(Boolean);
        const endTimes = c.batches.map((b) => b.endTime).filter(Boolean);
        if (startTimes.length > 0) {
          startTimes.sort();
          earliestStartTime = startTimes[0];
        }
        if (endTimes.length > 0) {
          endTimes.sort();
          latestEndTime = endTimes[endTimes.length - 1];
        }
        courseTotalSeats = c.batches[0].seats || 0;
      }

      return {
        _id: c._id,
        title: c.courseTitle,
        posterImage: getFirstImage(c.posterImage),
        startDate: c.startDate,
        endDate: c.endDate,
        startTime: earliestStartTime,
        endTime: latestEndTime,
        timeZone: c.timeZone,
        type: "course",
        exploreType: "course",
        capacitypersession: courseTotalSeats,
      };
    });

    // Combine lists
    const combined = [...formattedEvents, ...formattedCourses];

    // Sort by startDate ascending (Upcoming/Live events occurring first)
    combined.sort((a, b) => new Date(a.startDate || 0) - new Date(b.startDate || 0));

    // Simple pagination
    const paginated = combined.slice(skip, skip + parsedLimit);

    return apiSuccessRes(HTTP_STATUS.OK, res, "Search results fetched successfully", {
      list: paginated,
      total: combined.length,
      totalPages: Math.ceil(combined.length / parsedLimit),
      page: parsedPage,
      limit: parsedLimit,
    });
  } catch (error) {
    console.error("Error in searchExplore:", error);
    return apiErrorRes(HTTP_STATUS.SERVER_ERROR, res, error.message);
  }
};

const saveRecentSearch = async (req, res) => {
  try {
    if (!req.user || !req.user.userId) {
      return apiErrorRes(HTTP_STATUS.UNAUTHORIZED, res, "User not authenticated");
    }
    const userId = req.user.userId;
    const { query } = req.body;

    if (!query || !query.trim()) {
      return apiErrorRes(HTTP_STATUS.BAD_REQUEST, res, "Query is required");
    }

    const cleanQuery = query.trim();
    await SearchHistory.findOneAndUpdate(
      { userId, query: cleanQuery },
      { userId, query: cleanQuery },
      { upsert: true, new: true }
    );

    return apiSuccessRes(HTTP_STATUS.OK, res, "Search query saved to history successfully");
  } catch (error) {
    console.error("Error in saveRecentSearch:", error);
    return apiErrorRes(HTTP_STATUS.SERVER_ERROR, res, error.message);
  }
};

const getRecentSearches = async (req, res) => {
  try {
    if (!req.user || !req.user.userId) {
      return apiSuccessRes(HTTP_STATUS.OK, res, "Recent searches retrieved successfully", []);
    }

    const userId = req.user.userId;
    const searches = await SearchHistory.find({ userId })
      .sort({ updatedAt: -1 })
      .limit(6)
      .lean();

    return apiSuccessRes(
      HTTP_STATUS.OK,
      res,
      "Recent searches retrieved successfully",
      searches.map((s) => s.query)
    );
  } catch (error) {
    console.error("Error in getRecentSearches:", error);
    return apiErrorRes(HTTP_STATUS.SERVER_ERROR, res, error.message);
  }
};

const deleteRecentSearches = async (req, res) => {
  try {
    if (!req.user || !req.user.userId) {
      return apiErrorRes(HTTP_STATUS.UNAUTHORIZED, res, "User not authenticated");
    }

    const userId = req.user.userId;
    const { query } = req.query;

    if (query) {
      await SearchHistory.deleteOne({ userId, query: query.trim() });
      return apiSuccessRes(HTTP_STATUS.OK, res, "Search query deleted successfully");
    } else {
      await SearchHistory.deleteMany({ userId });
      return apiSuccessRes(HTTP_STATUS.OK, res, "All search history cleared successfully");
    }
  } catch (error) {
    console.error("Error in deleteRecentSearches:", error);
    return apiErrorRes(HTTP_STATUS.SERVER_ERROR, res, error.message);
  }
};

const getTrendingSearches = async (req, res) => {
  try {
    const trending = await SearchHistory.aggregate([
      {
        $group: {
          _id: "$query",
          count: { $sum: 1 },
        },
      },
      { $sort: { count: -1 } },
    ]);

    const trendingItems = [];
    const seenItemIds = new Set();

    for (const t of trending) {
      if (trendingItems.length >= 6) break;

      const queryStr = t._id;
      if (!queryStr) continue;

      const regex = new RegExp(queryStr.trim(), "i");

      // Find matching events
      const matchedEvents = await Event.find({
        isDraft: false,
        status: { $in: ["Upcoming", "Live"] },
        eventTitle: { $regex: regex }
      }).select("_id eventTitle posterImage startDate endDate startTime endTime timeZone").lean();

      for (const e of matchedEvents) {
        const idStr = e._id.toString();
        if (!seenItemIds.has(idStr)) {
          seenItemIds.add(idStr);
          const getFirstImage = (posterImage) => {
            if (Array.isArray(posterImage) && posterImage.length > 0) {
              return formatResponseUrl(posterImage[0]);
            }
            return null;
          };
          trendingItems.push({
            _id: e._id,
            title: e.eventTitle,
            posterImage: getFirstImage(e.posterImage),
            startDate: e.startDate,
            endDate: e.endDate,
            startTime: e.startTime,
            endTime: e.endTime,
            timeZone: e.timeZone,
            type: "event",
            exploreType: "event",
          });
          if (trendingItems.length >= 6) break;
        }
      }

      if (trendingItems.length >= 6) break;

      // Find matching courses
      const matchedCourses = await Course.find({
        isDraft: false,
        status: { $in: ["Upcoming", "Live"] },
        courseTitle: { $regex: regex }
      }).select("_id courseTitle posterImage startDate endDate timeZone batches").lean();

      for (const c of matchedCourses) {
        const idStr = c._id.toString();
        if (!seenItemIds.has(idStr)) {
          seenItemIds.add(idStr);
          const getFirstImage = (posterImage) => {
            if (Array.isArray(posterImage) && posterImage.length > 0) {
              return formatResponseUrl(posterImage[0]);
            }
            return null;
          };
          
          let earliestStartTime = "00:00";
          let latestEndTime = "23:59";
          let courseTotalSeats = 0;
          if (c.batches && c.batches.length > 0) {
            const startTimes = c.batches.map((b) => b.startTime).filter(Boolean);
            const endTimes = c.batches.map((b) => b.endTime).filter(Boolean);
            if (startTimes.length > 0) {
              startTimes.sort();
              earliestStartTime = startTimes[0];
            }
            if (endTimes.length > 0) {
              endTimes.sort();
              latestEndTime = endTimes[endTimes.length - 1];
            }
            courseTotalSeats = c.batches[0].seats || 0;
          }

          trendingItems.push({
            _id: c._id,
            title: c.courseTitle,
            posterImage: getFirstImage(c.posterImage),
            startDate: c.startDate,
            endDate: c.endDate,
            startTime: earliestStartTime,
            endTime: latestEndTime,
            timeZone: c.timeZone,
            type: "course",
            exploreType: "course",
            capacitypersession: courseTotalSeats,
          });
          if (trendingItems.length >= 6) break;
        }
      }
    }

    // Fallback: If we don't have 6 trending items, fill with general upcoming/live events
    if (trendingItems.length < 6) {
      const remainingCount = 6 - trendingItems.length;
      const fallbackEvents = await Event.find({
        isDraft: false,
        status: { $in: ["Upcoming", "Live"] },
        _id: { $nin: Array.from(seenItemIds).map(id => new mongoose.Types.ObjectId(id)) }
      }).select("_id eventTitle posterImage startDate endDate startTime endTime timeZone").limit(remainingCount).lean();

      for (const e of fallbackEvents) {
        const idStr = e._id.toString();
        seenItemIds.add(idStr);
        const getFirstImage = (posterImage) => {
          if (Array.isArray(posterImage) && posterImage.length > 0) {
            return formatResponseUrl(posterImage[0]);
          }
          return null;
        };
        trendingItems.push({
          _id: e._id,
          title: e.eventTitle,
          posterImage: getFirstImage(e.posterImage),
          startDate: e.startDate,
          endDate: e.endDate,
          startTime: e.startTime,
          endTime: e.endTime,
          timeZone: e.timeZone,
          type: "event",
          exploreType: "event",
        });
      }
    }

    // Fallback: If we still don't have 6, fill with courses
    if (trendingItems.length < 6) {
      const remainingCount = 6 - trendingItems.length;
      const fallbackCourses = await Course.find({
        isDraft: false,
        status: { $in: ["Upcoming", "Live"] },
        _id: { $nin: Array.from(seenItemIds).map(id => new mongoose.Types.ObjectId(id)) }
      }).select("_id courseTitle posterImage startDate endDate timeZone batches").limit(remainingCount).lean();

      for (const c of fallbackCourses) {
        const idStr = c._id.toString();
        seenItemIds.add(idStr);
        const getFirstImage = (posterImage) => {
          if (Array.isArray(posterImage) && posterImage.length > 0) {
            return formatResponseUrl(posterImage[0]);
          }
          return null;
        };

        let earliestStartTime = "00:00";
        let latestEndTime = "23:59";
        let courseTotalSeats = 0;
        if (c.batches && c.batches.length > 0) {
          const startTimes = c.batches.map((b) => b.startTime).filter(Boolean);
          const endTimes = c.batches.map((b) => b.endTime).filter(Boolean);
          if (startTimes.length > 0) {
            startTimes.sort();
            earliestStartTime = startTimes[0];
          }
          if (endTimes.length > 0) {
            endTimes.sort();
            latestEndTime = endTimes[endTimes.length - 1];
          }
          courseTotalSeats = c.batches[0].seats || 0;
        }

        trendingItems.push({
          _id: c._id,
          title: c.courseTitle,
          posterImage: getFirstImage(c.posterImage),
          startDate: c.startDate,
          endDate: c.endDate,
          startTime: earliestStartTime,
          endTime: latestEndTime,
          timeZone: c.timeZone,
          type: "course",
          exploreType: "course",
          capacitypersession: courseTotalSeats,
        });
      }
    }

    return apiSuccessRes(
      HTTP_STATUS.OK,
      res,
      "Trending searches retrieved successfully",
      trendingItems
    );
  } catch (error) {
    console.error("Error in getTrendingSearches:", error);
    return apiErrorRes(HTTP_STATUS.SERVER_ERROR, res, error.message);
  }
};

router.get("/list", getExploreList);
router.get("/share-url", getShareUrl);
router.get("/search", searchExplore);
router.get("/recent-searches", getRecentSearches);
router.get("/trending-searches", getTrendingSearches);
router.post("/recent-searches", saveRecentSearch);
router.delete("/recent-searches", deleteRecentSearches);

module.exports = router;
