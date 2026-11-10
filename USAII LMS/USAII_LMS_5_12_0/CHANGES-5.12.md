# USAII Intuitive LMS 5.12.0: connected to the AI Micro Credentials website

## What is new
- **Live course catalog for the website.** `GET /api/public/catalog` lists every PUBLISHED course with its
  title, price, program and card text; `GET /api/public/catalog/<id or page address>` adds its sessions.
  Prices and details the admin changes show on the website on the next page load. Unpublished courses
  disappear from the website, and their course page offers "Get More Details" instead of enrollment.
- **Website listing in Course Builder.** Course details, "Website listing": program (AI Foundations, Build
  with AI, AI for Your Domain), course number, course page address, card line, "You build", tool needed.
- **Get More Details enquiries.** `POST /api/public/enquiries` (name, email, mobile, organization,
  designation, country). New admin page **Website Enquiries**: search, New and Contacted, mark contacted,
  delete, Download CSV. Admins get a bell notification; with email set up, ENQUIRY_EMAIL (or
  SUPPORT_EMAIL) gets each one. Limited to 5 per connection per hour, with a hidden spam trap.
- **Apply Now, straight into the right course.** The website opens `#/signup?course=<id>` (new learners)
  or `#/login`. The sign up form shows the chosen course and its price. After the account is created and
  onboarding is done, the learner lands on Explore Courses with that course highlighted and a one click
  "Enroll". Already signed in learners go straight there.
- **One course at a time.** A learner can buy several courses but works on one at a time: the earliest
  course they enrolled in that has no certificate yet. Every later course shows "opens next" and the
  server refuses its lessons, knowledge checks, activities and final test until the current course's
  certificate is issued. The next course then opens by itself and the learner gets a notification (and an
  email when email is set up). Courses the learner cannot open (unpaid, unpublished) never hold others back.
- **Sign in page** links back to the website when SITE_URL is set, and reads "USAII® Micro Credentials".
- **Website access from another address.** The /api/public routes answer cross-site requests; SITE_ORIGINS
  limits which sites may call them.

## Data
- Data format 13 to 14 runs by itself: the eight USAII courses get their website listing (only where none
  is set) and enquiries are kept. Titles, prices and publish status are never changed by the upgrade.
- New databases start with the eight courses PUBLISHED at SEED_COURSE_PRICE (default 49).
  Set SEED_COURSE_PRICE=none to start them as unpriced drafts instead.
- Course 6 is titled "AI Assisted Project Delivery" in new databases. Existing databases keep their
  title; rename it in Course details if you want the change there too.

## New settings (.env.example)
SITE_URL, SITE_ORIGINS, ENQUIRY_EMAIL, SEED_COURSE_PRICE
