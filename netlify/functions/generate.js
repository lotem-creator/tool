const fetch = require("node-fetch");
const cheerio = require("cheerio");

const MASTER_PROTOCOL = `
Role: Senior PPC Copywriter expert in Direct Response for Search Ads (RSA). You generate ad assets optimized for High CTR and Quality Score.

Step 1: Analysis & Extraction
- Scan URL context for the strongest offers and promotions. Extract the primary value proposition.
- INDUSTRY NOUN SELECTION: Identify the niche. Choose the best PLURAL noun (e.g., "Programs" for Tax, "Medications" for Pharma, "Apps" for Software). 
- REDUNDANCY RULE: If the Ad Group Name already contains the chosen noun (e.g., "App"), DO NOT repeat it (e.g., use "10 Best App Builders" instead of "10 Best App Builder Apps").
- SPELLING FIX: Automatically fix typos in the Ad Group Name (e.g., "bulid" -> "build").

Step 2: Asset Structure & Character Limits
Headlines (Max 30 chars):
- HL1: "10 Best [Fixed AG Name] [Chosen Noun]" (Must be Plural).
- HL2: "Top 10 [Fixed AG Name] [Chosen Noun]" (Mirror HL1).
- HL3 (Bypass): MUST BE EXACTLY: Updated: {=CUSTOMIZER.Month}
- HL4: The strongest generic promotion found. 
  *SANITY CHECK*: NEVER exceed 95% off. If a higher number is found, use "Best Price Guaranteed".
  *STRICT*: Use full words (e.g., "Months" instead of "Mo.").
- HL5-6: [Fixed AG Name] + core benefit. 
  NEVER end HL5-6 with a hyphen (-) or a hanging word.
- HL7-15: 9 UNIQUE high-conversion marketing hooks. No repetition.

Descriptions (Strictly 80-90 characters):
- Description 1: MUST start with "Find the best". 
  Template: "Find the best [Fixed AG Name]. [Offer found in HL4]. [Short CTA]."
- Description 2: MUST start with "Compare the best". 
  Template: "Compare the best [Fixed AG Name]. [Benefit details]. [Short CTA]."
- Description 3: A punchy list of 3-4 features separated by dots.
- Description 4: A high-urgency, aggressive closing statement.

Step 3: Final Polishing Rules
- NO BRAND NAMES. FULL WORDS ONLY. COMPLETE THOUGHTS ONLY.
- Every description must finish its last sentence completely with a period, exclamation mark, or question mark.
- Ensure NO hanging words or symbols at the end.
- Output MUST be in JSON format.
`;

function smartTrim(text, limit, minLen = 0) {
  text = String(text).trim();

  // הגנה על קוסטומייזרים - מניעת חיתוך של סוגריים מסולסלים
  if (text.includes("{") && text.includes("}")) return text;

  if (text.length > limit) {
    const truncated = text.substring(0, limit);
    const lastSpace = truncated.lastIndexOf(" ");
    text = lastSpace !== -1 ? truncated.substring(0, lastSpace).trim() : truncated;
  }

  const badEnds = [
    " for", " with", " and", " the", " our", " get", " on", " a",
    " your", " free", " of", " in", " to", " is", " or", " by",
    " &", " +", " -", " secure", " start", " find", " compare",
  ];
  const pattern = new RegExp(
    "(" + badEnds.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|") + ")$",
    "i"
  );
  while (pattern.test(text)) {
    text = text.replace(pattern, "").trim();
  }

  if (!/[.!?]$/.test(text)) {
    const lastPunct = Math.max(text.lastIndexOf("."), text.lastIndexOf("!"), text.lastIndexOf("?"));
    if (lastPunct !== -1) {
      text = text.substring(0, lastPunct + 1).trim();
    }
  }

  if (minLen > 0 && text.length < minLen) {
    const pads = [
      " Click here to learn more and see if you qualify for our exclusive offer today!",
      " Visit our official site now to explore all benefits and start your journey today.",
      " Get started today for the best results and take advantage of our limited offer.",
      " Secure your results and start today with our expert team.",
      " Learn more at our site today.",
    ];
    for (const pad of pads) {
      if (text.length + pad.length <= limit) {
        text += pad;
        if (text.length >= minLen) break;
      }
    }
    if (text.length > 0 && !/[.!?]$/.test(text)) text += ".";
  }

  return text;
}

