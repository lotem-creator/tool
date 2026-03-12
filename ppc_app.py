import streamlit as st
import pandas as pd
import requests
from bs4 import BeautifulSoup
from openai import OpenAI
import re
import json
import time
import os
from datetime import datetime
import io

# --- 1. UI Configuration ---
st.set_page_config(page_title="Lotem's Ad Tool V1.0 - Master Executive", layout="wide")

st.markdown("""
    <style>
    .ad-preview { border-left: 6px solid #1a73e8; background: white; padding: 20px; border-radius: 12px; box-shadow: 0 4px 15px rgba(0,0,0,0.05); color: black; }
    .preview-headline { color: #1a0dab; font-size: 18px; font-weight: bold; }
    .preview-description { color: #4d5156; font-size: 14px; margin-top: 5px; }
    .agent-status { font-weight: bold; color: #1a73e8; }
    </style>
    """, unsafe_allow_html=True)

# --- 2. AI Setup & EXHAUSTIVE Protocol Restoration (The Brain) ---
API_KEY = st.secrets["OPENAI_API_KEY"] if "OPENAI_API_KEY" in st.secrets else os.environ.get("OPENAI_API_KEY")
client = OpenAI(api_key=API_KEY)

# שחזור הפרוטוקול המקסימלי - זה המנוע שגורם ל-AI לכתוב כמו סניור. לא לקצר פה לעולם.
MASTER_PROTOCOL = """
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
"""

def setup_agent():
    return client, "gpt-4o-mini"

agent, active_model = setup_agent()

# --- 3. Robust Utilities & Padding Logic ---

def smart_trim(text, limit, min_len=0):
    text = str(text).strip()
    
    # 1. Trimming if over limit
    if len(text) > limit:
        truncated = text[:limit]
        last_space = truncated.rfind(' ')
        text = truncated[:last_space].strip() if last_space != -1 else truncated
    
    # 2. Cleanup of hanging words and symbols
    bad_ends = [" for", " with", " and", " the", " our", " get", " on", " a", " your", " free", " of", " in", " to", " is", " or", " by", " &", " +", " -", " secure", " start", " find", " compare"]
    regex_pattern = r'(' + '|'.join(re.escape(word) for word in bad_ends) + r')$'
    while re.search(regex_pattern, text, re.IGNORECASE):
        text = re.sub(regex_pattern, '', text, flags=re.IGNORECASE).strip()
    
    # 3. Complete Thought Check
    if not text.endswith(('.', '!', '?')):
        last_punct = max(text.rfind('.'), text.rfind('!'), text.rfind('?'))
        if last_punct != -1:
            text = text[:last_punct+1].strip()

    # 4. Multi-Stage Perfectionist Padding (The Length Fix)
    if min_len > 0 and len(text) < min_len:
        long_paddings = [
            " Click here to learn more and see if you qualify for our exclusive offer today!",
            " Visit our official site now to explore all benefits and start your journey today.",
            " Get started today for the best results and take advantage of our limited offer.",
            " Secure your results and start today with our expert team.",
            " Learn more at our site today."
        ]
        for pad in long_paddings:
            if len(text) + len(pad) <= limit:
                text += pad
                if len(text) >= min_len: break
        if len(text) > 0 and not text.endswith(('.', '!', '?')): text += "."
    
    return text

def get_category_fallbacks(category):
    cat = category.lower()
    if "semaglutide" in cat or "weight" in cat:
        return ["Expert Medical Providers", "Doctor-Approved Treatments", "Fast Online Approval", "No Hidden Fees Ever", "Personalized Treatment Plans", "Cancel Anytime Options", "HSA/FSA Eligible Plans", "Free Shipping Available", "Online Prescriptions Now"]
    if "voip" in cat or "phone" in cat:
        return ["Award-Winning Service", "Unlimited Calling Plans", "AI-Powered Business Tools", "Seamless CRM Integration", "Scalable For Any Size", "Voice, Video & Text", "No Long-Term Contracts", "Crystal Clear HD Voice", "24/7 Enterprise Support"]
    if "casino" in cat or "gambling" in cat:
        return ["MI Licensed & Regulated", "Fast Payouts Guaranteed", "Exclusive Casino Bonuses", "Secure & Confidential Play", "24/7 Player Support", "Huge Game Selection", "Top Rated Casino Apps", "Mobile Gaming Available", "Join Thousands Of Players"]
    return ["Verified & Secure Results", "100% Satisfaction Guaranteed", "Expert Support 24/7", "Best Rated In Category", "Get Started In Minutes", "Trusted By Thousands Daily", "Professional Expert Help", "Compare Top Rated Options", "Secure & Confidential"]

