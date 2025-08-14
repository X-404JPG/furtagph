const admin = require("firebase-admin");
const { google } = require("googleapis");
const nodemailer = require("nodemailer");

// Initialize Firebase Admin
if (!admin.apps.length) {
  if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
    console.error("FIREBASE_SERVICE_ACCOUNT missing");
  } else {
    const svc = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    admin.initializeApp({
      credential: admin.credential.cert(svc),
    });
  }
}

// Gmail OAuth2 setup
const oAuth2Client = new google.auth.OAuth2(
  process.env.GMAIL_CLIENT_ID,
  process.env.GMAIL_CLIENT_SECRET
);
oAuth2Client.setCredentials({
  refresh_token: process.env.GMAIL_REFRESH_TOKEN,
});

// Email throttle (optional)
const THROTTLE_MINUTES = 30;

exports.handler = async function (event, context) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    if (!admin.apps.length) {
      console.error("Firebase admin not initialized");
      return { statusCode: 500, body: "Server misconfigured" };
    }

    const body = event.body ? JSON.parse(event.body) : {};
    const { petId, lat, lng, ua } = body;

    if (!petId) return { statusCode: 400, body: "petId required" };

    const db = admin.firestore();

    // Fetch pet
    const petDoc = await db.collection("pets").doc(petId).get();
    if (!petDoc.exists) return { statusCode: 404, body: "Pet not found" };
    const pet = petDoc.data();

    if (!pet.ownerID) return { statusCode: 400, body: "Pet has no ownerID" };

    // Fetch owner
    const ownerDoc = await db.collection("users").doc(pet.ownerID).get();
    if (!ownerDoc.exists) return { statusCode: 404, body: "Owner not found" };
    const owner = ownerDoc.data();

    const ownerEmail = owner.emailAddress || owner.email || null;
    const ownerName = owner.fullName || "Pet owner";
    const petName = pet.name || "your pet";

    if (!ownerEmail) return { statusCode: 400, body: "Owner email missing" };

    // Server-side throttle
    const thresholdDate = new Date(Date.now() - THROTTLE_MINUTES * 60 * 1000);
    const thresholdTs = admin.firestore.Timestamp.fromDate(thresholdDate);

    const scansRef = db.collection("scanEvents");
    const recent = await scansRef
      .where("petId", "==", petId)
      .where("createdAt", ">", thresholdTs)
      .limit(1)
      .get();

    if (!recent.empty) {
      await scansRef.add({
        petId,
        lat: lat ?? null,
        lng: lng ?? null,
        createdAt: admin.firestore.Timestamp.now(),
        emailed: false,
        ua: ua || null,
        reason: "throttled",
      });
      return { statusCode: 200, body: "Throttled" };
    }

    // Maps URL
    const mapsUrl =
      lat != null && lng != null ? `https://www.google.com/maps?q=${lat},${lng}` : null;

    const html = `
      <div style="font-family: system-ui, -apple-system,Segoe UI, Roboto, Arial; line-height:1.5; color:#111;">
        <h3>Hello ${ownerName},</h3>
        <p>Your pet <strong>${petName}</strong> was scanned via its QR tag.</p>
        ${
          mapsUrl
            ? `<p><a href="${mapsUrl}" style="display:inline-block;background:#2563eb;color:#fff;padding:10px 14px;border-radius:8px;text-decoration:none;">View Location</a></p>`
            : "<p>The scanner did not share their location.</p>"
        }
        <hr>
        <p style="font-size:12px;color:#666;">If you didn't expect this, check the location or contact the scanner directly.</p>
      </div>
    `;

    // Nodemailer transport
    const accessToken = await oAuth2Client.getAccessToken();
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        type: "OAuth2",
        user: process.env.GMAIL_EMAIL,
        clientId: process.env.GMAIL_CLIENT_ID,
        clientSecret: process.env.GMAIL_CLIENT_SECRET,
        refreshToken: process.env.GMAIL_REFRESH_TOKEN,
        accessToken: accessToken.token,
      },
    });

    const mailOptions = {
      from: process.env.GMAIL_EMAIL,
      to: ownerEmail,
      subject: `Your pet ${petName} may have been found`,
      html,
    };

    await transporter.sendMail(mailOptions);

    await scansRef.add({
      petId,
      lat: lat ?? null,
      lng: lng ?? null,
      createdAt: admin.firestore.Timestamp.now(),
      emailed: true,
      ua: ua || null,
      reason: "notified",
    });

    return { statusCode: 200, body: "Email sent" };
  } catch (err) {
    console.error("notify error:", err);
    return { statusCode: 500, body: "Server error" };
  }
};
