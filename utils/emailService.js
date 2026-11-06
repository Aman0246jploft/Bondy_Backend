const nodemailer = require("nodemailer");

/**
 * Normalizes SMTP password (handles quotes or spaces from environment variables)
 */
const getCleanPassword = (pass) => {
  if (!pass) return "";
  return String(pass)
    .replace(/^["']|["']$/g, "")
    .replace(/\s+/g, "");
};

const port = parseInt(process.env.SMTP_PORT, 10) || 465;
const isSecure = process.env.SMTP_SECURE !== undefined
  ? process.env.SMTP_SECURE === "true"
  : port === 465;

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "smtp.gmail.com",
  port: port,
  secure: isSecure,
  auth: {
    user: process.env.SMTP_USER || "noreply@bondy.mn",
    pass: getCleanPassword(process.env.SMTP_PASS || "dikq gsgx kyzv zlle"),
  },
  pool: true,
  maxConnections: 5,
  maxMessages: 100,
  connectionTimeout: 10000,
  greetingTimeout: 10000,
  socketTimeout: 15000,
});

const FROM_NAME = process.env.SMTP_FROM_NAME || "Bondy";
const FROM_EMAIL = process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER || "noreply@bondy.mn";
const DEFAULT_FROM = `"${FROM_NAME}" <${FROM_EMAIL}>`;

/**
 * Base email layout wrapper
 */
const getBaseHtmlLayout = ({ title, bodyContent, footerNotice }) => {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title || "Bondy"}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f3f4f6; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: #f3f4f6; padding: 40px 10px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width: 560px; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px rgba(0, 0, 0, 0.06); border: 1px solid #e5e7eb;">
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); padding: 32px 30px; text-align: center;">
              <div style="font-size: 28px; font-weight: 800; letter-spacing: 2px; color: #23ada4; text-transform: uppercase;">
                BONDY
              </div>
              <div style="font-size: 13px; color: #94a3b8; margin-top: 6px; letter-spacing: 0.5px;">
                Events &amp; Courses Platform
              </div>
            </td>
          </tr>
          
          <!-- Content Body -->
          <tr>
            <td style="padding: 36px 32px 28px 32px; color: #1f2937; line-height: 1.6;">
              ${bodyContent}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 24px 32px 32px 32px; background-color: #f9fafb; border-top: 1px solid #f3f4f6; text-align: center; font-size: 12px; color: #6b7280; line-height: 1.5;">
              <p style="margin: 0 0 8px 0;">${footerNotice || "This is an automated message from Bondy. Please do not reply directly to this email."}</p>
              <p style="margin: 0;">&copy; ${new Date().getFullYear()} Bondy Platform (bondy.mn). All rights reserved.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
};

/**
 * Generic sendEmail function
 */
