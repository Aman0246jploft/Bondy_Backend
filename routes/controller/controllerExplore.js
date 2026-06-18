const express = require("express");
const router = express.Router();
const HTTP_STATUS = require("../../utils/statusCode");
const { apiErrorRes, apiSuccessRes } = require("../../utils/globalFunction");
const { getEvents } = require("./controllerEvent");
const { getCourses } = require("./controllerCourse");

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

router.get("/list", getExploreList);

module.exports = router;
