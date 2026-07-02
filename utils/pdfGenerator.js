const PDFDocument = require("pdfkit");
const QRCode = require("qrcode");
const moment = require("moment");
const axios = require("axios");

// Helper: fetch image buffer from URL
async function fetchImageBuffer(url) {
  try {
    const response = await axios.get(url, { responseType: "arraybuffer", timeout: 5000 });
    return response.data;
  } catch (error) {
    console.error("Failed to fetch image:", url, error.message);
    return null;
  }
}

// Helper: strip emoji & non-latin characters that Helvetica can't render
function stripEmoji(str) {
  if (!str) return "";
  return str
    .replace(/[\u{1F600}-\u{1F64F}]/gu, "")   // Emoticons
    .replace(/[\u{1F300}-\u{1F5FF}]/gu, "")   // Misc Symbols & Pictographs
    .replace(/[\u{1F680}-\u{1F6FF}]/gu, "")   // Transport & Map
    .replace(/[\u{1F1E0}-\u{1F1FF}]/gu, "")   // Flags
    .replace(/[\u{2600}-\u{26FF}]/gu, "")      // Misc Symbols
    .replace(/[\u{2700}-\u{27BF}]/gu, "")      // Dingbats
    .replace(/[\u{FE00}-\u{FE0F}]/gu, "")      // Variation Selectors
    .replace(/[\u{1F900}-\u{1F9FF}]/gu, "")   // Supplemental Symbols
    .replace(/[\u{1FA00}-\u{1FA6F}]/gu, "")   // Chess Symbols
    .replace(/[\u{1FA70}-\u{1FAFF}]/gu, "")   // Symbols Extended-A
    .replace(/[\u{200D}]/gu, "")               // Zero Width Joiner
    .replace(/[\u{20E3}]/gu, "")               // Combining Enclosing Keycap
    .replace(/\s{2,}/g, " ")                   // Collapse multiple spaces
    .trim();
}

// Helper: draw a rounded rect with fill + optional stroke
function drawBox(doc, x, y, w, h, radius, fillColor, strokeColor) {
  if (strokeColor) {
    doc.roundedRect(x, y, w, h, radius).fillAndStroke(fillColor, strokeColor);
  } else {
    doc.roundedRect(x, y, w, h, radius).fill(fillColor);
  }
}

// Helper: draw a label + value pair
function drawLabelValue(doc, label, value, x, y, opts = {}) {
  const { labelColor = "#888888", valueColor = "#FFFFFF", labelSize = 8, valueSize = 10, maxWidth = 120, valueBold = true } = opts;
  doc.fontSize(labelSize).fillColor(labelColor).font("Helvetica-Bold");
  doc.text(label, x, y, { width: maxWidth });
  doc.fontSize(valueSize).fillColor(valueColor).font(valueBold ? "Helvetica-Bold" : "Helvetica");
  doc.text(stripEmoji(value || "N/A"), x, y + labelSize + 4, { width: maxWidth, ellipsis: true, height: valueSize + 6 });
}

