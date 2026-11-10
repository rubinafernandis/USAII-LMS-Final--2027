# USAII® AI Micro Credentials website

The public website for the USAII® AI Micro Credentials. Plain HTML, CSS and JavaScript: no build step,
no dependencies, no outside requests except to your USAII Intuitive LMS. It is designed to match the
LMS sign in page ("AI is for Everyone."): same Sora and Figtree fonts, LMS blue `#1F6BFF` and purple
`#8B3DFF`, soft aurora light. There are no hyphens in any visible text.

## Pages

| File | What it is |
| --- | --- |
| `index.html` | Landing page |
| `courses.html` | Explore Courses (the full catalog, learning paths). `?program=foundations`, `build` or `domain` opens one program |
| `<course page address>.html` | One separate page per course (8 files, text from the MicroCred LP documents) |
| `course.html` | Old address only: forwards `course.html?c=<course page address>` to the new page; not indexed |
| `sitemap.xml` | The home page, the catalog and the 8 course pages, for search engines |

Course pages (the 8 files below may be delivered as a separate package; they go in this folder, next to
`index.html`, and use the same `assets` folder):

| File | Course |
| --- | --- |
| `ai-fluency-for-the-workplace.html` | AI Fluency for the Workplace |
| `prompting-and-context-design.html` | Prompting and Context Design |
| `agentic-ai-foundations.html` | Agentic AI Foundations |
| `rag-and-enterprise-knowledge-assistants.html` | RAG and Enterprise Knowledge Assistants |
| `ai-for-data-analysis-excel-and-bi.html` | AI for Data Analysis, Excel, and BI |
| `ai-for-project-management.html` | AI for Project Management |
| `ai-for-hr-recruiting-and-workforce-planning.html` | AI for HR, Recruiting, and Workforce Planning |
| `ai-for-marketing-and-content-creation.html` | AI for Marketing and Content Creation |

Every catalog card ("Explore Course") links to its course page. A new course added later in the LMS shows
a details window from its card until it has a page: add its text (with a `metaDescription`) to
`assets/js/course-content.js`, then run the page build (below) to create its file.

## Course pages and search engines

Each course page is its own file with its own `<title>`, meta description, canonical address, Open
Graph and Twitter tags (link previews on LinkedIn, WhatsApp, Facebook and X) and Course structured data.
The course text is already in the HTML, so search engines and link previews read it without running
JavaScript. In the browser, `assets/js/course-page.js` refreshes the text and adds the live LMS title,
price and sessions, as before.

**Course pages are plain HTML.** Each course has its own file (the table above). Open it and edit the
text directly: what is in the file is what visitors and search engines see. `assets/js/course-page.js`
keeps the page as written and only adds what is live in the LMS: the course title, the price, the session
list and the Enroll Now links. The struck price ($147) and the price shown when the LMS cannot be reached
($74) are in `assets/js/config.js` (`pricing`).

To add a course page, copy one of the course files, rename it to the new page address, change
`data-course` on `<body>` to that address, and edit the text. Add the course to `assets/js/course-content.js`
(id and `slug`) so the catalog links to the new page.

Before going live, find `https://www.example.com` in the course pages and `sitemap.xml` and replace it with
the live address of the website (search engines use it).

`ai-assisted-project-delivery.html` only forwards old links to `ai-for-project-management.html` (the course
was renamed "AI for Project Management").

## Connect it to the LMS (one setting)

Open `assets/js/config.js` and set `lmsUrl` to the LMS address:

- On your computer: `http://localhost:4600` (start the LMS with `START.bat` or `./start.sh`)
- Live: for example `https://learn.usaii.org`

In the LMS, set `SITE_URL` to this website's address so the sign in page links back to it, and
optionally `SITE_ORIGINS` to the website's address so only your site can read the catalog.

| On this website | In the LMS |
| --- | --- |
| Sign In | the sign in page (`#/login`) |
| Apply Now, Enroll Now, Start This Path | sign up with the course chosen (`#/signup?course=<id>`), then onboarding, then that course ready to enroll |
| Course cards, prices, course pages | live from **My Courses**: only PUBLISHED courses appear; price, title and Website listing come from Course details |
| Get More Details form | **Website Enquiries** in the admin portal (and by email when the LMS email is set up) |

