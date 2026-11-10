/* ==========================================================================
   USAII® AI Micro Credentials website: connection settings
   ==========================================================================
   lmsUrl is the address of the USAII Intuitive LMS. Set it to the LMS address before you publish the website.
   Everything live on this website comes from there:
     Login              ->  <lmsUrl>/#/login
     Enroll / Sign up   ->  <lmsUrl>/#/login?course=<course id>  (LMS front page: Learner and Admin sign in)
     Course prices      ->  <lmsUrl>/api/public/catalog   (published courses only)
     Get More Details   ->  <lmsUrl>/api/public/enquiries (shown in the admin portal)

   Local:       "http://localhost:4600"  (START.bat or ./start.sh in the LMS folder)
   Production:  your LMS address, for example "https://learn.usaii.org"
   Leave it as "" only when this website is served from the LMS's own address.
   ========================================================================== */
window.MC_CONFIG = {
  lmsUrl: "http://localhost:4600",

  /* External USAII links. Every link on the pages with data-href="<name>" takes its address from here. */
  partnersUrl: "https://www.usaii.org/usaii-partnership",                       /* top bar: Partners */
  certificationsUrl: "https://www.usaii.org/artificial-intelligence-certifications", /* top bar: USAII Certifications, and the certification links */
  aboutUrl: "https://usaii.org/about-united-states-artificial-intelligence-institute", /* menu: About USAII */
  partnerUrl: "https://www.usaii.org",
  privacyUrl: "https://www.usaii.org/privacy-policy",                             /* footer: Privacy Policy */
  termsUrl: "https://www.usaii.org/terms-of-use",                                 /* footer: Terms of Use */
  contactUrl: "https://www.usaii.org",
  programsUrl: "https://www.usaii.org",
  specializationUrl: "https://www.usaii.org",

  /* "The Vision Behind the USAII® aLMS" video (home page, after "Why USAII® Micro Credentials").
     Use ONE of these. Leave both empty and the section keeps an empty video space.
       src:      a video file, for example "assets/video/vision.mp4" (poster: an optional still image)
       embedUrl: a YouTube or Vimeo embed address, for example "https://www.youtube.com/embed/VIDEO_ID" */
  visionVideo: {
    src: "",
    poster: "",
    embedUrl: "",
    captions: ""   /* optional .vtt captions file for src, for example "assets/video/vision.en.vtt" */
  },

  /* Brochures (PDF): one file per course in assets/brochures, named after the course page address, for
     example assets/brochures/ai-fluency-for-the-workplace.pdf (the list is in assets/brochures/README.md).
     A different file for a course, by LMS course id: brochures: { c_ai_fluency: "assets/brochures/my-file.pdf" }
     brochureForm: true shows the "Download Brochure" form on the home page banner (turn it on once the
     PDFs are in place; a course without its PDF yet gets a "coming soon" note instead of an error). */
  brochureForm: false,
  brochures: {},

  /* House style: live text from the LMS (course titles, card lines, session names) is shown
     without hyphens, for example "7-day" becomes "7 day". Set to false to show it exactly as typed. */
  noHyphens: true,

  /* Course prices (home page cards, Explore Courses, course details window, course pages).
     Both prices are set in the LMS admin portal (Course Builder, Course details):
       Selling price  shown struck out before the current price (only when it is higher)
       Current price  what learners pay
     The values below are used ONLY when the LMS cannot be reached (or is an older LMS without a selling price).
       listPrice  the struck out selling price. null hides it.
       price      the current price. null shows priceUnavailable instead. */
  pricing: { listPrice: 147, price: 74 },

  /* Shown when there is no price to show (LMS not reached and pricing.price is null) */
  priceUnavailable: "Price at enrollment",

  /* Shared specs for every course */
  courseSpecs: { hours: 10, sessions: 10, videos: 5 }
};