const sendEmail = async ({ to, subject, html, text, attachments = [] }) => {
  try {
    if (!to) {
      console.warn("[EmailService] No recipient email specified.");
      return { success: false, error: "No recipient specified" };
    }

    const mailOptions = {
      from: DEFAULT_FROM,
      to,
      subject,
      html,
      text: text || html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(),
      attachments,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log(`[EmailService] Email sent successfully to ${to} | MessageId: ${info.messageId}`);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error(`[EmailService] Failed to send email to ${to}:`, error.message);
    return { success: false, error: error.message };
  }
};

/**
 * Sends OTP Email with professional styling
 * @param {Object} params
 * @param {string} params.to - Recipient email
 * @param {string} params.otp - OTP Code
 * @param {string} params.type - "signup" | "login" | "forgot_password" | "email_verification" | "staff_forgot_password"
 * @param {string} [params.userName] - User's name
 */
const sendOtpEmail = async ({ to, otp, type = "verification", userName = "" }) => {
  let subject = "Your Bondy Verification Code";
  let heading = "Verification Code";
  let message = "Please use the following verification code to proceed:";
  let securityTip = "This code will expire in 10 minutes. If you did not make this request, please ignore this email or contact support if you suspect unauthorized activity.";

  switch (type) {
    case "signup":
      subject = "Welcome to Bondy - Verify Your Account";
      heading = "Welcome to Bondy!";
      message = "Thank you for registering with Bondy. Please use the verification code below to verify your email address and activate your account:";
      break;
    case "login":
      subject = "Your Bondy Login Code";
      heading = "Account Login";
      message = "We received a login request for your Bondy account. Use the one-time code below to securely sign in:";
      break;
    case "forgot_password":
      subject = "Reset Your Bondy Password";
      heading = "Password Reset Request";
      message = "We received a request to reset your Bondy account password. Enter the code below to set a new password:";
      break;
    case "staff_forgot_password":
      subject = "Bondy Staff Portal - Password Reset";
      heading = "Staff Password Reset";
      message = "A password reset request was made for your Bondy Staff account. Use the code below:";
      break;
    case "email_verification":
      subject = "Verify Your Email Address - Bondy";
      heading = "Email Verification";
      message = "Please verify your email address using the confirmation code below:";
      break;
    default:
      break;
  }

  const greeting = userName ? `Hello <strong>${userName}</strong>,` : "Hello,";

  const bodyContent = `
    <h2 style="margin: 0 0 16px 0; font-size: 22px; font-weight: 700; color: #0f172a;">${heading}</h2>
    <p style="margin: 0 0 16px 0; font-size: 15px; color: #4b5563;">${greeting}</p>
    <p style="margin: 0 0 24px 0; font-size: 15px; color: #4b5563;">${message}</p>
    
    <div style="background-color: #f0fdfa; border: 2px dashed #23ada4; border-radius: 12px; padding: 22px; text-align: center; margin: 28px 0;">
      <div style="font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 1.5px; color: #0d9488; margin-bottom: 8px;">
        One-Time Verification Code
      </div>
      <div style="font-size: 36px; font-weight: 800; letter-spacing: 10px; color: #0f172a; font-family: monospace;">
        ${otp}
      </div>
    </div>

    <p style="margin: 0 0 8px 0; font-size: 13px; color: #6b7280; line-height: 1.5;">
      &#9200; <strong>Expires in:</strong> 10 minutes
    </p>
    <p style="margin: 0; font-size: 13px; color: #9ca3af; line-height: 1.5;">
      ${securityTip}
    </p>
  `;

  return sendEmail({
    to,
    subject,
    html: getBaseHtmlLayout({
      title: subject,
      bodyContent,
      footerNotice: "Never share your one-time code with anyone, including Bondy staff.",
    }),
  });
};

/**
 * Sends Referral Invite Email
 */
const sendReferralInviteEmail = async ({ to, referrerName = "A friend", referralLink, referralCode }) => {
  const subject = `${referrerName} invited you to join Bondy!`;
  const bodyContent = `
    <h2 style="margin: 0 0 16px 0; font-size: 22px; font-weight: 700; color: #0f172a;">You've Been Invited!</h2>
    <p style="margin: 0 0 16px 0; font-size: 15px; color: #4b5563;">
      <strong>${referrerName}</strong> has invited you to discover and book the best events, workshops, and courses on <strong>Bondy</strong>.
    </p>
    <p style="margin: 0 0 24px 0; font-size: 15px; color: #4b5563;">
      Join now and get exclusive rewards and discounts on your first booking!
    </p>
    
    <div style="text-align: center; margin: 32px 0;">
      <a href="${referralLink}" style="display: inline-block; background-color: #23ada4; color: #ffffff; text-decoration: none; font-weight: 600; font-size: 16px; padding: 14px 36px; border-radius: 8px; box-shadow: 0 4px 12px rgba(35, 173, 164, 0.3);">
        Accept Invite &amp; Sign Up
      </a>
    </div>

    ${referralCode ? `
    <p style="margin: 20px 0 0 0; text-align: center; font-size: 13px; color: #6b7280;">
      Referral Code: <strong style="color: #0f172a; font-family: monospace; font-size: 14px;">${referralCode}</strong>
    </p>
    ` : ""}
  `;

  return sendEmail({
    to,
    subject,
    html: getBaseHtmlLayout({
      title: subject,
      bodyContent,
    }),
  });
};

/**
 * Sends Booking Confirmation Email
 */
const sendBookingConfirmationEmail = async ({
  to,
  userName = "Valued Customer",
  bookingType = "EVENT",
  itemTitle,
  bookingId,
  totalAmount,
  date,
  venue,
  attachments = [],
}) => {
  const isEvent = bookingType === "EVENT";
  const typeLabel = isEvent ? "Event" : "Course";
  const subject = `Booking Confirmed: ${itemTitle} (#${bookingId || ""})`;

  const formattedAmount = totalAmount !== undefined ? `${Number(totalAmount).toLocaleString()} MNT` : "";
  const formattedDate = date ? new Date(date).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" }) : "";

  const bodyContent = `
    <div style="text-align: center; margin-bottom: 24px;">
      <div style="display: inline-block; background-color: #d1fae5; color: #065f46; font-size: 13px; font-weight: 700; padding: 6px 16px; border-radius: 9999px; text-transform: uppercase; letter-spacing: 0.5px;">
        &#10003; Booking Confirmed
      </div>
      <h2 style="margin: 16px 0 4px 0; font-size: 22px; font-weight: 700; color: #0f172a;">${itemTitle}</h2>
      <p style="margin: 0; font-size: 14px; color: #6b7280;">Booking ID: <strong>#${bookingId}</strong></p>
    </div>

    <p style="margin: 0 0 20px 0; font-size: 15px; color: #4b5563;">
      Hello <strong>${userName}</strong>,<br>
      Your booking for this ${typeLabel.toLowerCase()} has been successfully confirmed. Below are your details:
    </p>

    <div style="background-color: #f9fafb; border: 1px solid #e5e7eb; border-radius: 12px; padding: 20px; margin-bottom: 24px;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="font-size: 14px;">
        <tr>
          <td style="padding: 6px 0; color: #6b7280;">Type:</td>
          <td style="padding: 6px 0; text-align: right; font-weight: 600; color: #0f172a;">${typeLabel}</td>
        </tr>
        ${formattedDate ? `
        <tr>
          <td style="padding: 6px 0; color: #6b7280;">Date &amp; Time:</td>
          <td style="padding: 6px 0; text-align: right; font-weight: 600; color: #0f172a;">${formattedDate}</td>
        </tr>
        ` : ""}
        ${venue ? `
        <tr>
          <td style="padding: 6px 0; color: #6b7280;">Location / Venue:</td>
          <td style="padding: 6px 0; text-align: right; font-weight: 600; color: #0f172a;">${venue}</td>
        </tr>
        ` : ""}
        ${formattedAmount ? `
        <tr>
          <td style="padding: 6px 0; color: #6b7280; border-top: 1px solid #e5e7eb; font-weight: 600;">Total Paid:</td>
          <td style="padding: 6px 0; text-align: right; font-weight: 700; color: #23ada4; font-size: 16px; border-top: 1px solid #e5e7eb;">${formattedAmount}</td>
        </tr>
        ` : ""}
      </table>
    </div>

    <p style="margin: 0; font-size: 14px; color: #4b5563;">
      Your e-tickets and QR codes are available in your Bondy account under <strong>My Tickets</strong>. You can present the QR code directly at the venue for check-in.
    </p>
  `;

  return sendEmail({
    to,
    subject,
    html: getBaseHtmlLayout({
      title: subject,
      bodyContent,
      footerNotice: "Please present your ticket QR code at the entrance for admission.",
    }),
    attachments,
  });
};

/**
 * Sends Notification Email for system updates/reminders/alerts
 */
const sendNotificationEmail = async ({ to, userName = "", title, message, actionUrl }) => {
  const subject = title || "Notification from Bondy";
  const greeting = userName ? `Hello <strong>${userName}</strong>,` : "Hello,";

  const bodyContent = `
    <h2 style="margin: 0 0 16px 0; font-size: 22px; font-weight: 700; color: #0f172a;">${title}</h2>
    <p style="margin: 0 0 16px 0; font-size: 15px; color: #4b5563;">${greeting}</p>
    <div style="margin: 0 0 24px 0; font-size: 15px; color: #4b5563; line-height: 1.6;">
      ${message}
    </div>

    ${actionUrl ? `
    <div style="text-align: center; margin: 30px 0;">
      <a href="${actionUrl}" style="display: inline-block; background-color: #23ada4; color: #ffffff; text-decoration: none; font-weight: 600; font-size: 15px; padding: 12px 30px; border-radius: 8px;">
        View in Bondy
      </a>
    </div>
    ` : ""}
  `;

  return sendEmail({
    to,
    subject,
    html: getBaseHtmlLayout({
      title: subject,
      bodyContent,
    }),
  });
};

module.exports = {
  transporter,
  sendEmail,
  sendOtpEmail,
  sendReferralInviteEmail,
  sendBookingConfirmationEmail,
  sendNotificationEmail,
};

