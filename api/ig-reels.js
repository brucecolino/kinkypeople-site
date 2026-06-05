/**
 * /api/ig-reels — Vercel serverless function
 *
 * Restituisce gli ultimi reel del profilo @kinkypeoplejamrock pullati live
 * via Instagram Graph API. Se le env var non sono configurate cade su una
 * lista hardcoded di backup (cosi il sito mostra comunque qualcosa).
 *
 * Configurazione (Vercel dashboard → Settings → Environment Variables):
 *   IG_USER_ID        — User ID Business IG (numerico, es. 17841401234567890)
 *   IG_ACCESS_TOKEN   — Long-lived access token (60gg, refresh ogni 50)
 *
 * Come ottenerli (one-time setup ~15 min):
 *   1. Converti @kinkypeoplejamrock in Business/Creator account (in app IG)
 *   2. Collega l'account a una Pagina Facebook
 *   3. Vai su developers.facebook.com → My Apps → Create App (Business type)
 *   4. Aggiungi product "Instagram Graph API"
 *   5. Genera User Access Token via Graph API Explorer con scope
 *      instagram_basic, pages_show_list, pages_read_engagement
 *   6. Estendi a long-lived: GET /oauth/access_token?grant_type=fb_exchange_token...
 *   7. Recupera IG User ID: GET /me/accounts → page id → /{page-id}?fields=instagram_business_account
 *   8. Incolla in Vercel env vars, redeploy → reel pullati live.
 *
 * Senza setup: il sito mostra la lista di backup sotto (aggiornala a mano).
 */

/* IMPORTANTE: gli URL qui sotto sono placeholder. Quando l'utente vede
 * "link rotto / login Instagram" significa che gli ID non esistono.
 *
 * Per sostituirli con i reel veri:
 *   1. Vai su https://www.instagram.com/kinkypeoplejamrock/reels/
 *   2. Apri un reel, clicca i 3 puntini → "Copia link"
 *   3. Incolla l'URL qui dentro (formato https://www.instagram.com/reel/XYZ/)
 *   4. Servono ALMENO 4 reel per attivare il carousel loop su desktop (3+1).
 *
 * Alternativa: configura IG_USER_ID + IG_ACCESS_TOKEN come env vars su Vercel
 * (vedi sotto) per pull dinamico dei reel reali del profilo.
 */
const FALLBACK_REELS = [
  { permalink: 'https://www.instagram.com/reel/DJy_gg5NhwS/' },
  { permalink: 'https://www.instagram.com/reel/DJl5VmztJBp/' },
  { permalink: 'https://www.instagram.com/reel/DImvU9CNRPB/' },
  { permalink: 'https://www.instagram.com/reel/DXxxxxxxxxx/' }, // ← sostituire
  { permalink: 'https://www.instagram.com/reel/DYxxxxxxxxx/' }, // ← sostituire
  { permalink: 'https://www.instagram.com/reel/DZxxxxxxxxx/' }, // ← sostituire
];

export default async function handler(req, res) {
  // Cache CDN: 1 ora con stale-while-revalidate per non hammerare IG API
  res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
  res.setHeader('Access-Control-Allow-Origin', '*');

  const token = process.env.IG_ACCESS_TOKEN;
  const userId = process.env.IG_USER_ID;

  if (!token || !userId) {
    return res.status(200).json({ source: 'fallback', items: FALLBACK_REELS });
  }

  try {
    const url = `https://graph.instagram.com/v18.0/${encodeURIComponent(userId)}/media`
      + `?fields=id,media_type,media_product_type,permalink,thumbnail_url,timestamp`
      + `&access_token=${encodeURIComponent(token)}`
      + `&limit=18`;

    const r = await fetch(url);
    if (!r.ok) {
      const errText = await r.text().catch(() => '');
      return res.status(200).json({
        source: 'fallback',
        items: FALLBACK_REELS,
        error: `IG ${r.status}: ${errText.slice(0, 200)}`,
      });
    }

    const data = await r.json();
    const items = (data.data || [])
      // Reels are media_product_type === 'REELS' on newer API, fallback to VIDEO
      .filter(m => m.media_product_type === 'REELS' || m.media_type === 'VIDEO')
      .slice(0, 6)
      .map(m => ({ permalink: m.permalink, thumbnail_url: m.thumbnail_url }));

    return res.status(200).json({
      source: items.length ? 'instagram' : 'fallback',
      items: items.length ? items : FALLBACK_REELS,
    });
  } catch (e) {
    return res.status(200).json({
      source: 'fallback',
      items: FALLBACK_REELS,
      error: String(e).slice(0, 200),
    });
  }
}