function getCategoryFallbacks(category) {
  const cat = category.toLowerCase();
  if (cat.includes("semaglutide") || cat.includes("weight")) {
    return ["Expert Medical Providers", "Doctor-Approved Treatments", "Fast Online Approval", "No Hidden Fees Ever", "Personalized Treatment Plans", "Cancel Anytime Options", "HSA/FSA Eligible Plans", "Free Shipping Available", "Online Prescriptions Now"];
  }
  if (cat.includes("voip") || cat.includes("phone")) {
    return ["Award-Winning Service", "Unlimited Calling Plans", "AI-Powered Business Tools", "Seamless CRM Integration", "Scalable For Any Size", "Voice, Video & Text", "No Long-Term Contracts", "Crystal Clear HD Voice", "24/7 Enterprise Support"];
  }
  if (cat.includes("casino") || cat.includes("gambling")) {
    return ["Licensed & Regulated", "Fast Payouts Guaranteed", "Exclusive Casino Bonuses", "Secure & Confidential Play", "24/7 Player Support", "Huge Game Selection", "Top Rated Casino Apps", "Mobile Gaming Available", "Join Thousands Of Players"];
  }
  if (cat.includes("tax") || cat.includes("relief") || cat.includes("debt")) {
    return ["IRS Debt Relief Programs", "A+ BBB Rated Services", "Stop Collections Today", "Professional Tax Experts", "Resolve Back Taxes Now", "Reduce Your Tax Debt", "Free Debt Consultation", "Federal Relief Programs", "Expert Tax Assistance"];
  }
  return ["Verified & Secure Results", "100% Satisfaction Guaranteed", "Expert Support 24/7", "Best Rated In Category", "Get Started In Minutes", "Trusted By Thousands Daily", "Professional Expert Help", "Compare Top Rated Options", "Secure & Confidential"];
}

async function scrapeSite(url) {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      timeout: 5000,
    });
    const html = await res.text();
    const $ = cheerio.load(html);
    $("script, style, nav, footer").remove();
    return $.text().replace(/\s+/g, " ").trim().substring(0, 1800);
  } catch {
    return "High quality direct response offer";
  }
}

async function runMasterV1(category, agName, url, apiKey) {
  const context = await scrapeSite(url);
  // הגדרת ה-Bypass הקשיח לקוסטומייזר
  const h3Bypass = "Updated: {=CUSTOMIZER.Month}";

  const prompt = `
    SCAN CONTEXT: ${context}

    INPUTS:
    Category: ${category}
    Ad Group: ${agName}

    STRICT TASK INSTRUCTIONS:
    - FIX TYPOS: Correct "${agName}" if it has a spelling error.
    - NOUN: Identify the niche and pick the best plural noun.
    - REDUNDANCY: Avoid repeating words (e.g., if AG is "App Builder", don't say "App Builder Apps").
    - HL1: "10 Best [Fixed AG] [Noun]".
    - HL2: "Top 10 [Fixed AG] [Noun]" (Mirror HL1).
    - HL3: MUST be EXACTLY "${h3Bypass}".
    - HL4: Strongest offer. MAX 95% OFF. If context says 100% or more, use "Special Offer Today".
    - ALL DESCRIPTIONS: Strictly 80-90 characters. Complete thoughts only.

    JSON Output format: {"headlines": [], "descriptions": []}
  `;

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: MASTER_PROTOCOL },
        { role: "user", content: prompt },
      ],
      temperature: 0.4,
      response_format: { type: "json_object" },
    }),
  });

  const result = await response.json();

  if (result.error) {
    throw new Error(result.error.message);
  }

  const text = result.choices[0].message.content;
  const data = JSON.parse(text);
  
  let h = (data.headlines || []).map((x) => smartTrim(x, 30));
  const d = (data.descriptions || []).map((x) => smartTrim(x, 90, 80));

  // דריסה סופית של HL3 כדי להבטיח קוסטומייזר תקין
  if (h.length >= 3) h[2] = h3Bypass;

  const catHooks = getCategoryFallbacks(category);
  const finalH = [];
  const seen = new Set();

  h.forEach((val, i) => {
    if (i < 6) {
      finalH.push(val);
      seen.add(val.toLowerCase());
    } else {
      if (!seen.has(val.toLowerCase()) && finalH.length < 15) {
        finalH.push(val);
        seen.add(val.toLowerCase());
      }
    }
  });

  // מילוי ל-15 כותרות במידת הצורך תוך שמירה על ייחודיות
  while (finalH.length < 15) {
    const fallback = smartTrim(catHooks[finalH.length % catHooks.length], 30);
    if (!seen.has(fallback.toLowerCase())) {
        finalH.push(fallback);
        seen.add(fallback.toLowerCase());
    } else {
        finalH.push(smartTrim(fallback + " Now", 30));
    }
  }

  return { headlines: finalH.slice(0, 15), descriptions: d.slice(0, 4) };
}

exports.handler = async (event) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  try {
    const body = JSON.parse(event.body);
    const { category, agName, url, password } = body;

    const appPassword = process.env.APP_PASSWORD || "Moonshot123";
    if (password !== appPassword) {
      return { statusCode: 401, headers, body: JSON.stringify({ error: "Invalid password" }) };
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return { statusCode: 500, headers, body: JSON.stringify({ error: "OPENAI_API_KEY not configured" }) };
    }

    const result = await runMasterV1(category, agName, url, apiKey);
    return { statusCode: 200, headers, body: JSON.stringify(result) };
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