def scrape_site(url):
    try:
        res = requests.get(url, headers={'User-Agent': 'Mozilla/5.0'}, timeout=5)
        soup = BeautifulSoup(res.content, 'html.parser')
        for s in soup(["script", "style", "nav", "footer"]): s.decompose()
        return soup.get_text(separator=' ', strip=True)[:1800]
    except: return "High quality direct response offer"

# --- 4. Master Engine ---

def run_master_v1(category, ag_name, url):
    context = scrape_site(url)
    h3_bypass = "Last Updated: {CUSTOMIZER.Month:2026}"
    
    # הפרומפט המקסימלי לשימוש ה-AI - כאן נמצא כל הפירוט
    prompt = f"""
    SCAN CONTEXT: {context}
    
    INPUTS:
    Category: {category}
    Ad Group: {ag_name}
    
    STRICT TASK INSTRUCTIONS:
    - ALL HEADLINES: STRICTLY MAX 30 CHARACTERS.
    - HL1: "10 Best [Topic] [Noun]" (MUST be <30 chars).
    - HL1 Nouns: Use relevant nouns like Sites/Apps/Streams. Avoid generic "Pros".
    - HL1 Examples:
      * Ad Group "watch champions league" -> "10 Best Champions League Sites" (30 chars)
      * Ad Group "watch champions league" -> "10 Best UCL Streaming Sites" (27 chars - Use UCL for short)
      * Ad Group "how to watch espn for free" -> "10 Best ESPN Streaming Apps" (27 chars)
    - RULE: If a topic is too long, use established acronyms (e.g., UCL, NFL, etc.) to fit the 30-char limit.
    - HL2: "Top 10 [Topic] [Noun]" (Mirror HL1 - must be <30 chars).
    - HL3: MUST be "{h3_bypass}" (DO NOT CHANGE).
    - HL4: Strongest Offer (Max 30 chars).
    - HL5-6: Ad Intent + Benefit (Max 30 chars).
    - BRANDING: Acronyms like ESPN, NFL, HD, DVR MUST stay UPPERCASE.
    - Description 1: MUST start with "Find the best". 
    - Description 2: MUST start with "Compare the best".
    - Description 3: MUST be a dot-separated list of 4 features.
    - Description 4: MUST be a high-urgency, aggressive hard-sale closing statement.
    - ALL DESCRIPTIONS: Strictly 80-90 characters. Every sentence must be COMPLETE and end with punctuation.
    
    JSON Output format: {{"headlines": [], "descriptions": []}}
    """
    
    try:
        response = agent.chat.completions.create(
            model=active_model,
            messages=[
                {"role": "system", "content": MASTER_PROTOCOL},
                {"role": "user", "content": prompt}
            ],
            temperature=0.5,
            response_format={"type": "json_object"}
        )
        data = json.loads(response.choices[0].message.content)
        def proper(text):
            protected = [
                # Sports Leagues
                "ESPN", "NFL", "NBA", "MLB", "NHL", "MLS", "UFC", "FIFA", "IPL", "NASCAR", "UCL",
                # Tech & Devices
                "HD", "4K", "UHD", "OLED", "LCD", "LED", "PC", "MAC", "iOS", "TV",
                "SSD", "HDD", "RAM", "CPU", "GPU", "USB", "VPN", "AI", "API", "UI", "UX",
                # Streaming / Media
                "HBO", "VOD", "DVR", "VOIP",
                # Business / Marketing
                "PPC", "SEO", "ROI", "CPC", "CPM", "CTR", "CRM", "ERP", "LLC", "IRS",
                "B2B", "B2C", "SaaS",
                # Medical / Legal
                "CBD", "DNA", "IVF", "ADHD", "FDA", "HIPAA",
                # Geographic
                "USA", "UK", "EU", "UAE", "NYC", "LA", "US",
            ]
            words = str(text).split()
            proper_words = []
            for word in words:
                # Handle hyphens by splitting first
                parts = word.split('-')
                proper_parts = []
                for p in parts:
                    clean_p = p.upper().strip(".,!?&")  # also strip & so HD& is caught
                    if clean_p in protected:
                        proper_parts.append(p.upper())
                    else:
                        proper_parts.append(p.capitalize())
                proper_words.append("-".join(proper_parts))
            return " ".join(proper_words)
        
        h = [proper(smart_trim(x, 30)) for x in data.get('headlines', [])]
        d = [proper(smart_trim(x, 90, 80)) for x in data.get('descriptions', [])]
        
        if len(h) >= 3: h[2] = h3_bypass
        
        cat_hooks = get_category_fallbacks(category)
        final_h = []
        seen = set()
        for i, val in enumerate(h):
            if i < 6: 
                final_h.append(val); seen.add(val.lower())
            else:
                if val.lower() not in seen: 
                    final_h.append(val); seen.add(val.lower())
                else: 
                    fallback = cat_hooks[i % len(cat_hooks)]
                    final_h.append(smart_trim(fallback, 30))
        
        while len(final_h) < 15: 
            final_h.append(smart_trim(cat_hooks[len(final_h) % len(cat_hooks)], 30))
            
        return final_h[:15], d[:4], active_model
    except Exception as e:
        return [], [], f"Error: {e}"