const generateTicketPdf = async (ticketData, res) => {
  return new Promise(async (resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 0, size: "A4" });
      doc.pipe(res);

      const W = doc.page.width;   // 595.28
      const H = doc.page.height;  // 841.89
      const M = 30; // margin
      const contentW = W - M * 2;

      // ── Background ──
      doc.rect(0, 0, W, H).fill("#141414");

      // ── Extract Data ──
      const isEvent = ticketData.bookingType === "EVENT";
      const item = isEvent ? ticketData.eventId : ticketData.courseId;
      const rawTitle = isEvent ? item?.eventTitle : item?.courseTitle;
      const title = stripEmoji(rawTitle || "Unknown");
      const ticketType = stripEmoji(ticketData.ticketName || item?.ticketName || item?.enrollmentType || "General");
      const customerName = ticketData.userId
        ? stripEmoji(`${ticketData.userId.firstName || ""} ${ticketData.userId.lastName || ""}`.trim())
        : "Unknown";
      const customerEmail = ticketData.userId?.email || "";
      const organizerName = (() => {
        const creator = item?.createdBy;
        if (!creator) return "N/A";
        return stripEmoji(`${creator.firstName || ""} ${creator.lastName || ""}`.trim()) || "N/A";
      })();
      const categoryName = stripEmoji(
        (isEvent ? item?.eventCategory?.categoryTitle : item?.courseCategory?.categoryTitle) || "General"
      );

      const orderDate = ticketData.createdAt ? moment(ticketData.createdAt).format("ddd, MMM D, YYYY") : "N/A";
      const orderTime = ticketData.createdAt ? moment(ticketData.createdAt).format("hh:mm A") : "";

      let eventDate = "N/A";
      let eventTime = "";
      if (item?.startDate) {
        eventDate = moment(item.startDate).format("ddd, MMM D, YYYY");
        const sT = item.startTime || moment(item.startDate).format("HH:mm");
        const eT = item.endTime || (item.endDate ? moment(item.endDate).format("HH:mm") : "");
        eventTime = eT ? `${sT} H - ${eT} H` : `${sT} H`;
      }

      let venue = "Online";
      if (item?.venueAddress) {
        venue = [item.venueAddress.address, item.venueAddress.city, item.venueAddress.state, item.venueAddress.country]
          .filter(Boolean).join(", ");
      } else if (item?.venueName) {
        venue = item.venueName;
      }
      venue = stripEmoji(venue);

      const rawDesc = (item?.shortdesc || item?.whatYouWillLearn || item?.longdesc || "")
        .replace(/<[^>]+>/g, "").trim();
      const description = stripEmoji(rawDesc).substring(0, 300) || "No description available.";

      const refundPolicy = stripEmoji(item?.refundPolicy || "N/A");

      // Image
      let imageBuffer = null;
      if (item?.posterImage?.[0]) {
        imageBuffer = await fetchImageBuffer(item.posterImage[0]);
      }

      // ════════════════════════════════════════════════════════
      // SECTION 1: Header Bar
      // ════════════════════════════════════════════════════════
      let Y = M;
      drawBox(doc, M, Y, contentW, 40, 8, "#23ada4");
      doc.fontSize(16).fillColor("#FFFFFF").font("Helvetica-Bold");
      doc.text("BONDY", M + 15, Y + 12);
      doc.fontSize(10).fillColor("#FFFFFF").font("Helvetica");
      doc.text(isEvent ? "Event Ticket" : "Course Ticket", W - M - 110, Y + 14, { width: 95, align: "right" });
      Y += 50;

      // ════════════════════════════════════════════════════════
      // SECTION 2: Top Panel — Image + Title + Ticket Details
      // ════════════════════════════════════════════════════════
      const topPanelH = 190;
      drawBox(doc, M, Y, contentW, topPanelH, 8, "#1E1E1E", "#2A2A2A");

      // Left: Image
      const imgX = M + 12;
      const imgY = Y + 12;
      const imgW = 130;
      const imgH = 110;
      if (imageBuffer) {
        try {
          doc.save();
          doc.roundedRect(imgX, imgY, imgW, imgH, 6).clip();
          doc.image(imageBuffer, imgX, imgY, { fit: [imgW, imgH], align: "center", valign: "center" });
          doc.restore();
        } catch (e) {
          console.error("Image draw error:", e.message);
        }
      } else {
        drawBox(doc, imgX, imgY, imgW, imgH, 6, "#2A2A2A");
        doc.fontSize(9).fillColor("#666").font("Helvetica");
        doc.text("No Image", imgX, imgY + imgH / 2 - 5, { width: imgW, align: "center" });
      }

      // Title under image
      const titleY = imgY + imgH + 8;
      doc.fontSize(11).fillColor("#FFFFFF").font("Helvetica-Bold");
      doc.text(title, imgX, titleY, { width: imgW, height: 30, ellipsis: true });

      // Status badge
      const badgeY = titleY + 32;
      const statusText = ticketData.status === "PAID" ? "Confirmed" : (ticketData.status || "Pending");
      const badgeFill = ticketData.status === "PAID" ? "#173b26" : "#3b2917";
      const badgeText = ticketData.status === "PAID" ? "#2edc69" : "#dc9c2e";
      drawBox(doc, imgX, badgeY, 72, 18, 9, badgeFill);
      doc.fontSize(9).fillColor(badgeText).font("Helvetica-Bold");
      doc.text(statusText, imgX, badgeY + 4, { width: 72, align: "center" });

      // Right side: Ticket Details grid
      const detailX = M + imgW + 30;
      const detailW = contentW - imgW - 42;

      doc.fontSize(14).fillColor("#FFFFFF").font("Helvetica-Bold");
      doc.text("Ticket Details", detailX, Y + 15);

      // Separator line
      doc.moveTo(detailX, Y + 35).lineTo(detailX + detailW, Y + 35).lineWidth(0.5).stroke("#333");

      // Row 1: Booking ID, Order Date
      const row1Y = Y + 45;
      const colW = detailW / 2;
      drawLabelValue(doc, "ORDER TRACKING CODE", ticketData.bookingId, detailX, row1Y, { maxWidth: colW - 10 });
      drawLabelValue(doc, "ORDER DATE", `${orderDate} ${orderTime}`, detailX + colW, row1Y, { maxWidth: colW - 10 });

      // Row 2: Ticket Type, Quantity
      const row2Y = row1Y + 38;
      drawLabelValue(doc, "TICKET TYPE", ticketType, detailX, row2Y, { maxWidth: colW - 10 });
      drawLabelValue(doc, "QUANTITY", `${ticketData.qty} ticket(s)`, detailX + colW, row2Y, { maxWidth: colW - 10 });

      // Row 3: Category, Organizer
      const row3Y = row2Y + 38;
      drawLabelValue(doc, "CATEGORY", categoryName, detailX, row3Y, { maxWidth: colW - 10 });
      drawLabelValue(doc, isEvent ? "ORGANIZER" : "INSTRUCTOR", organizerName, detailX + colW, row3Y, { maxWidth: colW - 10 });

      // Row 4: Refund Policy, Booking Type
      const row4Y = row3Y + 38;
      drawLabelValue(doc, "REFUND POLICY", refundPolicy, detailX, row4Y, { maxWidth: colW - 10 });
      drawLabelValue(doc, "BOOKING TYPE", ticketData.bookingType, detailX + colW, row4Y, { maxWidth: colW - 10 });

      Y += topPanelH + 12;

      // ════════════════════════════════════════════════════════
      // SECTION 3: Event / Course Details
      // ════════════════════════════════════════════════════════
      doc.fillColor("#23ada4").fontSize(11).font("Helvetica-Bold");
      doc.text(isEvent ? "Event Details" : "Course Details", M, Y);
      Y += 20;

      // Location + Time side by side
      const halfW = (contentW - 12) / 2;
      const infoBoxH = 75;

      // Location Box
      drawBox(doc, M, Y, halfW, infoBoxH, 8, "#1E1E1E", "#2A2A2A");
      doc.fillColor("#888888").fontSize(9).font("Helvetica-Bold");
      doc.text("Location", M + 12, Y + 10);
      doc.fillColor("#FFFFFF").fontSize(9).font("Helvetica");
      doc.text(venue, M + 12, Y + 25, { width: halfW - 24, height: 42, ellipsis: true });

      // Time Box
      const tX = M + halfW + 12;
      drawBox(doc, tX, Y, halfW, infoBoxH, 8, "#1E1E1E", "#2A2A2A");
      doc.fillColor("#888888").fontSize(9).font("Helvetica-Bold");
      doc.text("Time Slots", tX + 12, Y + 10);
      doc.fillColor("#FFFFFF").fontSize(10).font("Helvetica-Bold");
      doc.text(eventDate, tX + 12, Y + 26);
      doc.fillColor("#BBBBBB").fontSize(9).font("Helvetica");
      doc.text(eventTime, tX + 12, Y + 40);
      Y += infoBoxH + 10;

      // Description Box
      const descH = 70;
      drawBox(doc, M, Y, contentW, descH, 8, "#1E1E1E", "#2A2A2A");
      doc.fillColor("#888888").fontSize(9).font("Helvetica-Bold");
      doc.text("Description", M + 12, Y + 10);
      doc.fillColor("#DDDDDD").fontSize(9).font("Helvetica");
      doc.text(description, M + 12, Y + 25, { width: contentW - 24, height: 38, ellipsis: true });
      Y += descH + 12;

      // ════════════════════════════════════════════════════════
      // SECTION 4: Price Breakdown
      // ════════════════════════════════════════════════════════
      doc.fillColor("#23ada4").fontSize(11).font("Helvetica-Bold");
      doc.text("Payment Summary", M, Y);
      Y += 20;

      const priceBoxH = 90;
      drawBox(doc, M, Y, contentW, priceBoxH, 8, "#1E1E1E", "#2A2A2A");

      const priceX = M + 15;
      const priceValX = M + contentW - 100;
      let pY = Y + 12;
      const pLineH = 16;

      const drawPriceLine = (label, value, bold = false) => {
        doc.fontSize(9).fillColor(bold ? "#FFFFFF" : "#CCCCCC").font(bold ? "Helvetica-Bold" : "Helvetica");
        doc.text(label, priceX, pY, { width: 200 });
        doc.text(String(value), priceValX, pY, { width: 80, align: "right" });
        pY += pLineH;
      };

      drawPriceLine("Base Price", `${ticketData.basePrice || 0}`);
      if (ticketData.discountAmount > 0) {
        drawPriceLine("Discount", `- ${ticketData.discountAmount}`);
      }
      drawPriceLine("Tax", `${ticketData.taxAmount || 0}`);

      // Separator
      doc.moveTo(priceX, pY).lineTo(priceValX + 80, pY).lineWidth(0.5).stroke("#444");
      pY += 6;
      drawPriceLine("Total Paid", `${ticketData.totalAmount || 0}`, true);
      Y += priceBoxH + 12;

      // ════════════════════════════════════════════════════════
      // SECTION 5: Footer — Customer + QR Code
      // ════════════════════════════════════════════════════════
      doc.moveTo(M, Y).lineTo(W - M, Y).lineWidth(0.5).stroke("#333");
      Y += 12;

      // Customer Info (Left)
      doc.fillColor("#888888").fontSize(8).font("Helvetica-Bold");
      doc.text("CUSTOMER", M, Y);
      doc.fillColor("#FFFFFF").fontSize(13).font("Helvetica-Bold");
      doc.text(customerName, M, Y + 12);
      if (customerEmail) {
        doc.fillColor("#888888").fontSize(9).font("Helvetica");
        doc.text(customerEmail, M, Y + 28);
      }

      // Booking ID repeat
      doc.fillColor("#888888").fontSize(8).font("Helvetica-Bold");
      doc.text("BOOKING ID", M, Y + 48);
      doc.fillColor("#23ada4").fontSize(10).font("Helvetica-Bold");
      doc.text(ticketData.bookingId || "N/A", M, Y + 60);

      // QR Code (Right)
      const qrData = ticketData.qrCodeString || ticketData.qrCodeData;
      if (qrData) {
        try {
          const qrSize = 100;
          const qrX = W - M - qrSize - 5;
          const qrY = Y - 5;
          const qrImage = await QRCode.toDataURL(qrData, { errorCorrectionLevel: "H", width: qrSize, margin: 1 });
          drawBox(doc, qrX - 5, qrY - 5, qrSize + 10, qrSize + 10, 6, "#FFFFFF");
          doc.image(qrImage, qrX, qrY, { width: qrSize, height: qrSize });
          doc.fillColor("#888888").fontSize(7).font("Helvetica");
          doc.text("Scan to Verify", qrX - 5, qrY + qrSize + 8, { width: qrSize + 10, align: "center" });
        } catch (qrErr) {
          console.error("Error generating QR:", qrErr);
        }
      }

      // ── Bottom Bar ──
      drawBox(doc, 0, H - 28, W, 28, 0, "#1A1A1A");
      doc.fontSize(7).fillColor("#555555").font("Helvetica");
      doc.text("This ticket was generated by Bondy. All rights reserved.", 0, H - 20, { align: "center" });

      doc.end();
      resolve();
    } catch (err) {
      reject(err);
    }
  });
};

module.exports = {
  generateTicketPdf,
};
