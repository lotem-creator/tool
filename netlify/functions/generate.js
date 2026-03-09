const fetch = require("node-fetch");
const cheerio = require("cheerio");

const MASTER_PROTOCOL = `
Role: Senior PPC Copywriter expert in Direct Response for Search Ads (RSA). You generate ad assets optimized for High CTR and Quality Score.

Step 1: Analysis & Extraction
- Scan URL context for the strongest offers and promotions. Extract the primary value proposition (e.g., "50% Off", "Money Back Guarantee", "Get $30 Free").
- Strip brand names: Use generic category terms only to ensure broad quality score relevance and avoid policy issues with competitors.

Step 2: Asset Structure & Character Limits
Headlines (Max 30 chars):
- HL1: "10 Best [AG Topic] [Noun]" (Must be Plural). Example: "10 Best Semaglutide Providers".
- HL2: "Top 10 [AG Topic] [Noun]" (Mirror HL1).
  *MIRROR RULE*: HL2 must use the exact same noun and topic as HL1, but switch "10 Best" to "Top 10".
  *AUTHORITY RULE*: Match the noun to the category. Use "Sites" for Casino, "Services" for Tax/Legal, "Apps" for VPN, "Providers", "Systems", or "Treatments".
  STRICT: Ensure the noun is PLURAL (e.g., Systems instead of System). AVOID generic words like "Options" or "Programs" for medical niches.
- HL3 (Bypass): MUST BE EXACTLY: Last Updated: {CUSTOMIZER.Month:2026}
- HL4: The strongest generic promotion found.
  *STRICT RULE*: ALWAYS use full words (e.g., "Months" instead of "Mo.", "First" instead of "1st", "Off" instead of "Disc") if the total length remains under 30 characters.
- HL5-6: [AG Name] + core benefit.
  *CRITICAL*: If [AG Name] is long (over 15 chars), shorten it and use a high-impact verb (e.g., "Resolve Debt Now", "Lose Weight Fast").
  NEVER end HL5-6 with a hyphen (-) or a hanging word.
- HL7-15: 9 UNIQUE high-conversion marketing hooks. No repetition. Examples: "Verified Results", "100% Satisfaction", "Start In Minutes", "Expert Advisors".

Descriptions (Strictly 80-90 characters):
- Description 1: MUST start with "Find the best".
  Template: "Find the best [AG Name]. Get [Offer found in HL4]. [Short CTA]." (Total 80-90 chars).
- Description 2: MUST start with "Compare the best".
  Template: "Compare the best [AG Name]. [Offer details]. [Short CTA]." (Total 80-90 chars).
- Description 3 (Contextual Feature List): A punchy list of 3-4 features separated by dots.
  Example: "A+ BBB Rating. 24/7 Expert Support. No Credit Impact. Fast Online Application."
- Description 4 (Hard-Sale Closing): A high-urgency, aggressive closing statement.
  Example: "Stop IRS collections today. Resolve your tax debt now. Call for a free consultation!"

Step 3: Final Polishing Rules
- NO BRAND NAMES. FULL WORDS ONLY. COMPLETE THOUGHTS ONLY.
- Every asset must make sense on its own. Every description must finish its last sentence completely with a period, exclamation mark, or question mark.
- Ensure NO hanging words or symbols at the end (like "for", "the", "on", "of", "to", "with", "&", "+", "Secure", "Start", "Find", "Compare").
- Output MUST be in JSON format.
`;

function smartTrim(text, limit, minLen = 0) {
  text = String(text).trim();

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
    return ["MI Licensed & Regulated", "Fast Payouts Guaranteed", "Exclusive Casino Bonuses", "Secure & Confidential Play", "24/7 Player Support", "Huge Game Selection", "Top Rated Casino Apps", "Mobile Gaming Available", "Join Thousands Of Players"];
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
  const h3Bypass = "Last Updated: {CUSTOMIZER.Month:2026}";

  const prompt = `
    SCAN CONTEXT: ${context}

    INPUTS:
    Category: ${category}
    Ad Group: ${agName}

    STRICT TASK INSTRUCTIONS:
    - HL1: "10 Best ${agName} [Noun]" (MUST be Plural: Providers/Systems/Sites/Treatments).
    - HL2: "Top 10 ${agName} [Noun]" (Mirror HL1 - Use exact same topic and plural noun).
    - HL3: MUST be "${h3Bypass}" (DO NOT TRIM, DO NOT CHANGE).
    - HL4: Extract the strongest offer. ALWAYS USE FULL WORDS (e.g., "Months" instead of "Mo.", "First" instead of "1st").
    - HL5-6: AG Name + Benefit. No hanging words.
    - Description 1: MUST start with "Find the best".
    - Description 2: MUST start with "Compare the best".
    - Description 3: MUST be a dot-separated list of features.
    - Description 4: MUST be a high-urgency, aggressive hard-sale closing statement.
    - ALL DESCRIPTIONS: Strictly 80-90 characters. Every sentence must be COMPLETE and end with punctuation.

    JSON Output format: {"headlines": [], "descriptions": []}
    IMPORTANT: Return ONLY valid JSON, no markdown formatting, no code blocks.
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
      temperature: 0.5,
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

  if (h.length >= 3) h[2] = h3Bypass;

  const catHooks = getCategoryFallbacks(category);
  const finalH = [];
  const seen = new Set();

  h.forEach((val, i) => {
    if (i < 6) {
      finalH.push(val);
      seen.add(val.toLowerCase());
    } else {
      if (!seen.has(val.toLowerCase())) {
        finalH.push(val);
        seen.add(val.toLowerCase());
      } else {
        finalH.push(smartTrim(catHooks[i % catHooks.length], 30));
      }
    }
  });

  while (finalH.length < 15) {
    finalH.push(smartTrim(catHooks[finalH.length % catHooks.length], 30));
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
