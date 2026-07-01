const PDFDocument = require("pdfkit");
const QRCode = require("qrcode");
const moment = require("moment");

const generateTicketPdf = async (ticketData, res) => {
  return new Promise(async (resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 50, size: "A4" });
      
      // Pipe the document directly to the response
      doc.pipe(res);
      
      const isEvent = ticketData.bookingType === "EVENT";
      const item = isEvent ? ticketData.eventId : ticketData.courseId;
      const title = isEvent ? item?.eventTitle : item?.courseTitle;
      const ticketType = ticketData.ticketName || item?.ticketName || item?.enrollmentType || "General";
      
      let dateString = "N/A";
      if (ticketData.createdAt) {
        dateString = moment(ticketData.createdAt).format("MMM DD, YYYY - HH:mm");
      }
      
      let eventDate = "N/A";
      if (item?.startDate) {
        eventDate = moment(item.startDate).format("MMM DD, YYYY - HH:mm");
      }

      let venue = "Online";
      if (item?.venueAddress) {
         venue = [
           item.venueAddress.address,
           item.venueAddress.city,
           item.venueAddress.state,
           item.venueAddress.country
         ].filter(Boolean).join(", ");
      }

      // Title & Branding
      doc.fontSize(25).fillColor("#23ada4").text("Bondy Ticket", { align: "center" });
      doc.moveDown(0.5);
      doc.fontSize(16).fillColor("#333333").text(title || "Unknown Event", { align: "center" });
      doc.moveDown(2);
      
      // Box for details
      const startY = doc.y;
      doc.rect(50, startY, 500, 200).lineWidth(1).strokeColor("#cccccc").stroke();
      
      doc.fontSize(12).fillColor("#000000");
      doc.text("Booking Details", 70, startY + 20, { underline: true });
      doc.moveDown(1);
      
      doc.text(`Booking ID: ${ticketData.bookingId || "N/A"}`, 70, doc.y);
      doc.text(`Status: ${ticketData.status || "N/A"}`, 70, doc.y + 20);
      doc.text(`Type: ${ticketType}`, 70, doc.y + 20);
      doc.text(`Quantity: ${ticketData.qty} Ticket(s)`, 70, doc.y + 20);
      doc.text(`Booking Date: ${dateString}`, 70, doc.y + 20);
      
      doc.text("Event Details", 280, startY + 20, { underline: true });
      doc.text(`Date: ${eventDate}`, 280, startY + 45);
      doc.text(`Venue: ${venue}`, 280, startY + 65, { width: 250 });
      
      doc.moveDown(5);

      // QR Code
      if (ticketData.qrCodeString) {
        try {
          const qrImage = await QRCode.toDataURL(ticketData.qrCodeString, { errorCorrectionLevel: "H", width: 150 });
          doc.image(qrImage, 225, startY + 220, { fit: [150, 150], align: "center" });
          doc.fontSize(10).fillColor("#666666").text("Scan to Verify", 50, startY + 380, { align: "center" });
        } catch (qrErr) {
          console.error("Error generating QR code image for PDF", qrErr);
        }
      }
      
      // Footer
      doc.fontSize(10).fillColor("#aaaaaa").text("Thank you for using Bondy!", 50, 750, { align: "center" });
      
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
