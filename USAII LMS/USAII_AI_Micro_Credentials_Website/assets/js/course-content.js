/* ==========================================================================
   Course pages: content from the course landing page documents
   (MicroCred_1_LP_1.docx, MicroCred_2_LP_1.docx, MicroCred_3_LP.docx to MicroCred_8_LP.docx).
   Keyed by the LMS course id. The title, price and sessions come live from
   the LMS; everything else on the page is below. To add a course page, add
   an entry with the same shape; its catalog card then links to it.
   metaDescription is the page's search and social description (about 150 to
   160 characters); it is written into the <head> of <slug>.html.
   ========================================================================== */
/* Text that repeats word for word in the course 3 to 8 documents */
var BADGES = ["Standalone Career Advancement", "Short. Self Paced. No Coding", "USAII® Certificate of Completion"];
var FORMAT = ["10 minute concept", "10 minute worked example", "35 minute guided build", "5 minute knowledge check"];
var INCLUDES = ["10 one hour sessions, fully self paced", "5 worked example videos with transcripts", "43 knowledge check questions", "Rubric review with feedback in 24 to 48 hours", "USAII® Certificate of Completion"];
var STEPS_TITLE = "How to earn your USAII® Certificate of Completion";
var STEPS = ["Complete all ten sessions.", "Score at least 12 of 16 on the final knowledge check.", "Pass a rubric review on five dimensions."];
var REVISE = "You get specific feedback and one round to revise and resubmit.";
var FAQ_LONG = ["How long does it take?", "About 10 hours: ten one hour sessions. Finish in two weeks of business days or set your own pace."];
var FAQ_LIVE = ["Is there a live instructor?", "No. The course is fully self paced. The USAII® Intuitive LMS tracks your progress and points you to your next best step."];
var FAQ_CERT = ["Is this a USAII® certification?", "It’s an applied Certificate of Completion, separate from USAII®’s proctored certifications and an on ramp to them."];
var KICKER = "Course · USAII® AI Micro Credentials";
var ALL_COURSES = { label: null, text: null, link: "View All Courses", href: "courses.html" };

