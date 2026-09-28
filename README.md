# FirstCode — Frontend

Statički HTML/CSS/JS frontend za FirstCode platformu za dokumente. Komunicira sa Spring Boot REST API backendom.

Korisnici se prijavljuju, otpremaju fajlove u foldere, pregledaju ih u pregledaču i preuzimaju original. Pristup folderima ide preko uloga i dozvola (`READ` / `WRITE` / `DELETE`). Administrator zaobilazi ACL.

---

## Tehnologije

| Tehnologija | Verzija | Uloga |
|---|---|---|
| Bootstrap | 3.x | Grid i UI komponente |
| jQuery | 3.x | DOM manipulacija i AJAX |
| Font Awesome | 4.x | Ikonice |
| Google Fonts | Montserrat | Tipografija |
| PDF.js | 3.11.174 | Pregled PDF-a na mobilnim pregledačima (CDN) |

Podržani formati: PDF, DOC, DOCX, JSON, XML, TXT. PDF i tekst (JSON, XML, TXT) imaju pregled u pregledaču. Word fajlovi se preuzimaju kao original.

---

## Stranice

### Javne

| Fajl | Naslov | Opis |
|---|---|---|
| `index.html` | Početna | Landing: šta platforma radi i kako se kreće od naloga do dokumenata |
| `about.html` | O nama | Informacije o firmi |
| `contact.html` | Kontakt | Kontakt forma i podaci |
| `help.html` | Pomoć | Česta pitanja (accordion) |
| `login.html` | Prijava | Prijava emailom i lozinkom |
| `register.html` | Registracija | Otvaranje naloga i slanje verifikacionog emaila |
| `verify-email.html` | Verifikacija emaila | Potvrda adrese tokenom iz emaila |
| `forgot-password.html` | Zaboravljena lozinka | Zahtev za reset lozinke |
| `reset-password.html` | Resetovanje lozinke | Nova lozinka uz token iz emaila |
| `404.html` | Not Found | Stranica za nepostojeće URL-ove |
| `500.html` | Server Error | Stranica za greške na serveru |
| `under-construction.html` | U izradi | Placeholder za stranice u izgradnji |

### Za prijavljene korisnike

| Fajl | Naslov | Opis |
|---|---|---|
| `documents.html` | Dokumenti | Stablo foldera, otpremanje, pretraga, pregled, preuzimanje, premeštanje i brisanje |
| `my-documents.html` | Moja dokumenta | Dokumenti koje je otpremio trenutni korisnik, sa pretragom i pregledom |
| `account.html` | Moj nalog | Izmena profila i lozinke |

`documents.html` traži prijavu. Folderi (kreiranje, preimenovanje, brisanje, ACL) su dostupni administratoru. Otpremanje, premeštanje i brisanje dokumenata prate dozvolu na folderu: `WRITE` za otpremanje, `DELETE` na izvoru i `WRITE` na odredištu za premeštanje, `DELETE` za brisanje. Pregled i preuzimanje traže `READ`.

### Administracija

| Fajl | Opis |
|---|---|
| `admin-users.html` | Lista korisnika, promena uloge (`ADMIN` / `CUSTOMER` / `VIEWER`) i statusa (`ACTIVE` / `INACTIVE`). Vidljivo u meniju samo administratoru |

Uloge: `ADMIN` (pun pristup), `CUSTOMER` (klijent), `VIEWER` (samo pregled, osim ako ACL na folderu ne da više).

---

## Struktura fajlova

