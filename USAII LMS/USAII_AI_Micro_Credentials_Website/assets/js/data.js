/* ==========================================================================
   USAII® AI Micro Credentials website: content
   --------------------------------------------------------------------------
   Course title, price, card line, "You build", program and course number come
   LIVE from the LMS (Course Builder, Course details, Website listing). Only
   published courses are shown.

   The list below is used in two ways:
   1. The card text (summary, Practical takeaway, Best suited for) when the LMS has
      none, and the extra details in the details window, matched by the LMS course id.
   2. A fallback, so the catalog still shows if the LMS cannot be reached.
   ========================================================================== */

window.MC_CATEGORIES = {
  foundations: "AI Foundations",
  build: "Build with AI",
  domain: "AI for Your Domain"
};

window.MC_COURSES = [
  {
    id: "c_ai_fluency", slug: "ai-fluency-for-the-workplace", num: 1, cat: "foundations",
    title: "AI Fluency for the Workplace",
    tagline: "Use AI at work with a method, not guesswork.",
    summary: "Build a Personal AI Productivity Playbook and decide what belongs with AI, write effective prompts, and check every output.",
    build: "A Personal AI Productivity Playbook",
    framework: "AI Fluency Framework",
    doing: "Decide what belongs with AI, write effective prompts, and check every output.",
    suited: "Professionals who are new to AI or self taught.",
    needs: null
  },
  {
    id: "c_prompt_context", slug: "prompting-and-context-design", num: 2, cat: "foundations",
    title: "Prompting and Context Design",
    tagline: "Get reliable, on policy answers to the tasks that matter most.",
    summary: "Build an AI Context Design Canvas, test it with a before and after comparison, and turn effective prompts into reusable patterns with the right sources, guardrails, and human review.",
    build: "An AI Context Design Canvas, proven with a before and after test",
    framework: "Context Design Canvas",
    doing: "Turn effective prompts into reusable patterns with the right sources, guardrails, and human review.",
    suited: "Team leads, analysts, and knowledge workers who already use AI.",
    needs: null
  },
  {
    id: "c_agentic_ai", slug: "agentic-ai-foundations", num: 3, cat: "build",
    title: "Agentic AI Foundations",
    tagline: "Build a working AI agent. No code. You stay in control.",
    summary: "Build and test a no code AI agent for a bounded task, with appropriate permissions, approval gates, and stop rules.",
    build: "A working no code AI agent, road tested on a real task",
    framework: "Agent Design Canvas",
    doing: "Pick one bounded task, give the agent the permissions it needs, set approval gates and stop rules, and test it.",
    suited: "Operations and administrative staff, coordinators, and team leads with repeatable, multistep tasks.",
    needs: "A no code automation or agent building tool; a free trial with test data is sufficient."
  },
  {
    id: "c_rag_assistants", slug: "rag-and-enterprise-knowledge-assistants", num: 4, cat: "build",
    title: "RAG and Enterprise Knowledge Assistants",
    tagline: "An AI assistant that answers from your documents and shows its source.",
    summary: "Build a knowledge assistant that cites its sources, declines unsupported questions, and uses trusted documents to reduce unsupported answers.",
    build: "A working knowledge assistant that cites sources and declines what it cannot support",
    framework: "Knowledge Grounding Framework",
    doing: "Choose trusted documents, organize them, and check every answer against its source.",
    suited: "Compliance, policy, HR, support, and training teams that handle recurring questions.",
    needs: "A no code assistant builder that supports document uploads."
  },
  {
    id: "c_data_analysis", slug: "ai-for-data-analysis-excel-and-bi", num: 5, cat: "domain",
    title: "AI for Data Analysis, Excel, and BI",
    tagline: "Go from raw data export to a decision you can defend.",
    summary: "Ask answerable data questions, clean and chart data with AI, validate every AI stated number, and prepare an executive summary.",
    build: "An AI Assisted Data Analysis Worksheet",
    framework: "Data to Decision Framework",
    doing: "Ask answerable data questions, clean and chart data with AI, and validate every AI stated number.",
    suited: "Financial and operations analysts, sales operations teams, and managers who report in Excel or BI tools.",
    needs: null
  },
  {
    id: "c_project_delivery", slug: "ai-for-project-management", num: 6, cat: "domain",
    title: "AI for Project Management",
    tagline: "Let AI draft the project paperwork. You keep control of the facts.",
    summary: "Use AI to draft project charters, work breakdowns, and risk logs; review stakeholder updates; and build project AI playbooks.",
    build: "An AI Project Management Toolkit",
    framework: "Project Delivery Framework",
    doing: "Draft charters, work breakdowns, and risk logs; review stakeholder updates; and build project AI playbooks.",
    suited: "Project and program managers, coordinators, team leads, and engineering project staff.",
    needs: null
  },
  {
    id: "c_hr_workforce", slug: "ai-for-hr-recruiting-and-workforce-planning", num: 7, cat: "domain",
    title: "AI for HR, Recruiting, and Workforce Planning",
    tagline: "Faster HR work. Every decision about people stays human.",
    summary: "Create inclusive job descriptions and interview guides, support onboarding and workforce planning, and review workflows for bias, privacy, and fairness.",
    build: "An AI HR Use Case Playbook",
    framework: "Responsible HR AI Framework",
    doing: "Create inclusive job descriptions and interview guides, and review workflows for bias, privacy, and fairness.",
    suited: "HR generalists and business partners, recruiters, people operations teams, and hiring managers.",
    needs: null
  },
  {
    id: "c_marketing_content", slug: "ai-for-marketing-and-content-creation", num: 8, cat: "domain",
    title: "AI for Marketing and Content Creation",
    tagline: "A month of campaign content. On brand and true.",
    summary: "Build personas from real customer evidence, adapt messages for social media, email, landing pages, and ads, and fact check claims before publication.",
    build: "An AI Campaign Builder Template",
    framework: "Campaign to Channel Framework",
    doing: "Build personas from real customer evidence, adapt messages for every channel, and fact check claims.",
    suited: "Marketing and content teams, brand and communications staff, and small business owners.",
    needs: null
  }
];