window.MC_COURSE_PAGES = {
  c_ai_fluency: {
    slug: "ai-fluency-for-the-workplace",
    metaDescription: "AI Fluency for the Workplace: a ten hour, self paced USAII® course on when to use AI, how to direct it, and how to check its work on a real task from your job.",
    category: "AI Foundations",
    title: "AI Fluency for the Workplace",
    hero: {
      eyebrow: "USAII® AI Micro Credential",
      line2: "Created for Automated Career Success With a Method in Place.",
      body: "A ten hour, self paced course that teaches you when to use AI, how to direct it, and how to check its work, all on a real task from your job.",
      stats: [
        { value: "10", label: "One hour sessions" },
        { value: "5", label: "Worked example videos" },
        { value: "43", label: "Knowledge check questions" },
        { value: "0", label: "Prerequisites" }
      ],
      badges: ["Standalone Career Advancement", "Short. Self Paced. No Coding", "USAII® Certificate of Completion"]
    },
    overview: {
      eyebrow: "What you’ll learn",
      headline: "Learn to Use AI with Confidence",
      grid: null,
      blocks: [
        { label: "Who can join", text: "Professionals in any role, including operations, administration, customer service, sales, finance, HR, and management. Whether you’re new to AI or self taught, you’ll leave with a structured, defensible way to work." },
        { label: "Learning Outcomes", text: "You will be able to use AI effectively through better prompting, practical workflows, and task prioritization. They will also develop the skills to verify outputs, protect data, exercise human judgment, and apply AI responsibly at work." },
        { label: "What you need", text: "A computer, a web browser, any general purpose AI assistant, and one real, recurring task from your work." }
      ]
    },
    framework: {
      eyebrow: "The USAII® AI Fluency Framework",
      headline: "One Method: Three Connected Stages",
      subhead: "The stages run in a fixed order. You earn the right to rely on AI by checking it first.",
      columns: ["Stage", "What it means", "Days"],
      rows: [
        ["FRAME", "Before you touch AI: decide if it’s an AI task and pick the use case", "1 to 2"],
        ["RUN", "Do the work: prompt it well, then write and plan with it", "3 to 5"],
        ["TRUST", "Earn the right to rely on it: check, safeguard, systematize, and adopt", "6 to 9"]
      ]
    },
    curriculum: {
      eyebrow: "Curriculum",
      headline: "Ten Sessions. One Solid Playbook",
      formatIntro: "Every hour on the course looks like:",
      format: ["10 minute concept", "10 minute worked example", "35 minute guided build", "5 minute knowledge check"],
      workedExample: "Follow Dana, an operations manager at a midsize logistics company, as she applies each step of the worked example."
    },
    earn: {
      eyebrow: "What you earn",
      headline: "Leave with a Ready to Use Personal AI Productivity Playbook",
      body: "Your Personal AI Productivity Playbook holds your use cases, tested prompts, workflows, quality checks, and safeguards. You build the real thing one page a day, then assemble it on Day 10.",
      submit: [
        ["Your playbook", "It shows a cover page and all nine pages"],
        ["Implementation note", "Where, when, and how you’ll use it (150 to 250 words)"],
        ["Evidence of testing", "A before and after output, screenshot, or sample run on a real task"],
        ["Safe use checklist", "The safeguards you applied"]
      ],
      steps: ["Complete all ten sessions.", "Score at least 12 out of 16 on the final knowledge check.", "Pass a rubric review on five dimensions."]
    },
    enroll: {
      includes: [
        "10 one hour sessions, fully self paced",
        "5 worked example videos with transcripts",
        "43 knowledge check questions",
        "Rubric review with feedback in 24 to 48 hours",
        "USAII® Certificate of Completion"
      ]
    },
    faqTitle: "Frequently asked questions",
    faq: [
      ["Do I need a technical background?", "No. The course requires no coding or technical experience."],
      ["How long does it take?", "About 10 hours: ten one hour sessions. Finish in two weeks of business days or set your own pace."],
      ["Is there a live instructor?", "No. The course is fully self paced. The USAII® Intuitive LMS tracks your progress and points you to your next best step."],
      ["Which AI tool do I need?", "Any general purpose AI assistant. The method works with any product."],
      ["Can I use my real work?", "Yes. Use a real, recurring task with names, client data and confidential details removed."],
      ["What if my playbook doesn’t pass review?", "You get specific feedback and one round to revise and resubmit."],
      ["Is this a USAII® certification?", "It’s an applied Certificate of Completion, separate from USAII®’s proctored certifications, and an on ramp to them."],
      ["Can it count for academic credit or CEUs?", "Each partner institution decides under its own policies."]
    ],
    final: {
      kicker: "Course · USAII® AI Micro Credentials",
      headline: "Your first session takes one hour",
      strip: { label: "Next in the catalog", text: "Course: Prompting and Context Design", link: "Explore", courseId: "c_prompt_context" }
    }
  },

  c_prompt_context: {
    slug: "prompting-and-context-design",
    metaDescription: "Prompting and Context Design: a ten hour, self paced USAII® course on giving AI the sources, rules and review it needs for reliable, on policy answers at work.",
    category: "AI Foundations",
    title: "Prompting and Context Design",
    hero: {
      eyebrow: "USAII® AI Micro Credential",
      line2: "Prompt With Purpose. Contextualize To Perform.",
      body: "A ten hour, self paced course that takes you past the prompt, giving AI the sources, rules, and review it needs for reliable, on policy answers on your real work.",
      stats: [
        { value: "10", label: "One hour sessions" },
        { value: "5", label: "Canvas regions" },
        { value: "5", label: "Worked example videos" },
        { value: "0", label: "Coding required" }
      ],
      badges: ["Standalone Career Advancement", "Short. Self Paced. No Coding", "USAII® Certificate of Completion"]
    },
    overview: {
      eyebrow: "What you’ll learn",
      headline: "Get AI answers you can rely on",
      grid: [
        ["Write Complete Prompts", "Set the task, role, constraints, and format, and define what success looks like."],
        ["Test and Reuse Prompts", "Turn prompts that work into patterns, and spot when better wording stops helping."],
        ["Supply the Right Context", "Map the policies, documents, and examples a correct answer depends on."],
        ["Set Guardrails", "Turn every “it must never do that” into a standing rule with a fallback."],
        ["Plan Tools and Memory", "Define what a multistep task needs to carry from one step to the next."],
        ["Keep It Reliable", "Add a named reviewer, a recheck schedule, and a failure path."]
      ],
      blocks: [
        { label: "Who it’s for", text: "Professionals who already use AI and need dependable results on recurring, high stakes tasks: team leads, analysts, customer facing staff, operations and knowledge workers, and anyone bringing AI into a team’s workflow." },
        { label: "Learning Outcomes", text: "You will be able to design, test, and optimize effective prompts and reusable AI patterns for workplace tasks. They will also learn to build context rich AI workflows with relevant knowledge, guardrails, tools, and human oversight to deliver more accurate and reliable results." },
        { label: "What you need", text: "A computer, a web browser, an AI assistant that accepts pasted or uploaded reference material, and one real task whose right answer depends on a policy, document, or set of examples." }
      ]
    },
    framework: {
      eyebrow: "The USAII® Context Design Canvas",
      headline: "Five Regions. One Page",
      subhead: "The canvas is both the method and what you build. Day 4 is the turning point from prompting to context.",
      columns: ["Region", "What it does", "Days"],
      rows: [
        ["SCOPE", "Say what you want, precisely: task, role, and success", "1 to 4"],
        ["SUPPLY", "Give it what it needs to know: sources and examples", "5 to 6"],
        ["SHAPE", "Set the boundaries: constraints, policies, and format", "7"],
        ["STATE", "Manage tools, memory, and workflow", "8"],
        ["SUSTAIN", "Keep it reliable: test, evaluate, and keep a human in the loop", "9"]
      ]
    },
    curriculum: {
      eyebrow: null,
      headline: "Ten Sessions. One Canvas",
      formatIntro: "Your every hour looks like:",
      format: ["10 minute concept", "10 minute worked example", "35 minute guided build", "5 minute knowledge check"],
      workedExample: "Follow Wendy, a customer support team lead at a midsize B2B SaaS company, as she designs on policy AI replies for her team’s inbox."
    },
    earn: {
      eyebrow: "What you earn",
      headline: "Your Canvas and Credential",
      body: "Your AI Context Design Canvas captures, for one real task, the prompt, its sources, its guardrails, its tools and memory, and the review that keeps it reliable. You fill one region at a time, then connect them on Day 10.",
      submit: [
        ["Your canvas", "It shows all five regions, filled in and connected"],
        ["Implementation note", "Where, when, and how you’ll use it, and who approves it (150 to 250 words)"],
        ["Before and after test", "The same task run with a thin prompt and with the full canvas, judged against your criteria"],
        ["Guardrails and review checklist", "The safeguards you applied"]
      ],
      steps: ["Complete all ten sessions.", "Score at least 12 of 16 on the final knowledge check.", "Pass a rubric review on five dimensions."]
    },
    enroll: {
      includes: [
        "10 one hour sessions, fully self paced",
        "5 worked example videos with transcripts",
        "43 knowledge check questions",
        "Rubric review with feedback in 24 to 48 hours",
        "USAII® Certificate of Completion"
      ],
      link: { label: "New to AI? Start here", action: "course", courseId: "c_ai_fluency" }
    },
    faqTitle: "Frequently asked questions",
    faq: [
      ["Do I need to take AI Fluency for the Workplace first?", "There’s no formal prerequisite. AI Fluency for the Workplace or everyday experience with an AI assistant is recommended."],
      ["Do I need to code?", "No. The course requires no programming background."],
      ["How long does it take?", "About 10 hours: ten one hour sessions. Finish in two weeks of business days or set your own pace."],
      ["Is there a live instructor?", "No. The course is fully self paced. The USAII® Intuitive LMS tracks your progress and points you to your next best step."],
      ["Which AI tool do I need?", "Any AI assistant that accepts pasted or uploaded reference material. The method works with any product."],
      ["Can I use my company’s documents?", "Use sanitized copies or the USAII sample set. Keep the shape of the real work and remove sensitive details."],
      ["What if my canvas doesn’t pass review?", "You get specific feedback and one round to revise and resubmit."],
      ["Is this a USAII® certification?", "It’s an applied Certificate of Completion, separate from USAII®’s proctored certifications, and an on ramp to them."]
    ],
    final: {
      kicker: "Course · USAII® AI Micro Credentials",
      headline: "Make AI answers you can stand behind",
      strip: { label: null, text: null, link: "View All Courses", href: "courses.html" }
    }
  },

  /* ---------- Courses 3 to 8 (MicroCred_3_LP to MicroCred_8_LP) ---------- */

  c_agentic_ai: {
    slug: "agentic-ai-foundations",
    metaDescription: "Agentic AI Foundations: a ten hour, self paced USAII® course where you design, build and test a no code AI agent that handles one real job from your work.",
    category: "Build with AI", program: "build",
    title: "Agentic AI Foundations",
    hero: {
      eyebrow: "USAII® AI Micro Credential",
      line2: "Build a Working AI Agent. No Code with Controlled Action.",
      body: "A ten hour, self paced course where you design, build and road test an agent that handles one real job from your work and stops for a person at the points you choose.",
      stats: [
        { value: "10", label: "One hour sessions" },
        { value: "5", label: "STEER stages" },
        { value: "3", label: "Road test cases" },
        { value: "0", label: "Coding required" }
      ],
      badges: BADGES
    },
    overview: {
      eyebrow: "What you’ll learn",
      headline: "From asking AI to having it do the job",
      grid: [
        ["Spot a Real Agent Job", "Tell an agent from a chatbot by four markers: a goal, tools, several steps and a trigger."],
        ["Pick One Bounded Job", "Choose work with a clear trigger, a clear finish and clear edges."],
        ["Grant Minimum Access", "Give each tool the lowest permission that works: read, draft, write or send."],
        ["Keep a Human in the Loop", "Set approval gates, handoffs and stop rules, each with a named person."],
        ["Build Without Code", "Wire the trigger, tools, task flow and a review point in a no code tool."],
        ["Road Test Before You Rely", "Run normal, failure and stop rule cases, fix what breaks and state the limits."]
      ],
      blocks: [
        { label: "Who it’s for", text: "Operations and admin staff, coordinators, team leads, analysts and anyone exploring how AI agents could take on part of a team’s workload." },
        { label: "What you need", text: "A computer, a web browser, a no code automation or agent building tool (a free trial with test data works) and one recurring, multistep job with a clear trigger and finish." },
        { label: "Learning Outcomes", text: "You will be able to identify and evaluate agent opportunities, define bounded agent jobs, map goals, tasks, tools, memory, permissions, and human approval controls, and complete an Agent Design Canvas. They will also build a working agent using an approved no code tool, configure its workflows and review points, and identify potential risks, failure points, and corresponding safeguards." }
      ]
    },
    framework: {
      eyebrow: "The USAII® Agent Design Canvas",
      headline: "Five Stages: Your STEERing Map",
      subhead: "The STEER method designs the agent on paper first, so it’s safe before anything is built. You steer the agent; it never steers you.",
      columns: ["Stage", "What it does", "Days"],
      rows: [
        ["SELECT", "Pick one job worth delegating", "1 to 2"],
        ["TOOL", "Give it only the tools and access it needs", "3"],
        ["ESCALATE", "Decide where a human steps in", "4"],
        ["ENGINEER", "Complete the canvas, then build", "5 to 7"],
        ["ROAD TEST", "Prove it before you rely on it", "8 to 9"]
      ]
    },
    curriculum: {
      eyebrow: "Curriculum",
      headline: "Ten sessions. One working agent",
      formatIntro: "Every hour of yours looks like:",
      format: FORMAT,
      workedExample: "Follow Marisol, a property operations coordinator at a midsize residential property management company, as she builds an agent that triages incoming maintenance requests."
    },
    earn: {
      eyebrow: "What you earn",
      headline: "A working agent, not a design on paper",
      body: "Your agent runs on its own trigger, uses only the tools you allowed, stops for a person at the points you chose, and holds up against the failure cases you tested.",
      submit: [
        ["Your agent", "Its trigger, connections, flow and review point, with your Agent Design Canvas attached"],
        ["Implementation note", "Where you’ll run it, who approves its actions and who owns it (150 to 250 words)"],
        ["Road test log", "One normal run, one failure case and one stop rule case, plus the agent’s stated limits"],
        ["Agent risk checklist", "Controls for unsafe autonomous actions, each paired with a test"]
      ],
      stepsTitle: STEPS_TITLE,
      steps: STEPS,
      gate: "Robustness is the hard gate for this course. Reviewers look hardest at your human checkpoint, your tested failure case and your risk checklist."
    },
    enroll: { includes: INCLUDES, link: { label: "New to prompting? Start Here", action: "course", courseId: "c_prompt_context" } },
    faqTitle: "Frequently asked questions",
    faq: [
      ["Do I need to code?", "No. You build the agent in a no code tool."],
      ["Which tool do I need?", "A no code automation or agent building tool your organization approves. Without one, use a free or trial workspace with test data only."],
      ["Will my agent touch live systems?", "No. You build and test in a test workspace on sample or sanitized data. Nothing connects to anything that can spend money, change important records or contact people without your review."],
      FAQ_LONG, FAQ_LIVE,
      ["What if my agent doesn’t pass review?", REVISE],
      FAQ_CERT
    ],
    final: { kicker: KICKER, headline: "Hand off the busywork. Keep the control.", body: "Start today and choose the one job your agent will own.", strip: ALL_COURSES }
  },

  c_rag_assistants: {
    slug: "rag-and-enterprise-knowledge-assistants",
    metaDescription: "Build an AI assistant that answers from your organization’s trusted documents, shows its source, and declines what they don’t cover. A ten hour USAII® course.",
    category: "Build with AI", program: "build",
    title: "RAG and Enterprise Knowledge Assistants",
    hero: {
      eyebrow: "USAII® AI Micro Credential",
      line2: "An AI assistant that answers from your documents and says so when it can’t.",
      body: "A ten hour, self paced course where you build an assistant that answers from your organization’s trusted documents, shows its source, and declines what those documents don’t cover.",
      stats: [
        { value: "10", label: "One hour sessions" },
        { value: "6", label: "GROUND stages" },
        { value: "3", label: "Question types tested" },
        { value: "0", label: "Coding required" }
      ],
      badges: BADGES
    },
    overview: {
      eyebrow: "What you’ll learn",
      headline: "Answers people can check, not guesses that sound right",
      grid: [
        ["Name the Knowledge Gap", "Pin down the questions, the documents that answer them and the cost of a wrong answer."],
        ["Understand RAG Simply", "Look it up, then answer, with the source shown."],
        ["Choose Trusted Sources", "Pick documents that are trusted, current, owned, in scope and safe."],
        ["Organize for Retrieval", "Section and label documents to match how people actually ask."],
        ["Check Every Citation", "Hold each answer to the passage it names, sentence by sentence."],
        ["Decline, Don’t Invent", "Test until the assistant flags what its sources can’t support."]
      ],
      blocks: [
        { label: "Who it’s for", text: "Quality, safety and compliance staff, HR and policy teams, operations and support leads, trainers and knowledge managers: anyone who fields the same questions again and again." },
        { label: "Learning Outcomes", text: "You will be able to assess knowledge needs, select and organize trusted documents, and evaluate RAG readiness before building a retrieval augmented assistant. They will build and test a working no code assistant with cited answers, evaluate response accuracy, reduce hallucinations, and define its limitations." },
        { label: "What you need", text: "A computer, a web browser, a no code assistant builder with document upload and written instructions, and a set of documents people rely on (sanitized) or the USAII® sample document set." }
      ]
    },
    framework: {
      eyebrow: "The USAII® Knowledge Grounding Framework",
      headline: "Six Stages: Every Answer GROUNDed",
      subhead: "The GROUND method prepares the knowledge first and ends in a go or no go readiness check. Only then do you build and prove the assistant.",
      columns: ["Stage", "What it does", "Days"],
      rows: [
        ["GAP", "Name what AI can’t know", "1 to 2"],
        ["REFERENCES", "Choose the trusted sources", "3"],
        ["ORGANIZE", "Shape knowledge so it can be found", "4 to 5"],
        ["UPLOAD", "Connect the sources and ask", "6"],
        ["NAME", "Hold every answer to its source", "7"],
        ["DEFEND", "Decline what the sources can’t support", "8 to 9"]
      ]
    },
    curriculum: {
      eyebrow: "Curriculum",
      headline: "Ten sessions. One working assistant",
      formatIntro: "Every hour of yours looks like:",
      format: FORMAT,
      workedExample: "Follow Desmond, a quality and safety coordinator at a midsize food manufacturing plant, as he builds an assistant that answers line supervisors’ questions from the plant’s written procedures."
    },
    earn: {
      eyebrow: "What you earn",
      headline: "An assistant you can defend",
      body: "Your assistant answers only from approved documents, cites its source and declines what those documents don’t cover. Reviewers check that it does both: answers and declines.",
      submit: [
        ["Your assistant", "Screenshots or a share link, its document list and instructions, plus your RAG Readiness Checklist"],
        ["Implementation note", "Who uses it, who owns the documents, how often they’re reviewed and who approves it (150 to 250 words)"],
        ["Question test log", "Answerable, tricky and unanswerable questions, a second full run after fixes and the stated limits"],
        ["Evaluation and hallucination check", "Before and after results showing it declines unsupported questions"]
      ],
      stepsTitle: STEPS_TITLE,
      steps: STEPS,
      gate: "Robustness is the hard gate for this course. Reviewers look hardest at whether your assistant declines instead of inventing."
    },
    enroll: {
      includes: [
        "10 one hour sessions, fully self paced",
        "5 worked example videos with transcripts",
        "43 knowledge check questions",
        "USAII® sample document set",
        "Rubric review with feedback in 24 to 48 hours",
        "USAII® Certificate of Completion"
      ],
      link: { label: "New to prompting? Start here", action: "course", courseId: "c_prompt_context" }
    },
    faqTitle: "Frequently asked questions",
    faq: [
      ["What is RAG?", "Retrieval augmented generation. The assistant looks up the relevant passages first, then answers from them with the source shown."],
      ["Do I need to code?", "No. You build the assistant in a no code builder."],
      ["Which tool do I need?", "A no code assistant builder that your organization approves, with document upload and written instructions."],
      ["What if I cannot use my own documents?", "Use the USAII® sample document set. Documents that can’t be sanitized stay out."],
      FAQ_LONG, FAQ_LIVE,
      ["What if my assistant does not pass review?", REVISE],
      FAQ_CERT
    ],
    final: { kicker: KICKER, headline: "Stop answering the same questions twice", body: "Start today and name the questions your assistant will answer.", strip: ALL_COURSES }
  },

  c_data_analysis: {
    slug: "ai-for-data-analysis-excel-and-bi",
    metaDescription: "AI for Data Analysis, Excel, and BI: a ten hour, self paced USAII® course where you use AI to clean, chart and explain your data, then check every number.",
    category: "AI for Your Function", program: "domain",
    title: "AI for Data Analysis, Excel, and BI",
    hero: {
      eyebrow: "USAII® AI Micro Credential",
      line2: "Go from raw data export to a decision you can defend.",
      body: "A ten hour, self paced course where you use AI to clean, chart, and explain your own data, then check every number before it reaches a decision maker.",
      stats: [
        { value: "10", label: "One hour sessions" },
        { value: "6", label: "ASPECT stages" },
        { value: "9", label: "Worksheet pages" },
        { value: "0", label: "Coding or statistics required" }
      ],
      badges: BADGES
    },
    overview: {
      eyebrow: "What you’ll learn",
      headline: "AI speed without AI’s wrong numbers",
      grid: [
        ["Ask Answerable Questions", "Frame specific, comparative questions before any analysis begins."],
        ["Clean and Structure", "Have AI explain inherited formulas, then make every cleanup decision visible."],
        ["Chart the Finding", "Pick the chart that answers the question, with a one line takeaway."],
        ["Separate Signal from Noise", "Test each change against real history before you call it a trend."],
        ["Validate Every Number", "Trace each AI stated figure to source and catch fabricated or miscalculated values."],
        ["Lead with the Decision", "Write an executive summary that leads with the finding, then lock in a repeatable workflow."]
      ],
      blocks: [
        { label: "Who it’s for", text: "Financial and operations analysts, business and sales operations staff, managers who prepare or review reports, and anyone who answers leadership’s questions in Excel or a BI tool." },
        { label: "Learning Outcomes", text: "You will be able to apply AI to data analysis by framing questions, interpreting formulas, cleaning datasets, selecting visualizations, and identifying meaningful trends. They will validate AI generated insights against source data, communicate findings through executive summaries, and document repeatable analysis workflows." },
        { label: "What you need", text: "A computer, a web browser, a general purpose AI assistant, and a real dataset or report export (sanitized) with a question someone needs answered. Excel and a BI tool help but aren’t required." }
      ]
    },
    framework: {
      eyebrow: "The USAII® Data to Decision Framework",
      headline: "Six swift moves from raw data to a decision",
      subhead: "The ASPECT method builds the analysis, then CHECK makes it defensible. No number reaches a decision maker until it passes.",
      columns: ["Stage", "What it does", "Days"],
      rows: [
        ["ASK", "Ask the right question of the data", "1 to 2"],
        ["STRUCTURE", "Understand and shape the data", "3 to 4"],
        ["PICTURE", "Show what the data says", "5"],
        ["EXAMINE", "Separate signal from noise", "6"],
        ["CHECK", "Validate before it goes out (the hard gate)", "7"],
        ["TELL", "Deliver the decision and make it repeatable", "8 to 9"]
      ]
    },
    curriculum: {
      eyebrow: "Curriculum",
      headline: "Ten sessions. One defensible analysis.",
      formatIntro: "Every hour of yours looks like:",
      format: FORMAT,
      workedExample: "Follow Luther, a financial and operations analyst at a midsize company, as he turns raw exports into summaries a director acts on."
    },
    earn: {
      eyebrow: "What you earn",
      headline: "Numbers you can stand behind",
      body: "Your AI Assisted Data Analysis Worksheet holds your data questions, cleanup decisions, validated numbers, executive summary and repeatable workflow, built one page a day on your own data.",
      submit: [
        ["Your worksheet", "Cover page plus all nine pages"],
        ["Implementation note", "Where, when and how you’ll use it (150 to 250 words)"],
        ["Evidence of testing", "A before and after output, screenshot or sample run on real data"],
        ["Data validation checklist", "Proof your figures were traced and checked"]
      ],
      stepsTitle: STEPS_TITLE,
      steps: STEPS,
      gate: "CHECK is the hard gate for this course. Reviewers look closely for figures traced to source and any AI stated number left unverified."
    },
    enroll: { includes: INCLUDES, link: { label: "New to AI? Start Here", action: "course", courseId: "c_ai_fluency" } },
    faqTitle: "Frequently asked questions",
    faq: [
      ["Do I need coding or statistics?", "No. Neither is required."],
      ["Do I need Excel or a BI tool?", "They help but aren’t required. You need a general purpose AI assistant, and the method works with any product."],
      ["Can I use my company’s data?", "Yes, in sanitized form. Remove names, client details and restricted information before anything goes into an AI tool."],
      ["Why check AI’s numbers?", "AI is useful for reasoning and narrative, but it isn’t a calculator to trust, and it can’t see figures it was never given. You’ll check every one."],
      FAQ_LONG, FAQ_LIVE,
      ["What if my worksheet doesn’t pass review?", REVISE],
      FAQ_CERT
    ],
    final: { kicker: KICKER, headline: "Bring a number you can defend to every meeting", body: "Start today and ask the first real question of your data.", strip: ALL_COURSES }
  },

  c_project_delivery: {
    slug: "ai-for-project-management",
    metaDescription: "AI for Project Management: a ten hour, self paced USAII® course where you use AI to draft charters, plans, risk logs and updates, with human review built in.",
    category: "AI for Your Function", program: "domain",
    title: "AI for Project Management",
    hero: {
      eyebrow: "USAII® AI Micro Credential",
      line2: "Let AI draft the project paperwork. You keep the judgment.",
      body: "A ten hour, self paced course where you use AI to draft charters, plans, risk logs and updates for a real project, with a human review before anything reaches a stakeholder.",
      stats: [
        { value: "10", label: "One hour sessions" },
        { value: "5", label: "PILOT stages" },
        { value: "9", label: "Toolkit pages" },
        { value: "0", label: "PM certification required" }
      ],
      badges: BADGES
    },
    overview: {
      eyebrow: "What you’ll learn",
      headline: "AI speed without losing control of the project",
      grid: [
        ["Charter with Confidence", "Draft a charter with AI and verify scope and constraints against what the sponsor agreed."],
        ["Break Down the Work", "Build a work breakdown that covers every deliverable in a logical order."],
        ["Keep Only Real Risks", "Have AI surface risks and dependencies, then give the genuine ones an owner and a response."],
        ["Review Before You Send", "Tailor stakeholder updates to each audience, with a human check before anything goes out."],
        ["Catch Invented Commitments", "Turn meeting notes into owned action items, with no misattributed promises."],
        ["Make It Repeatable", "Trace issues to root cause, then capture a communication workflow and a project AI playbook."]
      ],
      blocks: [
        { label: "Who it’s for", text: "Project and program managers, team leads, coordinators and PMO staff, product and operations managers running cross functional initiatives, and experts who’ve been handed a project to lead." },
        { label: "Learner Outcomes", text: "You will be able to apply AI across the project lifecycle to develop project charters, structure deliverables, identify risks and dependencies, and manage stakeholder communication. They will use AI to summarize meetings, assign action items, analyze root causes, and evaluate project decisions while maintaining human oversight." },
        { label: "What you need", text: "A computer, a web browser, a general purpose AI assistant, and a real project (sanitized) with recent meeting notes or status material. A tool such as Microsoft Project, Jira, Asana or Smartsheet helps but isn’t required." }
      ]
    },
    framework: {
      eyebrow: "The USAII® Project Delivery Framework",
      headline: "Five stages from idea to delivery",
      subhead: "The PILOT method builds a plan that holds up on paper, then puts a human check between AI drafts and real people.",
      columns: ["Stage", "What it does", "Days"],
      rows: [
        ["PLAN", "Frame the project and where AI fits", "1 to 2"],
        ["ITEMIZE", "Break the work into deliverable pieces", "3"],
        ["LIST RISKS", "Surface what could derail delivery", "4"],
        ["ORCHESTRATE", "Keep people aligned, with human review (the quality gate)", "5 to 6"],
        ["TRACK", "Keep the project on course and repeatable", "7 to 9"]
      ]
    },
    curriculum: {
      eyebrow: "Curriculum",
      headline: "Ten sessions. One project toolkit.",
      formatIntro: "Every hour of yours looks like:",
      format: FORMAT,
      workedExample: "Follow Marcus, a project manager at a midsize company, as he leads a cross functional systems rollout and reports to a demanding steering committee."
    },
    earn: {
      eyebrow: "What you earn",
      headline: "A ready to apply toolkit for your next status meeting",
      body: "Your AI Project Management Toolkit holds your charter, work breakdown, risk and dependency log, stakeholder update template, meeting summary workflow and project AI playbook, built one page a day on your own project.",
      submit: [
        ["Your toolkit", "Cover page plus all nine pages"],
        ["Implementation note", "Where, when and how you’ll use it (150 to 250 words)"],
        ["Evidence of testing", "At least one component, such as a stakeholder update or meeting summary, used on a real project"],
        ["AI output review checklist", "Where a human checked AI drafts before they reached stakeholders"]
      ],
      stepsTitle: STEPS_TITLE,
      steps: STEPS,
      gate: "The review step in ORCHESTRATE is the quality gate for this course. Reviewers look closely for human checks on AI drafts and for any task, risk, or date accepted from AI without judgment."
    },
    enroll: { includes: INCLUDES },
    faqTitle: "Frequently asked questions",
    faq: [
      ["Do I need a PM certification?", "No. You don’t need a certification or software expertise."],
      ["Do I need project software?", "Tools like Microsoft Project, Jira, Asana or Smartsheet help but aren’t required. You need a general purpose AI assistant, and the method works with any product."],
      ["Can I use a real project?", "Yes, in sanitized form. Remove client names, commercial terms, budgets, personnel matters and restricted information first."],
      ["Why review every AI draft?", "AI can’t see a project’s politics, history or commitments. It invents tasks, risks and dates that sound right, and it can pin a commitment on the wrong person."],
      FAQ_LONG, FAQ_LIVE,
      ["What if my toolkit doesn’t pass review?", REVISE],
      FAQ_CERT
    ],
    final: { kicker: KICKER, headline: "Run the project. Let AI handle the paperwork.", body: "Start today and draft your first charter on a real project.", strip: ALL_COURSES }
  },

  c_hr_workforce: {
    slug: "ai-for-hr-recruiting-and-workforce-planning",
    metaDescription: "AI for HR, Recruiting, and Workforce Planning: a ten hour USAII® course on job descriptions, interviews and onboarding, with bias, privacy and fairness checks.",
    category: "AI for Your Function", program: "domain",
    title: "AI for HR, Recruiting, and Workforce Planning",
    hero: {
      eyebrow: "USAII® AI Micro Credential",
      line2: "Faster HR work. Every decision about people stays human.",
      body: "A ten hour, self paced course where you use AI for job descriptions, interview guides, onboarding and workforce scenarios, and pass every workflow through bias, privacy and fairness checks.",
      stats: [
        { value: "10", label: "One hour sessions" },
        { value: "6", label: "TALENT stages" },
        { value: "9", label: "Playbook pages" },
        { value: "0", label: "Personal data in AI tools" }
      ],
      badges: BADGES
    },
    overview: {
      eyebrow: "What you’ll learn",
      headline: "Capture the speed. Keep HR fair, private and human.",
      grid: [
        ["Map Where AI Belongs", "Sort HR tasks into where AI helps, where a human must lead and where AI doesn’t belong."],
        ["Hire Fairly", "Draft inclusive job descriptions and remove biased or exclusionary language."],
        ["Interview Consistently", "Build structured interview guides and candidate messages that are job related and fair."],
        ["Onboard Faster", "Use AI for onboarding plans, checklists and training support."],
        ["Listen Privately", "Find themes in employee feedback without identifying individuals."],
        ["Plan with Visible Assumptions", "Explore headcount, skills and capacity scenarios with every assumption stated and checked."]
      ],
      blocks: [
        { label: "Who it’s for", text: "HR generalists and business partners, recruiters and talent acquisition specialists, learning and onboarding coordinators, people analytics and workforce planning staff, and managers who hire and onboard their own teams." },
        { label: "Learning Outcomes", text: "You will be able to apply AI across HR functions, including recruitment, interviewing, onboarding, employee feedback, and workforce planning. They will evaluate bias, privacy, and fairness risks and develop a responsible HR AI playbook with clear human oversight." },
        { label: "What you need", text: "A computer, a web browser, an AI assistant your organization approves, and a real HR task (an open role, an onboarding cohort, survey results, or a planning question) using sanitized or synthetic data. No HRIS or applicant tracking system needed." }
      ]
    },
    framework: {
      eyebrow: "The USAII® Responsible HR AI Framework",
      headline: "Six stages across the employee lifecycle",
      subhead: "The TALENT method builds HR workflows where AI adds speed. Then TEST clears each one before it touches a candidate or employee.",
      columns: ["Stage", "What it does", "Days"],
      rows: [
        ["TARGET", "Choose where AI belongs in HR", "1"],
        ["ATTRACT", "Reach and assess candidates fairly", "2 to 3"],
        ["LAUNCH", "Bring new hires up to speed", "4"],
        ["ENGAGE", "Understand how people are doing", "5"],
        ["NAVIGATE", "Plan the workforce ahead", "6"],
        ["TEST", "Clear every workflow before it touches people (the hard gate)", "7 to 9"]
      ],
      callout: "AI drafts and analyzes. People decide about people. This course never uses AI to screen, score, rank or select candidates or employees."
    },
    curriculum: {
      eyebrow: null,
      headline: "Ten sessions. One responsible HR playbook.",
      formatIntro: "Every hour of yours looks like:",
      format: FORMAT,
      workedExample: "Follow Elena, an HR generalist at a growing regional company of about 400 employees, as she handles recruiting, onboarding and workforce reporting with a small team."
    },
    earn: {
      eyebrow: "What you earn",
      headline: "A playbook that’s fast, fair and defensible",
      body: "Your AI HR Use Case Playbook holds your HR use case map, hiring materials, onboarding workflow, engagement and workforce planning work, HR risk checklist and responsible workflow map, built one page a day on your own HR work.",
      submit: [
        ["Your playbook", "Cover page plus all nine pages"],
        ["Implementation note", "Where, when and how you’ll use it (150 to 250 words)"],
        ["Evidence of testing", "At least one workflow tried on sanitized material, such as a job description before and after bias review"],
        ["HR risk checklist", "Applied to every candidate and employee facing workflow, with mandatory human review marked"]
      ],
      stepsTitle: STEPS_TITLE,
      steps: STEPS,
      gate: "Robustness is the hard gate for this course. Reviewers look hardest at the risk checklist on every candidate facing workflow, human review before any decision about a person, and any personal data that should never have reached an AI tool."
    },
    enroll: { includes: INCLUDES },
    faqTitle: "Frequently asked questions",
    faq: [
      ["Will AI make hiring decisions?", "No. The course never uses AI to screen, score, rank or select candidates or employees. AI drafts and analyzes; people decide."],
      ["Do I use real employee data?", "No. You never put candidate or employee records, résumés, performance, pay or health data into an AI tool. You work from sanitized or synthetic material, and feedback analysis uses anonymized data with small groups suppressed."],
      ["Do I need an HRIS or applicant tracking system?", "No. You need only an AI assistant your organization approves. The course never connects AI to live candidate or employee records."],
      ["Does it cover employment law?", "It explains the legal context in plain language, including antidiscrimination law and the EU AI Act’s high risk treatment of many employment uses. Your own legal and HR policy owners set the specifics."],
      ["Do I need a technical background?", "No. No technical or data background is required."],
      FAQ_LONG, FAQ_LIVE,
      ["What if my playbook doesn’t pass review?", REVISE],
      FAQ_CERT
    ],
    final: { kicker: KICKER, headline: "Hire faster. Stay fair.", body: "Start today and map where AI belongs in your HR work.", strip: ALL_COURSES }
  },

  c_marketing_content: {
    slug: "ai-for-marketing-and-content-creation",
    metaDescription: "AI for Marketing and Content Creation: a ten hour USAII® course where you build a real campaign across social, email, landing pages and ads, on brand and true.",
    category: "AI for Your Function", program: "domain",
    title: "AI for Marketing and Content Creation",
    hero: {
      eyebrow: "USAII® AI Micro Credential",
      line2: "Campaign content at AI speed. On brand and true.",
      body: "A ten hour, self paced course where you use AI to build a real campaign across social, email, landing pages and ads, and check every piece for brand voice and accuracy before it ships.",
      stats: [
        { value: "10", label: "One hour sessions" },
        { value: "5", label: "REACH stages" },
        { value: "4", label: "Channels covered" },
        { value: "0", label: "Design or copywriting background required" }
      ],
      badges: BADGES
    },
    overview: {
      eyebrow: "What you’ll learn",
      headline: "More output without the risk of publishing it wrong",
      grid: [
        ["Find Where AI Helps", "Map where AI helps in marketing and where human creative and brand judgment must lead."],
        ["Build a Real Persona", "Ground your audience persona in real customer insight, not invented detail."],
        ["Sharpen the Message", "Draft a core message with clear value, proof points and a call to action."],
        ["Adapt to Every Channel", "Turn one message into social posts, emails, landing pages and ad copy, with a repurposing map."],
        ["Calibrate Before You Ship", "Catch off brand, generic or inaccurate output with a brand voice and quality checklist."],
        ["Review and Repeat", "Measure performance against the goal and lock in a reusable campaign workflow."]
      ],
      blocks: [
        { label: "Who it’s for", text: "Marketing managers and coordinators, content and social media specialists, demand generation and email marketers, communications staff, small business owners who run their own marketing, and agency team members." },
        { label: "Learner Outcomes", text: "You will be able to use AI to develop audience personas, campaign messaging, and marketing content across social media, email, landing pages, and ads. They will ensure brand consistency, repurpose content, evaluate campaign performance, and build repeatable marketing workflows with human oversight." },
        { label: "What you need", text: "A computer, a web browser, a general purpose AI assistant, and a real campaign, launch or content need (sanitized), plus brand guidelines if you have them. Email, social or analytics tools help but aren’t required." }
      ]
    },
    framework: {
      eyebrow: "The USAII® Campaign to Channel Framework",
      headline: "Five stages from insight to a campaign that performs",
      subhead: "The REACH method builds the campaign, then CALIBRATE makes it safe to publish. No piece ships until it passes.",
      columns: ["Stage", "What it does", "Days"],
      rows: [
        ["RESEARCH", "Know who the campaign is for", "1 to 2"],
        ["EXPRESS", "Find the core message", "3"],
        ["ADAPT", "Fit the message to each channel", "4 to 6"],
        ["CALIBRATE", "Hold every piece to brand and fact (the quality gate)", "7"],
        ["HONE", "Learn and repeat", "8 to 9"]
      ]
    },
    curriculum: {
      eyebrow: "Curriculum",
      headline: "Ten sessions. One reusable campaign template.",
      formatIntro: "Every hour of yours looks like:",
      format: FORMAT,
      workedExample: "Follow Priya, a marketing manager at a B2B software company, as she runs campaigns across email, social and paid channels with a two person team."
    },
    earn: {
      eyebrow: "What you earn",
      headline: "A campaign engine you can reuse",
      body: "Your AI Campaign Builder Template holds your audience persona, campaign message, multichannel content set, repurposing map, brand voice checklist, performance review and campaign workflow, built one page a day on your own campaign.",
      submit: [
        ["Your template", "Cover page plus all nine pages"],
        ["Implementation note", "Where, when and how you’ll use it (150 to 250 words)"],
        ["Evidence of testing", "An AI draft beside the on brand, fact checked version, for at least one channel"],
        ["Brand voice and quality checklist", "Proof that claims, figures and product details were verified before publication"]
      ],
      stepsTitle: STEPS_TITLE,
      steps: STEPS,
      gate: "CALIBRATE is the quality gate for this course. Reviewers look closely for every piece checked against your brand voice checklist, and for claims, statistics and product details verified rather than accepted from AI."
    },
    enroll: { includes: INCLUDES },
    faqTitle: "Frequently asked questions",
    faq: [
      ["Do I need design or copywriting skills?", "No. No design, copywriting or analytics background is required."],
      ["Do I need AI image tools?", "No. They’re optional and not required for the credential."],
      ["Can I use customer data?", "No. Never paste customer lists, CRM exports or individual customer details into an AI tool. Personas come from aggregated insight, and unreleased product details and pricing come out first."],
      ["Can AI write testimonials or reviews?", "Never publish AI generated testimonials or reviews as real. You’ll verify every claim against a source and follow your organization’s rules on AI disclosure and regulated claims."],
      FAQ_LONG, FAQ_LIVE,
      ["What if my template doesn’t pass review?", REVISE],
      FAQ_CERT
    ],
    final: { kicker: KICKER, headline: "Publish more. Publish only what’s true.", body: "Start today and build your persona from real customer insight.", strip: ALL_COURSES }
  }
};

