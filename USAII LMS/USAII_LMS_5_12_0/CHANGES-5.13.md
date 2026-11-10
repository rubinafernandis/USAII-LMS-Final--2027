# USAII Intuitive LMS 5.13.1

- Sign-in page: the "Your selected course" box (course name and price) is gone. Signing in is for
  existing accounts. A learner who came for a course still lands on that course after signing in.
- Sign-up form: the highlighted "One time course fee" row under the course list is gone. The price
  still shows next to each course in the list. On "Complete your payment"
  (after closing the payment window) the price appears once, on the "Pay ... securely" button.
- A sign-up stopped before payment (for example while no payment gateway is on) creates no account.
  The person signs up again; signing in does not work until an account exists.

# USAII Intuitive LMS 5.13.0

## Sign up with course selection and payment

- **New sign-up form** (`#/signup`, also opened by the website's Enroll Now buttons with the course
  already selected). Fields: course (every course open for enrollment, with its price), full name, email,
  mobile number, country, password and confirm password. With more than one gateway on, a "Pay with"
  choice.
- **Create my account** creates the account, signs it in, and goes straight to payment. When the server
  has confirmed the payment with the gateway, the learner portal opens on that course, ready to start
  lesson 1, with no second sign-in. Free courses open straight away. After signing out, learners sign in
  with email and password as usual.
- New learners from this form skip the welcome questions; the dashboard invites them to set a goal.
- **Unfinished payments:** if the learner closes the payment window or cancels, nothing is charged, the
  account stays, and signing in later takes them straight back to that course to pay. Admins see them in
  Learners & Access ("chose ... at sign up, not paid yet").
- The server checks the course and that payment is available before creating the account, so a paid
  sign-up never leaves a half-made account when no gateway is on.
- Mobile number and country are stored with the account and shown (and searchable) in Learners & Access.
  Razorpay checkout is pre-filled with the mobile number.

## Payments

- Returning from Stripe or PayPal is now confirmed **before anything else** in the portal. Before, a new
  learner could land on the welcome questions first, and the course stayed closed until the webhook
  arrived if they closed the tab there.
- Cancelling on the Stripe or PayPal page brings the learner back to the course with "Enroll" ready.
- The "chose at sign up, not paid yet" marker clears on any confirmed payment: on return, via the
  Razorpay window, or via a gateway webhook.
- Payments & Email shows where the money goes: the bank account registered in each gateway's own
  dashboard. The LMS never asks for or stores bank details.

## Forgot password

- "Forgot your password? Contact USAII support." is gone. **Forgot password?** is always on the sign-in
  page: enter the email, receive one email with a **6-digit code and a reset link**, valid for **24
  hours** and usable once; enter the code (or open the link), choose a new password twice, and you are
  signed in. Every other sign-in ends.
- A used or expired link says so before a password is typed, with "Send me a new code".
- Safety: only hashes of the code and link are stored; asking again cancels the earlier code and link;
  five wrong codes cancel the code; at most 3 reset emails per address per hour; the same answer whether
  or not the email has an account.

## Email

- The sender is set only with `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM`.
- New **Send test email** button (Payments & Email, renamed from Payment Settings) shows whether email is
  on, the sender address, which settings are missing, and the real error if sending fails.

## Fixes

- Messages for features that are not set up (email, payment, AI scoring, automatic transcripts) now show
  at once. They used HTTP 503, which the app retried for about 30 seconds as if the server were starting.

## Upgrading

- No database change: new fields are added to accounts as they are used. Existing accounts, courses,
  enrollments and payments are untouched.
- Set `PUBLIC_URL` to the exact LMS address (reset links and the return from payment pages use it).
- After deploying: Payments & Email → Send test email; then try "Forgot password?" once.

## Tested end to end

Real browser tests against the production build, with mock Stripe, Razorpay and PayPal servers that
answer like the real APIs (114 checks): sign up and pay with each gateway, automatic sign-in and course
opening, reload, sign out and sign in; closing the payment window, pay later, paying later from Explore
Courses, cancelling on the gateway page; duplicate email; server-side validation; free course; forgot
password by code and by link (wrong codes, reuse, 24-hour expiry, five wrong codes, unknown email,
sending limit); webhook after a closed tab, forged webhook rejected; a server with no gateway and no
email; admin email card, test email and learner list.

## 5.13.2

- **Videos on a plain http server.** The cookie that opens uploaded videos, images and PDFs is now marked
  Secure only when the visitor's page is really on https. Before, a web server or hosting panel that tells
  the LMS "https" while visitors use http made the browser drop the cookie, so no uploaded video played.
- **Transcript translation on a plain http server.** The browser's own translator works only on https,
  so on an http server nothing translated without an AI key. The server now translates caption lines
  itself with no key needed (keys, when set, are still tried first). `FREE_TRANSLATION=off` turns it off.
- **Copy buttons on http.** Copy transcript, copy link and copy webhook URL now work on http too.
- **YouTube and Vimeo lesson videos** send the site address the players need (no YouTube error 153).
- **Prices.** USD courses may cost up to less than $150 (was $50). New databases start the 8 courses at 74.
  Existing databases: the 8 courses still at the launch price of 49 move to 74 (prices an admin changed stay).
- **Course 6** is named "AI for Project Management" (an untouched old name is renamed on existing databases).

## 5.13.3

- **Course 6 page address.** The website page for "AI for Project Management" is now
  `ai-for-project-management.html` (the old address forwards to it). New databases list it at the new
  address; existing ones still at the old address are updated.

