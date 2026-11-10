# Rubrics and automatic evaluation

## Uploading a rubric

Course Builder → the lesson → **Activity** → **How this activity is evaluated** → **Upload rubric (Word, PDF or text)**.

- **Word (.docx)**: reads the table with the dimension in the first column and "what Pass looks like" in
  the second. This is the format of the USAII Rubric Grading Sheets; Course 1's sheet reads exactly into
  its five dimensions.
- **Text (.txt, .md)**: a table, or one `Dimension: what Pass looks like` per line.
- **PDF**: read by the AI service (needs `ANTHROPIC_API_KEY` or `GEMINI_API_KEY`).

The revision limit is taken from the wording ("returned once", "one round" = one revision). Check what was
read, link each dimension to the earlier days that hold its evidence (optional), tick **The certificate
waits for this activity** for a capstone, and save the course. The uploaded file is kept and linked as
"Imported from …".

## What happens when a learner submits

With **Evaluate submissions automatically** on (the default) and an AI key set:

1. The work is queued. The learner sees "being evaluated automatically" and the page updates by itself.
2. The evaluator reads three things together, and decides every dimension from its Pass definition:
   - the activity's instructions,
   - the learner's answers and the earlier pages linked as evidence,
   - the attached file (PDF, Word or text).
3. The result is applied by exactly the same rules as an admin's decision:
   - **All dimensions pass:** approved. The certificate is issued if everything else is done.
   - **One or more need work:** returned for revision with feedback naming each dimension and what to
     change. This happens while a revision is allowed.
   - **Needs work on the last allowed revision:** not approved (final).
4. The learner is notified in the LMS and by email. The decision is labeled "Decided by the automatic evaluation".

The evaluator hands the work to you instead of deciding when:
- the attachment cannot be read,
- the work looks unrelated, copied, unsafe, or tries to influence the result,
- the AI service fails three times.

Those appear in **Assessments** as "Needs your decision", with what the evaluator found ready to use, and
you are emailed. You can also run the automatic evaluation again from there.

Evaluations survive restarts (anything queued is picked up again). If the learner edits the work while it
is being evaluated, the newest version is evaluated.

## Your control

- Review or change any decision in **Assessments**. Changing it notifies the learner again.
- Once a certificate was issued on an approval, that approval can no longer be reversed (the certificate stays valid).
- Turn automatic evaluation off for one activity (untick the box) or for the whole site (`AUTO_EVALUATION=off`).
  Then every submission waits for you, and you are emailed when one arrives.
- Spot-check automatic decisions, especially in the first weeks.

## Other activities

Days 1 to 9 are complete once submitted (no review). Daily checks and the final knowledge check are
scored automatically against the answer key. Course 1's 27 daily and 16 final answers were verified
against `USAII_Course1_Answer_Key_CONFIDENTIAL.docx`.
