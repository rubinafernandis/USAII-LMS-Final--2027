# USAII Intuitive LMS 5.14.0 (November 2026)

Tested in a sandbox from start to finish (fresh database, production build, a stand-in Stripe gateway).

## Prices (Course Builder, Course details)
* Two prices per course: **Selling price** (shown struck out on the website) and **Current price** (what learners pay).
  The website shows the selling price struck out only when it is higher. Tested: 199/147 and 147/74 both appear on the cards and course pages.
* New databases start at 147 struck / 74 (`SEED_LIST_PRICE`, `SEED_COURSE_PRICE`). Upgrading sets the 147 selling price only where none is set.

## Website card text (Course details, Website listing)
* New fields: Card description, Practical takeaway, Best suited for (from the revised landing page copy). The website shows them live.

## Certificates
* The eight approved templates (public/certificates/<course id>.jpg) are used as issued, with Dr. Milton Mattox's signature, course name and course line in the artwork.
* The LMS adds the learner's name, "Has successfully completed the 10-Day Applied AI Sprint and earned the AI Micro Credential", the date of issue (6th November 2026 style) and the certificate number, in Fira Sans (the template's typeface). No watermark.
* Other courses use public/certificates/generic.jpg with the course name and its "Certificate line" (Course details) added.

## Refunds (24 hour policy, admin approval)
* Learners see **Apply for Refund** in Settings only during the first 24 hours after buying a course (and before its certificate is issued). The server checks this too.
* Applying only sends a request. Admins see it in **Payments, Refund requests** and choose **Approve refund** or **Decline**. Nothing is refunded automatically.
* Approve: the price less 20% (for 74 USD: 59.20 USD) goes back through the gateway that took the payment (Stripe, Razorpay or PayPal), the course closes and the learner is emailed. Decline: the learner keeps access and is emailed.

## Suspension email
* Suspending a learner emails a polite notice to the address they sign in with, referring to the USAII Terms of Use (`TERMS_URL`, `TERMS_EMAIL`) and to support (`SUPPORT_EMAIL`). The admin's note is not included.

## Upgrade
Data format 16 → 17, automatic on first start (a backup is kept). Admin set prices, edited text and issued certificates are not changed.

## Lesson videos (checked, unchanged)
* Days 1, 3, 5, 7 and 9 of every course each have one video slot. Tested: admin uploads a small MP4 and a .vtt transcript into Day 1 in Course Builder; the learner plays the video on Day 1 and opens Transcript to read the lines.
