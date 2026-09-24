# FirstCode — Frontend

Statički HTML/CSS/JS frontend za FirstCode webshop. Komunicira sa Spring Boot REST API backendom.

---

## Tehnologije

| Tehnologija | Verzija | Uloga |
|---|---|---|
| Bootstrap | 3.x | Grid i UI komponente |
| jQuery | 3.x | DOM manipulacija i AJAX |
| Slick | 1.8 | Karuseli (proizvodi, brendovi) |
| noUiSlider | — | Price range slider |
| Font Awesome | 4.x | Ikonice |
| Google Fonts | Montserrat | Tipografija |

---

## Stranice

### Produkcijske

| Fajl | Naslov | Opis |
|---|---|---|
| `index.html` | Početna | Hero, novi proizvodi, bestsajleri, brendovi karusel |
| `store.html` | Prodavnica | Listing proizvoda sa filterima (kategorija, brend, cena) |
| `product.html` | Detalj proizvoda | Galerija, specifikacije, recenzije, QR share, upoređivanje |
| `cart.html` | Korpa | Pregled korpe, kalkulacija ukupne cene |
| `checkout.html` | Naručivanje | Forma za porudžbinu |
| `order-confirmation.html` | Potvrda porudžbine | Prikaz detalja posle uspešne narudžbine |
| `wishlist.html` | Lista želja | Sačuvani proizvodi |
| `compare.html` | Poređenje | Tabelarno poređenje do N proizvoda |
| `about.html` | O nama | Informacije o firmi |
| `contact.html` | Kontakt | Kontakt forma i podaci |
| `404.html` | Not Found | Stranica za nepostojeće URL-ove |
| `500.html` | Server Error | Stranica za greške na serveru |
| `under-construction.html` | U izradi | Placeholder za stranice u izgradnji |

### Admin panel (`admin/`)

| Fajl | Opis |
|---|---|
| `admin/index.html` | Dashboard |
| `admin/products.html` | Upravljanje proizvodima |
| `admin/product-form.html` | Dodavanje / izmena proizvoda |
| `admin/categories.html` | Upravljanje kategorijama |
| `admin/god-categories.html` | God kategorije (mega menu) |
| `admin/brands.html` | Upravljanje brendovima |
| `admin/orders.html` | Lista porudžbina |
| `admin/order-detail.html` | Detalj porudžbine |
| `admin/import.html` | Uvoz proizvoda |
| `admin/config.html` | Konfiguracija |

---

## Struktura fajlova

```
optimus/
├── index.html
├── store.html
├── product.html
├── cart.html
├── checkout.html
├── order-confirmation.html
├── wishlist.html
├── compare.html
├── about.html
├── contact.html
├── 404.html
├── 500.html
├── under-construction.html
│
├── css/
│   ├── bootstrap.min.css
│   ├── font-awesome.min.css
│   ├── slick.css / slick-theme.css
│   ├── nouislider.min.css
│   ├── style.css                  ← globalni stilovi
│   ├── page-hero.css              ← deljeni hero banner
│   ├── quick-view-modal.css       ← quick view modal
│   ├── god-categories.css         ← god kategorije sidebar
│   ├── brand-modern.css           ← filter brendova
│   ├── price-modern.css           ← filter cene
│   ├── category-modern.css        ← filter kategorija
│   ├── compare.css                ← poređenje proizvoda
│   ├── cart.css
│   ├── checkout.css
│   ├── wishlist.css
│   ├── contact.css
│   ├── about.css
│   └── under-construction.css
│
├── js/
│   ├── jquery.min.js
│   ├── bootstrap.min.js
│   ├── slick.min.js
│   ├── nouislider.min.js
│   ├── jquery.zoom.min.js
│   ├── config.js                  ← API_BASE auto-detekcija (dev/prod)
│   ├── main.js                    ← globalni init (slick, formatPrice, nav)
│   ├── main-nav.js                ← dinamički meni iz API-ja
│   ├── header-search.js           ← live pretraga
│   ├── cart.js                    ← globalna korpa (header dropdown + localStorage)
│   ├── wishlist.js                ← globalna lista želja
│   ├── compare.js                 ← globalno poređenje
│   ├── brands-carousel.js         ← brendovi karusel
│   ├── new-products.js            ← sekcija novih proizvoda
│   ├── bestseller-widgets.js      ← bestsajleri
│   ├── store.js                   ← store listing + paginacija
│   ├── store-god-categories.js    ← god kategorije filter
│   ├── store-modern-brands.js     ← brend filter
│   ├── store-modern-price.js      ← cena filter
│   ├── store-modern-categories.js ← kategorije filter
│   ├── product-detail.js          ← galerija, slick, zoom, dodaj u korpu
│   ├── reviews.js                 ← recenzije
│   ├── qr-share.js                ← QR kod deljenje
│   ├── quick-view-modal.js        ← quick view modal
│   ├── cart-view.js               ← prikaz korpe (cart.html)
│   ├── checkout.js                ← forma i slanje porudžbine
│   ├── order-confirmation.js      ← prikaz potvrde porudžbine
│   ├── wishlist-view.js           ← prikaz liste želja
│   ├── compare-view.js            ← prikaz poređenja
│   ├── contact-form.js            ← slanje kontakt forme
│   └── under-construction.js      ← progress bar animacija
│
├── admin/
│   ├── admin.css
│   ├── admin.js
│   └── *.html
│
├── img/                           ← lokalne slike (logo, hero)
├── fonts/                         ← Font Awesome + Slick fontovi
└── screenshot/                    ← screenshotovi stranica
```

---

## Konfiguracija

`js/config.js` automatski bira API endpoint na osnovu hostname-a:

```javascript
// localhost / 127.x → dev
API_BASE = 'http://localhost:8080'

// sve ostalo → produkcija
API_BASE = 'https://optimus-backend-473383712022.europe-west1.run.app'
```

Nema potrebe za menjanjem koda pri deployu — detekcija je automatska.

---

## Pokretanje lokalno

Frontend je čisti statički HTML — nema build stepa.

1. Pokrenuti backend (Spring Boot) na portu `8080`
2. Otvoriti `index.html` direktno u browseru ili servirati kroz bilo koji statički server:

```bash
# Python
python -m http.server 3000

# Node (npx)
npx serve .
```

---

## Deploy

Frontend je deployovan na **GitHub Pages** putem `CNAME` fajla (`optimus/CNAME`).  
Backend je na **Google Cloud Run** (europe-west1).

---

## CSS/JS konvencije

- Nema inline `<style>` ili `<script>` blokova u produkcijskim stranicama — sve je u eksternim fajlovima
- Svaka stranica uključuje zajednički base stack + page-specific CSS/JS fajlove
- Admin panel (`admin/`) je potpuno odvojen od frontend stacka — koristi samo `admin.css` i `admin.js`
- Error stranice (`404.html`, `500.html`) su self-contained — minimalne eksterne zavisnosti da bi radile čak i kad asset pipeline ne radi

### Zajednički CSS stack (sve stranice)
```html
bootstrap.min.css → slick.css → slick-theme.css → nouislider.min.css
→ font-awesome.min.css → style.css
```

### Zajednički JS stack (sve stranice)
```html
jquery.min.js → bootstrap.min.js → slick.min.js → nouislider.min.js
→ jquery.zoom.min.js → main.js → config.js → main-nav.js
→ header-search.js → cart.js → wishlist.js → compare.js
```
