/**
 * /api/add-event — Vercel serverless function
 *
 * Riceve POST con:
 *   - credential   (JWT Google ID token dal sign-in lato client)
 *   - summary      (string)
 *   - startISO     (ISO 8601 date)
 *   - hours        (number, durata in ore)
 *   - location     (string)
 *   - tag          (LIVE | CLUB | FESTIVAL | PRIVATE | TRIBUTE)
 *   - ticketUrl    (optional, string)
 *   - notes        (optional, string)
 *
 * Flusso:
 *   1. Verifica il JWT Google con google-auth-library
 *   2. Confronta payload.email con AUTHORIZED_EMAIL (env var, supporta lista CSV)
 *   3. Se ok: scrive evento sul Google Calendar via Service Account (googleapis)
 *
 * Env vars necessari (Vercel → Settings → Environment Variables):
 *   GOOGLE_OAUTH_CLIENT_ID   — Client ID OAuth Web (lo stesso usato in public/formdate/index.html)
 *   AUTHORIZED_EMAIL         — email autorizzata (CSV per piu indirizzi)
 *   GOOGLE_SA_KEY            — JSON intero del Service Account (multiline ok)
 *   CAL_ID                   — calendar id (es. 1g88f4smojhkgocrd9qog1dh0o@group.calendar.google.com)
 *
 * Setup Google Cloud Console (~10 min, una tantum):
 *   1. APIs & Services → Credentials → CREATE CREDENTIALS → OAuth client ID (Web application)
 *      Authorized JavaScript origins: https://kinkypeople.it, http://localhost:3000
 *      Copia il Client ID -> GOOGLE_OAUTH_CLIENT_ID
 *   2. IAM & Admin → Service Accounts → CREATE → assegna nome
 *      Vai sul service account creato → Keys → ADD KEY (JSON) → scarica
 *      Apri il file JSON, copialo TUTTO -> GOOGLE_SA_KEY
 *      Annota l'email del service account (es. xxx@xxx.iam.gserviceaccount.com)
 *   3. APIs & Services → Library → cerca "Google Calendar API" → ENABLE
 *   4. Apri Google Calendar (con info@kinkypeople.it):
 *      Calendar Kinky → Settings & Sharing → Share with specific people or groups
 *      Aggiungi email del service account come "Make changes to events"
 *   5. Vercel → Settings → Environment Variables → incolla le 4 var → Redeploy
 */

import { OAuth2Client } from 'google-auth-library';
import { google } from 'googleapis';

const oauthClient = new OAuth2Client();

const VALID_TAGS = ['LIVE', 'CLUB', 'FESTIVAL', 'PRIVATE', 'TRIBUTE'];

function bad(res, code, message) {
  return res.status(code).json({ ok: false, error: message });
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return bad(res, 405, 'Method not allowed');
  }

  // Validate env (diagnostic: dice esattamente cosa manca)
  const CLIENT_ID = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const AUTHORIZED_EMAIL = process.env.AUTHORIZED_EMAIL;
  const GOOGLE_SA_KEY = process.env.GOOGLE_SA_KEY;
  const CAL_ID = process.env.CAL_ID;
  const missing = [];
  if (!CLIENT_ID) missing.push('GOOGLE_OAUTH_CLIENT_ID');
  if (!AUTHORIZED_EMAIL) missing.push('AUTHORIZED_EMAIL');
  if (!GOOGLE_SA_KEY) missing.push('GOOGLE_SA_KEY');
  if (!CAL_ID) missing.push('CAL_ID');
  if (missing.length) {
    return bad(res, 500, 'Env vars mancanti su Vercel: ' + missing.join(', '));
  }

  // Parse body (Vercel auto-parses JSON when Content-Type: application/json)
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const {
    credential, summary, startISO, hours, location, tag, notes,
  } = body;
  // venueUrl e' il nome nuovo; ticketUrl resta accettato per backward compat
  const venueUrl = body.venueUrl || body.ticketUrl || '';

  if (!credential || typeof credential !== 'string') return bad(res, 400, 'Missing credential');
  if (!summary || typeof summary !== 'string') return bad(res, 400, 'Missing summary');
  if (!startISO || isNaN(Date.parse(startISO))) return bad(res, 400, 'Missing/invalid startISO');
  if (!location || typeof location !== 'string') return bad(res, 400, 'Missing location');
  const hoursNum = Number(hours);
  if (!Number.isFinite(hoursNum) || hoursNum <= 0 || hoursNum > 24) return bad(res, 400, 'Invalid hours');
  const tagUp = String(tag || 'LIVE').toUpperCase();
  if (!VALID_TAGS.includes(tagUp)) return bad(res, 400, 'Invalid tag');

  // 1) Verify Google ID token
  let payload;
  try {
    const ticket = await oauthClient.verifyIdToken({
      idToken: credential,
      audience: CLIENT_ID,
    });
    payload = ticket.getPayload();
  } catch (e) {
    return bad(res, 401, 'Token non valido');
  }
  if (!payload || !payload.email_verified) return bad(res, 401, 'Email non verificata da Google');

  const authorized = AUTHORIZED_EMAIL.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  if (!authorized.includes((payload.email || '').toLowerCase())) {
    return bad(res, 403, `Email ${payload.email} non autorizzata`);
  }

  // 2) Service Account auth
  let saCreds;
  try { saCreds = JSON.parse(GOOGLE_SA_KEY); }
  catch (e) { return bad(res, 500, 'GOOGLE_SA_KEY non e un JSON valido'); }

  const auth = new google.auth.JWT(
    saCreds.client_email,
    null,
    (saCreds.private_key || '').replace(/\\n/g, '\n'),
    ['https://www.googleapis.com/auth/calendar.events'],
  );
  const calendar = google.calendar({ version: 'v3', auth });

  // 3) Build event
  const start = new Date(startISO);
  const end = new Date(start.getTime() + hoursNum * 3600000);

  // Format della description:
  //   <TAG>
  //   URL: <venue url>        (riga marker, parsata dal sito home)
  //   [riga vuota]
  //   <notes utente>
  //   [riga vuota]
  //   — Aggiunto da <email> via /formdate
  const descriptionParts = [tagUp];
  if (venueUrl) descriptionParts.push(`URL: ${venueUrl}`);
  if (notes) descriptionParts.push(`\n${notes}`);
  descriptionParts.push(`\n— Aggiunto da ${payload.email} via /formdate`);

  try {
    const ev = await calendar.events.insert({
      calendarId: CAL_ID,
      requestBody: {
        summary: summary.trim().slice(0, 200),
        location: location.trim().slice(0, 200),
        description: descriptionParts.join('\n').slice(0, 4000),
        start: { dateTime: start.toISOString(), timeZone: 'Europe/Rome' },
        end:   { dateTime: end.toISOString(),   timeZone: 'Europe/Rome' },
      },
    });

    return res.status(200).json({
      ok: true,
      eventId: ev.data.id,
      htmlLink: ev.data.htmlLink,
    });
  } catch (e) {
    const msg = (e && e.errors && e.errors[0] && e.errors[0].message) || e.message || 'Errore inserimento';
    // 403 dal Calendar = service account non ha permessi su quel calendar
    const code = (e && e.code) || 500;
    return bad(res, code === 403 ? 502 : 500, msg);
  }
}