/* Shared by every course page (from both documents) */
window.MC_COURSE_SHARED = {
  announcement: "Course · USAII® AI Micro Credentials · Self paced online learning, anytime, anywhere",
  tabs: [["overview", "Overview"], ["curriculum", "Curriculum"], ["credential", "Credential"], ["faq", "FAQ"]],
  dimensions: ["Completeness", "Correctness", "Robustness", "Applicability", "Deployability"],
  supporting: "Results arrive in 24 to 48 hours. If your work needs changes, you get specific feedback and one round to revise.",
  finePrint: "The Certificate of Completion is an applied credential, distinct from USAII®’s proctored certifications. Each micro credential serves as more than a standalone learning experience, offering a structured pathway to advance your AI knowledge and pursue USAII®’s flagship, globally recognized, proctored AI certifications.",
  features: ["Globally Recognized AI Credentials", "Industry Aligned Curriculum", "Career Focused Learning", "Flexible Self Paced Learning", "Proctored Certification Assessments", "Lifetime Valid Credentials"],
  priceLine: ["One time tuition", "All inclusive"],
  footer: {
    address: "539 W. Commerce St #4201, Dallas, TX 75208",
    email: "support@usaii.org",
    links: [["All Micro Credentials", "courses.html"], ["USAII® Programs", "programsUrl"], ["Specialization Programs", "specializationUrl"]]
  }
};