```
.
├── index.html
├── documents.html
├── my-documents.html
├── account.html
├── admin-users.html
├── login.html
├── register.html
├── verify-email.html
├── forgot-password.html
├── reset-password.html
├── about.html
├── contact.html
├── help.html
├── 404.html
├── 500.html
├── under-construction.html
│
├── css/
│   ├── bootstrap.min.css
│   ├── font-awesome.min.css
│   ├── style.css                  ← globalni stilovi
│   ├── page-hero.css              ← deljeni hero banner
│   ├── landing.css                ← početna
│   ├── documents.css              ← dokumenti i pregled
│   ├── account.css
│   ├── admin-users.css
│   ├── login.css
│   ├── register.css
│   ├── verify-email.css
│   ├── forgot-password.css
│   ├── reset-password.css
│   ├── about.css
│   ├── contact.css
│   ├── faq.css
│   └── under-construction.css
│
├── js/
│   ├── jquery.min.js
│   ├── bootstrap.min.js
│   ├── config.js                  ← API_BASE auto-detekcija (dev/prod)
│   ├── auth.js                    ← AuthService (tokeni, uloge, authFetch)
│   ├── main.js                    ← header nalog / odjava
│   ├── main-nav.js                ← meni (Korisnici samo za ADMIN)
│   ├── landing.js                 ← CTA na početnoj kad postoji sesija
│   ├── documents.js               ← folderi, otpremanje, ACL, premeštanje
│   ├── my-documents.js            ← lična lista dokumenata
│   ├── pdf-preview.js             ← PDF pregled (iframe ili PDF.js)
│   ├── account.js                 ← profil i lozinka
│   ├── admin-users.js             ← administracija korisnika
│   ├── login.js
│   ├── register.js
│   ├── verify-email.js
│   ├── forgot-password.js
│   ├── reset-password.js
│   ├── contact-form.js
│   ├── faq.js
│   └── under-construction.js
│
├── img/                           ← logo
├── fonts/                         ← Font Awesome
├── CNAME                          ← firstcode.in.rs
└── site.webmanifest
```

---

## Konfiguracija

`js/config.js` automatski bira API endpoint na osnovu hostname-a:

```javascript
// localhost / 127.x / file:// → dev (isti host, port 8080)
API_BASE = 'http://' + host + ':8080'

// sve ostalo → produkcija
API_BASE = 'https://optimus-backend-cwbhusfcmq-ew.a.run.app'
```

Nema potrebe za menjanjem koda pri deployu — detekcija je automatska.

Prijava čuva `accessToken`, `refreshToken` i korisnika u `localStorage` (`js/auth.js`). Istekli access token se osvežava pre zaštićenih poziva.

---

## Pokretanje lokalno

Frontend je čisti statički HTML — nema build stepa.

1. Pokrenuti backend (Spring Boot) na portu `8080`
2. Servirati frontend kroz statički server (ne otvarati `index.html` kao `file://` ako backend očekuje konkretan host):

```bash
# Python
python -m http.server 3000

# Node (npx)
npx serve .
```

Otvori `http://localhost:3000`. API ide na `http://localhost:8080`.

---

## Deploy

Frontend je deployovan na **GitHub Pages** putem `CNAME` fajla (`firstcode.in.rs`).  
Backend je na **Google Cloud Run** (europe-west1).

---

## CSS/JS konvencije

- Nema inline `<style>` ili `<script>` blokova u produkcijskim stranicama — sve je u eksternim fajlovima
- Svaka stranica uključuje zajednički base stack + page-specific CSS/JS fajlove
- Error stranice (`404.html`, `500.html`) su self-contained — minimalne eksterne zavisnosti da bi radile čak i kad asset pipeline ne radi
- UI dozvola prati backend pravila; backend ostaje autoritativan

### Zajednički CSS stack (sve stranice)
```html
bootstrap.min.css → font-awesome.min.css → style.css
```

### Zajednički JS stack (sve stranice)
```html
jquery.min.js → bootstrap.min.js → config.js → auth.js → main.js → main-nav.js
```

`documents.html` i `my-documents.html` dodatno učitavaju `pdf-preview.js` pre page skripte. PDF.js se povlači sa CDN-a samo kad pregledač nema pouzdan ugrađeni PDF viewer (mobilni).
