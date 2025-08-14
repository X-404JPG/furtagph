// netlify/functions/pet-found-email.js
const admin = require("firebase-admin");
const sgMail = require("@sendgrid/mail");

// Initialize firebase-admin with service account from env
if (!admin.apps.length) {
  if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
    console.error("FIREBASE_SERVICE_ACCOUNT missing");
    // Do not throw here to keep function loadable during local dev if not configured
  } else {
    const svc = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    admin.initializeApp({
      credential: admin.credential.cert(svc),
    });
  }
}

// Configure SendGrid
if (process.env.SENDGRID_API_KEY) {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);
} else {
  console.warn("SENDGRID_API_KEY not set");
}

const THROTTLE_MINUTES = 30; // server-side throttle window

exports.handler = async function (event, context) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    if (!admin.apps.length) {
      console.error("Firebase admin not initialized");
      return { statusCode: 500, body: "Server misconfigured" };
    }
    if (!process.env.SENDGRID_API_KEY) {
      return { statusCode: 500, body: "Email provider not configured" };
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

    // Owner email (adapt for your field names)
    const ownerEmail = owner.emailAddress || owner.email || ownerEmail || null;
    const ownerName = owner.fullName || "Pet owner";
    const petName = pet.name || "your pet";

    if (!ownerEmail) return { statusCode: 400, body: "Owner email missing" };

    // Server-side throttle: check recent sends
    const thresholdDate = new Date(Date.now() - THROTTLE_MINUTES * 60 * 1000);
    const thresholdTs = admin.firestore.Timestamp.fromDate(thresholdDate);

    const scansRef = db.collection("scanEvents");
    const recent = await scansRef
      .where("petId", "==", petId)
      .where("createdAt", ">", thresholdTs)
      .limit(1)
      .get();

    if (!recent.empty) {
      // record event, but do not send email
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

    // Build Maps URL if available
    const mapsUrl = (lat != null && lng != null) ? `https://www.google.com/maps?q=${lat},${lng}` : null;

    // Email HTML
    const html = `
      <div style="font-family: system-ui, -apple-system,Segoe UI, Roboto, Arial; line-height:1.5; color:#111;">
        <h3 style="margin:0 0 8px">Hello ${ownerName},</h3>
        <p>Your pet <strong>${petName}</strong> was scanned via its QR tag.</p>
        ${mapsUrl ? `
          <p>Click the button to see the reported location:</p>
          <p><a href="${mapsUrl}" style="display:inline-block;background:#2563eb;color:#fff;padding:10px 14px;border-radius:8px;text-decoration:none;">View Location</a></p>
          <p style="font-size:12px;color:#555;">Or copy this link: ${mapsUrl}</p>
        ` : `<p>The scanner did not share their location.</p>`}
        <hr style="border:none;border-top:1px solid #eee;margin:12px 0;">
        <p style="font-size:12px;color:#666;">If you didn't expect this, check the location or contact the scanner directly.</p>
      </div>
    `;

    // Send via SendGrid
    const msg = {
      to: ownerEmail,
      from: process.env.SENDGRID_SENDER || "no-reply@yourdomain.com", // must be verified in SendGrid
      subject: `Your pet ${petName} may have been found`,
      html,
    };

    await sgMail.send(msg);

    // Log the scan event
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
