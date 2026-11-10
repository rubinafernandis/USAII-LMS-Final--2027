# USAII Intuitive LMS 5.12.0

A self-paced course platform for the USAII® AI Micro-Credentials. Learners buy a course, work through
ten days (Learn, Check, Apply, Reflect), submit a capstone that is evaluated against its rubric, pass the
final knowledge check, and receive a USAII Certificate of Completion they can download and anyone can verify.
There is no messaging between learners and admins: learners reach your support email for account,
payment and attempt questions.


## The AI Micro Credentials website (5.12)

The public website (folder `USAII_AI_Micro_Credentials_Website`) reads its courses from this LMS and
sends people here to sign in and enroll. Set the LMS address once in the website's
`assets/js/config.js` (`lmsUrl`), and set `SITE_URL` here so the sign in page links back.

| On the website | Goes to / comes from the LMS |
| --- | --- |
| Sign In | `#/login` |
| Apply Now, Enroll Now, Start This Path | `#/signup?course=<course id>`: the sign-up form with that course selected, then payment, then the course opens (see Sign up and payment below) |
| Course cards, prices, course pages | `GET /api/public/catalog` (published courses only) |
| Get More Details form | `POST /api/public/enquiries`, shown in **Website Enquiries** |

To put a course on the website: Course details, set the price, check **Website listing**, then Publish.
See CHANGES-5.13.md for everything new in this version (and CHANGES-5.12.md for the one before).

## Sign up and payment

1. **Sign-up form** (`#/signup`): the learner chooses a course from the list (each with its price),
   enters full name, email, mobile number, country, and a password twice, and clicks **Create my account**.
2. The account is created and signed in. A paid course goes straight to the payment gateway
   (Razorpay opens over the page; Stripe and PayPal open their own secure page and come back).
3. When the server has confirmed the payment with the gateway, the learner portal opens on that course,
   ready to start lesson 1. No second sign-in. A free course opens straight after step 1.
4. After **Sign out**, the learner signs in on the sign-in page with email and password.

If the learner closes the payment window or cancels, nothing is charged and the account stays. Signing in
later takes them straight back to that course to pay. Admins see these learners in **Learners & Access**
("chose ... at sign up, not paid yet"), with their mobile number and country.
New accounts are checked first: if no payment gateway is on, paid sign-ups are refused (no half-made accounts).

## Forgot password

**Forgot password?** on the sign-in page asks for the account email and sends one email with a **6-digit
code** and a **reset link**. Either one works for **24 hours**, once. The learner types the code (or opens
the link), chooses a new password twice, and is signed in; every other sign-in ends. Asking again
cancels the earlier code and link; five wrong codes cancel the code. The answer never reveals whether an
email has an account, and each email address gets at most 3 reset emails an hour.

Emails are sent from the mailbox set in `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` and `MAIL_FROM`
(see `.env.example`). Check them with **Payments & Email → Send test email**.

## Run it on your computer

1. Install Node.js 20 or newer.
2. Windows: double-click `START.bat`. Mac or Linux: `./start.sh`. (Or `npm install` then `npm run dev`.)
3. The first start creates the owner (admin) account and prints its one-time password; it is also saved
   in `data/initial-credentials.txt`. Sign in, choose your own password, then delete that file.

Local data lives in `data/` and `uploads/`. To deploy, read **DEPLOY.md**.

## How a learner earns the certificate

The USAII grading-sheet rule, enforced on the server:

1. **Every lesson complete.** A lesson completes by itself when its steps are done: Learn (opened),
   Check (taken; daily checks are practice and can be retaken), Apply (activity submitted), and Reflect
   (confidence chosen). There is no separate "mark complete" button to forget.
2. **The final knowledge check passed** at the course's pass mark (Course 1: 12 of 16, 30 minutes, 3 attempts).
   It unlocks when every lesson is complete.
3. **The capstone passes every rubric dimension** (Course 1: the Personal AI Productivity Playbook, five
   dimensions, one revision allowed).

The certificate is issued the moment the last requirement is met, in any order. The learner is notified
in the LMS and by email.

The certificate is named after the course. Learners download it as a PDF (A4 landscape) from
Certifications or the Milestone Vault. The design is a dark blue frame with gold lines and black text,
with no signature. It reads:
- the USAII logo;
- "Certificate of Completion";
- "This is to certify that", then the learner's name;
- "has successfully completed the course", then the course name;
- at the bottom: the date, the certificate number, and a QR code to verify it;
- a small line: "A completion credential for a USAII® self-paced course. Verify at …".

The learner's name and the course name are fixed when the certificate is issued, so later renames never
change an issued certificate. Anyone can check a certificate on its public verification page.

Practice daily checks never block the certificate.

## Rubrics and automatic evaluation

See **ACTIVITY-EVALUATION.md**. In short: in Course Builder, open the Day 10 activity, click
**Upload rubric (Word, PDF or text)**, check the dimensions it read, and save. With `ANTHROPIC_API_KEY` or
`GEMINI_API_KEY` set, every submission is evaluated against those dimensions within minutes and the
learner gets the decision and feedback automatically. Anything the evaluator cannot judge fairly comes to
you in **Assessments**, and you can change any automatic decision.

## Launch checklist

1. Deploy with `DATABASE_URL` (or `DATA_DIR` on a VPS). `/api/health` shows `"status":"ok"`.
2. Set `PUBLIC_URL` (the exact address learners use, for example `https://learn.usaii.org`; payment
   returns and reset links use it), `SUPPORT_EMAIL`, `SMTP_*` and `MAIL_FROM`. In **Payments & Email**,
   click **Send test email**, then use "Forgot password" once to confirm the code arrives.
   Payment keys: enter them in **Payments & Email** (or as environment variables), click **Test
   connection**, and add each gateway's webhook URL shown there. Payouts go to the bank account you
   register in the gateway's own dashboard; the LMS never stores bank details.
3. Set `ANTHROPIC_API_KEY` or `GEMINI_API_KEY`. Course Builder → Day 10 → the rubric box must say
   "On this server". Without a key, you review every capstone yourself (you are emailed for each).
4. Courses 2 to 5: compare their Day 10 rubric with the official USAII grading sheets (upload the sheet to
   replace it). Courses 1, 6, 7 and 8 already use the official five dimensions.
5. Course 1 videos, in Course Builder (each day's "Video worked example" block):
   - Day 1: `Course 1 V1.mp4`
   - Day 3: `Course1 V3.mp4`
   - Day 5: `Course 1 V5.mp4`
   - Day 7: `Course 1 V7.mp4`
   - Day 9: `Course 1 V9.mp4`
6. Set each course's price, connect a payment gateway (Payment Settings), and publish. Publishing lists
   anything unfinished (for example empty video slots) once and asks you to confirm.
7. Test the whole path once with a learner account: buy, complete, submit the capstone, pass the final,
   download the certificate, and open its verification link from a phone.

## Where things are

- `server/`: the API.
  - `db.ts`: storage (PostgreSQL or file).
  - `files.ts`: uploads.
  - `evaluator.ts`: automatic evaluation.
  - `review.ts`: the rules for every review decision.
  - `rubricImport.ts`: reading rubric files.
  - `content/`: the USAII courses.
  - `migrate.ts`: upgrades older data.
- `shared/`: rules used by both the server and the browser (progress, grades, certificate gate, analytics).
- `src/`: the web app.
  - `learner/`: the learner side.
  - `staff/`: the admin side.
  - `lib/certificate.ts`: the certificate PDF.

"Admin" is the course owner's role on screen. In stored data the role keeps its original value
(`instructor`), so existing accounts keep working.
