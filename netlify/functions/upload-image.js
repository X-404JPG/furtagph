// netlify/functions/upload-image.js
const cloudinary = require('cloudinary').v2;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

exports.handler = async (event) => {
  // CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: CORS, body: 'Method Not Allowed' };
  }

  try {
    const { imageBase64, userId, petId } = JSON.parse(event.body || '{}');

    if (!imageBase64) {
      return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Missing imageBase64' }) };
    }

    // You can pass a data URL ("data:image/png;base64,....") directly
    const upload = await cloudinary.uploader.upload(imageBase64, {
      folder: `furtagph/pets/${userId || 'anon'}`,
      public_id: petId ? `${petId}-${Date.now()}` : undefined,
      resource_type: 'image',
      overwrite: true,
    });

    return {
      statusCode: 200,
      headers: CORS,
      body: JSON.stringify({
        url: upload.secure_url,
        public_id: upload.public_id,
        width: upload.width,
        height: upload.height,
      }),
    };
  } catch (e) {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: e.message }) };
  }
};
