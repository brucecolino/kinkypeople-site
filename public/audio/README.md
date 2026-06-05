# Audio del KP Audio Player

Carica qui i file MP3 della band. Poi in `public/index.html`, trova il blocco
`KP_TRACKS` (cerca "KP_TRACKS =") e decommenta / aggiungi le righe con i tuoi file.

## Esempio

```js
var KP_TRACKS = [
  { src: '/audio/jamrock-intro.mp3',   title: 'JAMROCK INTRO',     sub: 'Kinky People' },
  { src: '/audio/no-woman.mp3',        title: 'NO WOMAN NO CRY',   sub: 'Bob Marley Tribute' },
  { src: '/audio/redemption.mp3',      title: 'REDEMPTION SONG',   sub: 'Bob Marley Tribute' },
];
```

## Note tecniche

- Formato consigliato: **MP3 192 kbps** (compromesso qualità/peso).
- Peso indicativo: ~1.5 MB per minuto di audio a 192 kbps.
- I file vengono caricati ON DEMAND: solo la prima track viene fetchata all'apertura del sito.
- Vercel ha un limite di **100 MB per file**; per assets statici è ampio.
- L'ordine in `KP_TRACKS` viene **shuffled** all'avvio (ogni visita riascolti
  in ordine diverso).

## Autoplay

I browser moderni bloccano l'autoplay con audio se l'utente non ha mai
interagito col dominio. Il player tenta `audio.play()` all'avvio:

- ✅ Se va: parte la musica + icona equalizer animata
- ❌ Se bloccato: il box rimane visibile col bottone ▶, e al **primo click**
  ovunque sul sito (anche un link, scroll non conta) parte la musica.

Dopo che l'utente ha "interagito" una volta col tuo dominio, Chrome ricorda
e gli autoplay successivi (sessioni future) saranno permessi.
