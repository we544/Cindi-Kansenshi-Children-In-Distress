# CINDI Kansenshi — Website

A complete 7-page static website for CINDI Kansenshi, a community-based organisation
supporting orphaned and vulnerable children in Ndola, Zambia.

## Folder Structure

```
cindi-kansenshi/
├── index.html          # Homepage
├── about.html          # About Us
├── programs.html       # Our Programs (4 pillars)
├── impact.html         # Impact & Statistics
├── news.html           # News & Updates
├── contact.html        # Contact / Volunteer / Partner
├── donate.html         # Donation Page
├── css/
│   ├── shared.css      # Global design system (nav, footer, buttons)
│   ├── index.css       # Homepage styles
│   ├── about.css       # About page styles
│   ├── programs.css    # Programs page styles
│   ├── impact.css      # Impact page styles
│   ├── news.css        # News page styles
│   ├── contact.css     # Contact page styles
│   └── donate.css      # Donate page styles
├── js/
│   ├── shared.js       # Global JS (nav, counters, scroll reveal)
│   └── index.js        # Homepage parallax
├── images/
│   └── *.svg           # Placeholder images (replace with real photos)
└── README.md
```

## Run With The Python Backend

Python 3.9+ is required. From this directory, install dependencies and start the local server:

```sh
python -m pip install -r requirements.txt
python backend/app.py
```

Open `http://127.0.0.1:5000`. On the first visit to `admin.html`, create the server admin account. The backend stores content and contact submissions in `backend/data/cindi.sqlite3`, uploads in `backend/data/uploads/`, and a persistent session-signing key in `backend/data/session.key`.

Run the backend tests with `python -m unittest backend.test_app`.

The development server binds to localhost and is for local development only.

### Deploy To Render

The root `render.yaml` defines the web service, Gunicorn start command, HTTPS-only cookies, generated session secret, and a persistent disk for SQLite and uploaded media. In Render, create a Blueprint from this GitHub repository and enter a one-time `CINDI_SETUP_TOKEN` when prompted. The service uses a paid compute plan because Render persistent disks require one; review the current price in Render before confirming deployment. After the first admin account is created, remove `CINDI_SETUP_TOKEN` from the service environment. The app permits startup without it once an admin exists.

Never commit runtime data or setup secrets. Back up the database and uploads together.

Opening the HTML files directly still works as a static preview, but admin edits and contact submissions will not be shared or persisted by the Python backend.

## Pages & Features

| Page | Key Features |
|------|-------------|
| Homepage | Parallax hero, animated stat counters, program pillars, story section |
| About | Origin story, Mission/Vision/Values, team grid, testimonials, partners |
| Programs | Sticky tab navigation, 4 detailed program sections with stats |
| Impact | Animated counters, timeline (2014–2026), donut chart, fund allocation bars |
| News | Category filter (Education/Nutrition/Health/Empowerment/Community) |
| Contact | Tabbed form (General / Volunteer / Partner), success state |
| Donate | Amount picker, one-time vs monthly toggle, impact messages, alt payment methods |

## Customisation

- **Colours**: Edit CSS variables in `css/shared.css` (`:root` block)
- **Content**: All text is in the HTML files — find and replace as needed
- **Images**: Drop real photos into `images/` and update `src` attributes
- **Contact**: General, volunteer, and partner submissions are stored in the admin Contact Inbox.
- **Donate**: Donation form/payment processing still needs a payment provider integration before accepting payments.

## Real Payment Integration (Zambia)

- MTN MoMo API: https://momodeveloper.mtn.com
- Airtel Money API: https://developers.airtel.africa
- Paystack (card + mobile money): https://paystack.com

## Credits

Built with vanilla HTML5, CSS3, and JavaScript.
Font Awesome 6.5 (icons) · Google Fonts — Playfair Display & Inter.
