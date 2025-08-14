import { google } from 'googleapis';

const oAuth2Client = new google.auth.OAuth2(
  process.env.GMAIL_CLIENT_ID,
  process.env.GMAIL_CLIENT_SECRET,
  'https://developers.google.com/oauthplayground'
);

oAuth2Client.setCredentials({
  refresh_token: process.env.GMAIL_REFRESH_TOKEN
});

const gmail = google.gmail({ version: 'v1', auth: oAuth2Client });

// Helper to base64 encode email
function makeBody(to, subject, message) {
  const str = [
    `From: ${process.env.GMAIL_SENDER}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    'Content-Type: text/html; charset=UTF-8',
    '',
    message
  ].join('\n');

  return Buffer.from(str)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export async function handler(event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const { to, subject, message } = JSON.parse(event.body);

    if (!to || !subject || !message) {
      return { statusCode: 400, body: 'Missing required fields' };
    }

    await gmail.users.messages.send({
      userId: 'me',
      requestBody: {
        raw: makeBody(to, subject, message)
      }
    });

    return { statusCode: 200, body: 'Email sent successfully' };
  } catch (err) {
    console.error('Gmail send error', err);
    return { statusCode: 500, body: 'Internal Server Error' };
  }
}