# --- 5. UI & Auth (Moonshot123) ---

st.title("🎯 Lotem's Ad Tool V1.0")

if 'authenticated' not in st.session_state: st.session_state['authenticated'] = False
if not st.session_state['authenticated']:
    # עדכון הסיסמה ל-Moonshot123
    pwd = st.text_input("Master Password:", type="password")
    if st.button("Unlock"):
        if pwd == st.secrets["APP_PASSWORD"]: 
            st.session_state['authenticated'] = True
            st.rerun()
    st.stop()

t1, t2 = st.tabs(["🚀 Ad Generator", "📦 Bulk Processor"])

with t1:
    c1, c2 = st.columns([1, 1.2])
    with c1:
        camp = st.text_input("Campaign Name", "Search_Campaign_2026")
        u_in = st.text_input("Final URL", "https://example.com")
        cat_in = st.text_input("Category", "Semaglutide")
        ag_in = st.text_input("Ad Group", "Semaglutide")
        
        if st.button("🚀 Execute Protocol"):
            with st.spinner("Agent is running exhaustive V1.0 logic..."):
                h, d, mode = run_master_v1(cat_in, ag_in, u_in)
                if h: 
                    st.session_state.res = (h, d, mode, ag_in, camp)
                else:
                    st.error(f"Failed to generate assets. {mode}")

    if 'res' in st.session_state:
        h, d, mode, ag, cp = st.session_state.res
        with c2:
            mo_display = datetime.now().strftime("%B %Y")
            display_h3 = h[2].replace('{CUSTOMIZER.Month:2026}', mo_display)
            st.markdown(f"""
                <div class="ad-preview">
                    <div class="preview-headline">HL1: {h[0]}</div>
                    <div class="preview-headline">HL2: {h[1]}</div>
                    <div class="preview-description"><b>D1:</b> {d[0]}</div>
                    <div class="preview-description"><b>D2:</b> {d[1]}</div>
                    <div style="font-size: 11px; color: gray; margin-top: 10px;">D3: {d[2]}</div>
                    <div style="font-size: 11px; color: gray;">D4: {d[3]}</div>
                </div>
            """, unsafe_allow_html=True)
            
            row = {"Campaign": cp, "Ad Group": ag}
            for i in range(15): row[f"Headline {i+1}"] = h[i]
            for i in range(4): row[f"Description {i+1}"] = d[i]
            st.download_button("📥 Download RSA CSV", pd.DataFrame([row]).to_csv(index=False).encode('utf-8'), f"{ag}_V1.csv")

with t2:
    st.markdown("### 📦 Bulk Agent Processor")
    template_df = pd.DataFrame(columns=["Campaign", "Ad Group", "Category", "URL"])
    template_df.loc[0] = ["Campaign_Name", "Ad_Group", "Category", "https://example.com"]
    st.download_button("📥 Download Template", template_df.to_csv(index=False).encode('utf-8'), "Template_V1.csv")
    
    st.divider()
    
    uploaded_file = st.file_uploader("Upload filled CSV/Excel", type=["csv", "xlsx"])
    if uploaded_file:
        df_in = pd.read_csv(uploaded_file) if uploaded_file.name.endswith('.csv') else pd.read_excel(uploaded_file)
        if st.button("📦 Process All Rows"):
            results = []
            valid_rows = df_in.dropna(subset=['URL'])
            p_bar = st.progress(0)
            for idx, (i, row) in enumerate(valid_rows.iterrows()):
                bh, bd, _ = run_master_v1(row['Category'], row['Ad Group'], row['URL'])
                if bh:
                    res_row = {"Campaign": row.get('Campaign', 'Bulk'), "Ad Group": row['Ad Group']}
                    for n in range(15): res_row[f"Headline {n+1}"] = bh[n]
                    for n in range(4): res_row[f"Description {n+1}"] = bd[n]
                    results.append(res_row)
                p_bar.progress((idx + 1) / len(valid_rows))
                time.sleep(1.5)
            if results:
                st.download_button("📥 Download Final Bulk", pd.DataFrame(results).to_csv(index=False).encode('utf-8'), "Lotem_Bulk_V1.csv")
