# What changed in 5.11, and why

## 5.11.1
- **Certificates named after the course.** Each certificate is named after its course. The separate
  "Certificate name" field is gone; issued certificates keep the course name they were issued under.
- **New certificate design.** Dark blue and gold, black text, no signature. Bottom row: date,
  certificate number and a verification QR code.
- **Download file name.** The PDF is named `<Course>-Certificate-<Learner>.pdf`.

## 5.11

## Data that disappeared after 10 to 30 minutes
- **PostgreSQL storage.** Data and uploaded files can live in PostgreSQL (`DATABASE_URL`). Only changed
  records are written. One server writes at a time, and a redeploy hands over without losing writes.
- **Safe production start.** Production refuses to start without `DATABASE_URL` or `DATA_DIR`, so data is
  never on a throwaway disk again.
- **Sign-in secret kept with the data.** Restarts no longer sign everyone out or make saved payment keys unreadable.
- **No sign-outs during restarts.** The app waits through a server restart instead of signing people out.

## Self-paced platform
- **Messaging removed.** The Ask page, question board, direct messages, instructor guidance, Study Coach
  and Knowledge Cards are gone.
- **Help & Support.** Learners get a Help & Support page with `SUPPORT_EMAIL`.
- **Contact text replaced.** Every "contact your instructor" now points to support.
- **Cohort advice.** Cohort advice no longer suggests contacting learners.
- **"Admin" everywhere.** "Instructor" is "Admin" on screen everywhere, including the sign-in page.

## Progress and certificates
- **Lessons complete themselves.** A lesson completes when Learn, Check, Apply and Reflect are done. Before,
  learners who missed the "Mark lesson complete" button stayed at 0%.
- **Server-truth progress.** Every step returns the saved progress from the server, so the screen cannot drift.
- **The official certificate rule.** The certificate follows the USAII rule: all lessons, the final at the pass
  mark, and the capstone passing every dimension. The earlier extra "overall grade" requirement mixed in
  practice checks and could block learners who met the official rule.
- **Real certificate PDF.** The certificate is a generated PDF (design in 5.11.1 above). The learner's
  name is fixed at issue; IDs read `USAII-2026-XXXXXXXX`.
- **Real artifact names.** Each course's capstone is named after its real artifact (for example the
  Personal AI Productivity Playbook), instead of "Evidence package".

## Evaluation
- **Rubric upload.** Upload a rubric file (Word, PDF or text) to fill in its dimensions.
- **Automatic evaluation.** Submissions are evaluated against the rubric with the same rules as an admin's
  decision. Uncertain cases go to the admin, and admins can change any decision.
- **Capstone rubrics for Courses 2 to 5.** Courses 2 to 5 got capstone rubrics. Before, their certificates were
  issued without any review of the final artifact.
- **Rebuilt capstones.** The Day 10 capstones of Courses 2, 3 and 4 had no fields, no instructions and wrong titles.
- **Templates in sections.** 44 activity templates show each table row as its own section (instead of
  "Depends on" repeated five times).
- **Readable instructions.** Guided-build steps that arrived as one paragraph of ">" marks are numbered lists.
- **Publish check.** Publishing lists unfinished things (empty video slots, capstones no one can evaluate) and
  asks to confirm.

## Notifications
- **Per-person limit.** Notifications are kept per person (newest 100). Before, there was a site-wide cap of
  2,000, so older ones vanished for everyone.
- **Emails.** When SMTP is set, people are emailed for:
  - decisions on work,
  - certificates,
  - new course access,
  - payment receipts and refunds,
  - (admins) work that needs a decision.

## Cleanup
- **Fewer files.** Removed the test suite, review screenshots, the demo-data reset script (it could wipe
  production) and demo accounts whose passwords were published in the code.
- **Upgrades.** Older data upgrades automatically, and a copy of it is kept first.