Change a price or a detail in the LMS, save, and the website shows it on the next page load.
If the LMS cannot be reached, the catalog still shows and prices read "Price at enrollment".

## Brochures and the Download Brochure form

Put one PDF per course in `assets/brochures`, named after the course page address (the list is in
`assets/brochures/README.md`), for example `assets/brochures/ai-fluency-for-the-workplace.pdf`. To replace a
brochure, upload the new file with the same name; another file name can be set in `assets/js/config.js`
(`brochures`).

The Download Brochure form on the home page banner is off. Set `brochureForm: true` in
`assets/js/config.js` to show it. The visitor's details go to the LMS (Website Enquiries) and the brochure
downloads; a course whose PDF is not uploaded yet gets a "coming soon" note instead of an error.

## The vision video

The "Vision Behind the USAII® aLMS" section (after "Why USAII® Micro Credentials") has a 16:9 space for
Dr. Milton Mattox's video. In `assets/js/config.js`, `visionVideo`:

- a video file: `src: "assets/video/vision.mp4"` (optional `poster` image and `captions` .vtt file), or
- YouTube or Vimeo: `embedUrl: "https://www.youtube.com/embed/VIDEO_ID"`

## Where to change things

| What | Where |
| --- | --- |
| LMS address, outside links, video, "no hyphens" house style | `assets/js/config.js` |
| Course detail text for the details window, learning paths, country list | `assets/js/data.js` |
| Course page text (from the course documents) | `assets/js/course-content.js`, then run the page build |
| A course page's search and social description | `metaDescription` in `assets/js/course-content.js`, then run the page build |
| Prices, titles, card line, "You build", program, course number | the LMS: Course Builder, Course details, Website listing |
| Colors, fonts, layout | `assets/css/styles.css` (tokens at the top) |

## Run it locally

Open `index.html` in a browser, or serve the folder (for example `python -m http.server 8091`) and open
http://localhost:8091. Keep the LMS running so live prices, enrollment and the form work.

## Editing guide

The website is plain HTML, CSS and JavaScript with no build step: open a file, change it, refresh the browser.

| To change | Where |
| --- | --- |
| Home page text and sections | `index.html`. Each section starts with a comment such as `<!-- ==================== How it works ==================== -->` and has an id: `about`, `vision`, `courses`, `paths`, `how-it-works`, `credential`, `organizations`, `certifications`, `faq`. To add a section, copy one, give it a new id, and link to it with `href="#new-id"` on the home page or `href="index.html#new-id"` on other pages. |
| Menu, top bar, footer | The same header and footer markup is in `index.html`, `courses.html`, `404.html`, `505.html` and the course pages; change every copy (search for `Header` or `Footer` comments). A menu item is one `<li class="nav-item">`. |
| Any USAII or partner address | `assets/js/config.js`. A link with `data-href="name"` takes its address from the setting of that name, for example `partnersUrl`, `certificationsUrl`, `aboutUrl`. |
| LMS address | `assets/js/config.js`, `lmsUrl` |
| Course list, titles, prices | The LMS admin portal. Publishing a course shows it on the home page and Explore Courses at once; unpublishing hides it. Program (filter tab) and order: Course details, Website listing. |
| Struck price | `assets/js/config.js`, `pricing.listPrice` (147). `pricing.price` (74) is shown only when the LMS cannot be reached; keep it equal to the LMS price. |
| Course card layout | `assets/js/site.js`, function `cardHTML`; prices: `priceInner` |
| Card text when the LMS is not reached, learning paths | `assets/js/data.js` |
| Course page content | `assets/js/course-content.js` |
| Colors, fonts, spacing | `assets/css/styles.css`: the `:root` variables at the top. Section styles follow the order of the page. |
| Vision video | `assets/js/config.js`, `visionVideo`. Size: `.vision-video` in `styles.css` (at most 860px wide, never taller than the screen). |
| Error pages | `404.html` (page not found) and `505.html` (server error); server setup is in the notes at the top of each file. |

**Inside another site or framework** (for example served at `/microsite/home`): links to a section of the page (`#how-it-works`, `#faq`) always scroll on the same page, even with a `<base>` tag, and stay on the section while the course catalog loads. Keep the `assets` folder next to the pages, or update the paths in the `<head>` of each page.