/* Country list for the Get More Details form */
window.MC_COUNTRIES = ["Afghanistan","Albania","Algeria","Andorra","Angola","Antigua and Barbuda","Argentina","Armenia","Australia","Austria","Azerbaijan","Bahamas","Bahrain","Bangladesh","Barbados","Belarus","Belgium","Belize","Benin","Bhutan","Bolivia","Bosnia and Herzegovina","Botswana","Brazil","Brunei","Bulgaria","Burkina Faso","Burundi","Cabo Verde","Cambodia","Cameroon","Canada","Central African Republic","Chad","Chile","China","Colombia","Comoros","Congo","Costa Rica","Côte d’Ivoire","Croatia","Cuba","Cyprus","Czechia","Democratic Republic of the Congo","Denmark","Djibouti","Dominica","Dominican Republic","Ecuador","Egypt","El Salvador","Equatorial Guinea","Eritrea","Estonia","Eswatini","Ethiopia","Fiji","Finland","France","Gabon","Gambia","Georgia","Germany","Ghana","Greece","Grenada","Guatemala","Guinea","Guinea Bissau","Guyana","Haiti","Honduras","Hong Kong","Hungary","Iceland","India","Indonesia","Iran","Iraq","Ireland","Israel","Italy","Jamaica","Japan","Jordan","Kazakhstan","Kenya","Kiribati","Kuwait","Kyrgyzstan","Laos","Latvia","Lebanon","Lesotho","Liberia","Libya","Liechtenstein","Lithuania","Luxembourg","Macao","Madagascar","Malawi","Malaysia","Maldives","Mali","Malta","Marshall Islands","Mauritania","Mauritius","Mexico","Micronesia","Moldova","Monaco","Mongolia","Montenegro","Morocco","Mozambique","Myanmar","Namibia","Nauru","Nepal","Netherlands","New Zealand","Nicaragua","Niger","Nigeria","North Korea","North Macedonia","Norway","Oman","Pakistan","Palau","Palestine","Panama","Papua New Guinea","Paraguay","Peru","Philippines","Poland","Portugal","Puerto Rico","Qatar","Romania","Russia","Rwanda","Saint Kitts and Nevis","Saint Lucia","Saint Vincent and the Grenadines","Samoa","San Marino","Sao Tome and Principe","Saudi Arabia","Senegal","Serbia","Seychelles","Sierra Leone","Singapore","Slovakia","Slovenia","Solomon Islands","Somalia","South Africa","South Korea","South Sudan","Spain","Sri Lanka","Sudan","Suriname","Sweden","Switzerland","Syria","Taiwan","Tajikistan","Tanzania","Thailand","Timor Leste","Togo","Tonga","Trinidad and Tobago","Tunisia","Turkey","Turkmenistan","Tuvalu","Uganda","Ukraine","United Arab Emirates","United Kingdom","United States","Uruguay","Uzbekistan","Vanuatu","Vatican City","Venezuela","Vietnam","Yemen","Zambia","Zimbabwe","Other"];
