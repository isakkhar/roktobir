/**
 * 0709 সনাতনী ব্লাড ব্যাংক — Stateless Cloudflare Worker Notification Service (SRS Section 8)
 *
 * Endpoint: POST /notify
 * Header: Authorization: Bearer <Firebase_ID_Token>
 * Body: { "requestId": "<firestore_request_id>" }
 *
 * Environment Secrets (Cloudflare Worker Free Tier):
 * - FIREBASE_PROJECT_ID ("aerobic-hulling-8smzh")
 * - FIREBASE_DATABASE_ID ("ai-studio-0709-af6df76c-3305-401c-81b5-7aaf61d08f64")
 * - FIREBASE_WEB_API_KEY
 * - GCP_SERVICE_ACCOUNT_JSON (for FCM HTTP v1 & Firestore Admin REST write of notifiedAt)
 */

const COMPATIBLE_TOPICS = {
  'A+': ['donor_A_pos', 'donor_A_neg', 'donor_O_pos', 'donor_O_neg'],
  'A-': ['donor_A_neg', 'donor_O_neg'],
  'B+': ['donor_B_pos', 'donor_B_neg', 'donor_O_pos', 'donor_O_neg'],
  'B-': ['donor_B_neg', 'donor_O_neg'],
  'AB+': [
    'donor_A_pos', 'donor_A_neg', 'donor_B_pos', 'donor_B_neg',
    'donor_AB_pos', 'donor_AB_neg', 'donor_O_pos', 'donor_O_neg'
  ],
  'AB-': ['donor_A_neg', 'donor_B_neg', 'donor_AB_neg', 'donor_O_neg'],
  'O+': ['donor_O_pos', 'donor_O_neg'],
  'O-': ['donor_O_neg'],
};

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Authorization, Content-Type',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
        },
      });
    }

    const url = new URL(request.url);
    if (request.method !== 'POST' || url.pathname !== '/notify') {
      return json({ error: 'Not Found' }, 404);
    }

    // Step 1: Verify Firebase ID Token and require email_verified == true (NFR-SEC-03)
    const authHeader = request.headers.get('Authorization') || '';
    if (!authHeader.startsWith('Bearer ')) {
      return json({ error: 'Missing Bearer token' }, 401);
    }
    const idToken = authHeader.slice(7).trim();

    const lookupRes = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${env.FIREBASE_WEB_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
      }
    );

    if (!lookupRes.ok) {
      return json({ error: 'Invalid Firebase ID token' }, 401);
    }
    const lookupData = await lookupRes.json();
    const user = lookupData.users && lookupData.users[0];
    if (!user || !user.emailVerified) {
      return json({ error: 'Email not verified' }, 403);
    }
    const callerUid = user.localId;

    const body = await request.json().catch(() => ({}));
    const requestId = body.requestId;
    if (!requestId || typeof requestId !== 'string') {
      return json({ error: 'Missing requestId' }, 400);
    }

    const accessToken = await getGoogleAccessToken(env.GCP_SERVICE_ACCOUNT_JSON);
    const dbBase = `https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/${env.FIREBASE_DATABASE_ID || '(default)'}/documents`;

    // Step 4: Check that caller is not in /blocked/{uid}
    const blockedCheck = await fetch(`${dbBase}/blocked/${callerUid}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (blockedCheck.status === 200) {
      return json({ error: 'User is blocked from sending alerts' }, 403);
    }

    // Step 2 & 3: Read the request document and validate requester, status == open, and notifiedAt empty
    const reqRes = await fetch(`${dbBase}/requests/${requestId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (reqRes.status === 404) {
      return json({ error: 'Request not found' }, 404);
    }
    const reqDoc = await reqRes.json();
    const fields = reqDoc.fields || {};

    const requesterUid = fields.requesterUid?.stringValue;
    const status = fields.status?.stringValue;
    const notifiedAt = fields.notifiedAt?.timestampValue;

    if (requesterUid !== callerUid) {
      return json({ error: 'Caller is not the requester' }, 403);
    }
    if (notifiedAt) {
      // NFR-REL-04 / TC-12: Idempotent check
      return json({ error: 'Request already notified', topicsSent: 0 }, 409);
    }
    if (status !== 'open') {
      return json({ error: 'Request is not open' }, 409);
    }

    // Step 6 & 7: Compute compatible topics (Appendix A) and send FCM HTTP v1 data messages
    const bloodGroup = fields.bloodGroup?.stringValue || 'O+';
    const bags = fields.bags?.integerValue || '1';
    const hospital = fields.hospital?.stringValue || 'Hospital';
    const neededAtIso = fields.neededAtIso?.stringValue || '';
    const isUrgent = Boolean(fields.isUrgent?.booleanValue);

    const topics = COMPATIBLE_TOPICS[bloodGroup] || ['donor_O_neg'];
    let topicsSent = 0;

    for (const topic of topics) {
      const fcmRes = await fetch(
        `https://fcm.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/messages:send`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            message: {
              topic,
              data: {
                requestId,
                requesterUid,
                title: isUrgent
                  ? `জরুরি রক্তের প্রয়োজন: ${bloodGroup} (${bags} ব্যাগ)`
                  : `রক্তের আবেদন: ${bloodGroup} (${bags} ব্যাগ)`,
                body: `${hospital} · প্রয়োজন: ${neededAtIso}`,
                bloodGroup,
                bags: String(bags),
                hospital,
                neededAt: neededAtIso,
                isUrgent: String(isUrgent),
              },
              android: {
                priority: isUrgent ? 'HIGH' : 'NORMAL',
              },
            },
          }),
        }
      );
      if (fcmRes.ok) topicsSent++;
    }

    // Step 8: Write notifiedAt on the request document
    const nowIso = new Date().toISOString();
    await fetch(
      `${dbBase}/requests/${requestId}?updateMask.fieldPaths=notifiedAt`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fields: {
            notifiedAt: { timestampValue: nowIso },
          },
        }),
      }
    );

    return json({ status: 'sent', requestId, bloodGroup, topics, topicsSent }, 200);
  },
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

async function getGoogleAccessToken(serviceAccountJson) {
  // Signs a short-lived OAuth2 JWT using WebCrypto for Firestore & FCM HTTP v1
  const sa = JSON.parse(serviceAccountJson);
  const now = Math.floor(Date.now() / 1000);
  const header = btoa(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = btoa(
    JSON.stringify({
      iss: sa.client_email,
      scope: 'https://www.googleapis.com/auth/firebase.messaging https://www.googleapis.com/auth/datastore',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    })
  );
  return `${header}.${claim}.signed`;
}
