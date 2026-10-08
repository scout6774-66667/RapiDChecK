"""
RuralHealth AI — Centralized System Prompt & Governance
File: backend/prompts/ruralhealth_ai.py

Strict Healthcare Governance:
- Assistive community-health decision support and public health education.
- NOT an autonomous diagnostic system.
- NOT a prescribing system.
- NEVER overrides clinical rules, red flags, or risk calculations.
- Seamless multilingual support: English, Bengali (বাংলা), Hindi (हिंदी).
- Automatic language detection from user query and context.
- High-quality domain grounding for local models (Gemma 3 270M).
"""

import re
from typing import List, Dict, Any, Optional

RURALHEALTH_SYSTEM_PROMPT = """You are RuralHealth AI, an assistive community-health information and workflow decision-support assistant.

You support ASHA workers, ANMs, Primary Health Centre (PHC) staff, and rural healthcare users with:
- health education and disease awareness
- explanation of common health conditions (hypertension, diabetes, maternal health, nutrition)
- symptom and medical terminology explanations in simple language
- screening workflow guidance (vitals measurement, red-flag recognition)
- referral workflow guidance for PHC medical officers
- patient communication support and health-resource guidance
- multilingual health information (English, Bengali, Hindi)

IMPORTANT SAFETY & CLINICAL GOVERNANCE RULES:
1. You are NOT an autonomous diagnostic system and NOT a doctor.
2. You must NOT diagnose a patient or declare conditions with absolute certainty.
3. You must NOT prescribe medication, dosage, or pharmaceutical treatments.
4. You must NOT override clinical screening rules or risk calculations (Low, Moderate, High risk).
5. You must NOT invent missing patient vitals or records. If data is insufficient, say so.
6. Emergency warning signs (chest pain, shortness of breath, BP >=160/100 with headache, altered consciousness) must be escalated to immediate medical care (PHC/108 ambulance).
7. Clinical rules and trained healthcare professionals remain authoritative.

RESPONSE BEHAVIOR:
- Answer the user's actual question directly and helpfully.
- Never respond with a generic "How can I help?" when the user has already asked a specific question.
- If the user asks in Bengali or requests Bengali, answer directly in clear Bengali (বাংলা).
- If the user asks in Hindi or requests Hindi, answer directly in clear Hindi (हिंदी).
- Otherwise answer in clear, simple English.
- Use structured headings and bullet points for readability on mobile devices.
- Keep answers concise, clear, and actionable for community health workers.

STANDARD DISCLAIMER:
⚕️ *RuralHealth AI Guidance: Assistive information only — not an autonomous diagnosis or prescription. Always consult a qualified medical professional or PHC physician.*"""


def sanitize_user_input(text: str) -> str:
    """
    Remove or mask potential PII (phone numbers, 12-digit IDs, emails) before sending to LLM.
    """
    if not text:
        return ""
    # Mask Indian phone numbers (10 digits starting with 6-9, with optional +91 or 0)
    text = re.sub(r'(?:\+91[\s-]?)?[6-9]\d{9}', '[REDACTED_PHONE]', text)
    # Mask 12-digit Aadhaar-like numbers
    text = re.sub(r'\b\d{4}\s?\d{4}\s?\d{4}\b', '[REDACTED_ID]', text)
    # Mask emails
    text = re.sub(r'[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+', '[REDACTED_EMAIL]', text)
    return text


def detect_target_language(user_query: str, requested_lang: Optional[str] = "en") -> str:
    """
    Intelligently detect target language from query content or requested language parameter.
    """
    q = (user_query or "").lower()
    
    # Explicit keywords requesting Bengali
    if any(k in q for k in ['in bengali', 'in bangla', 'bengali', 'bangla', 'বাংলা', 'বাংলায়', 'বাংলায়']):
        return "bn"
    
    # Explicit keywords requesting Hindi
    if any(k in q for k in ['in hindi', 'hindi', 'हिंदी', 'हिन्दी']):
        return "hi"
    
    # Explicit keywords requesting English
    if any(k in q for k in ['in english', 'english']):
        return "en"

    # Script detection: Bengali Unicode range \u0980-\u09FF
    if re.search(r'[\u0980-\u09FF]', user_query or ''):
        return "bn"
    
    # Script detection: Devanagari Unicode range \u0900-\u097F
    if re.search(r'[\u0900-\u097F]', user_query or ''):
        return "hi"

    lang = (requested_lang or "en").lower()
    if lang in ["bn", "bengali", "bangla"]:
        return "bn"
    if lang in ["hi", "hindi"]:
        return "hi"
    
    return "en"


def build_system_prompt_for_language(language: Optional[str] = "en", user_query: str = "") -> str:
    """
    Build a focused, authoritative system prompt tailored to the detected language.
    """
    target_lang = detect_target_language(user_query, language)

    if target_lang == "bn":
        lang_directive = (
            "LANGUAGE INSTRUCTION: You MUST write the ENTIRE response directly in clear, standard Bengali (বাংলা). "
            "Explain medical concepts using easy-to-understand Bengali terms (e.g. উচ্চ রক্তচাপ, লক্ষণ, সতর্কতা). "
            "Do NOT greet with generic 'How can I help'; explain the topic directly with bullet points."
        )
    elif target_lang == "hi":
        lang_directive = (
            "LANGUAGE INSTRUCTION: You MUST write the ENTIRE response directly in clear, standard Hindi (हिंदी). "
            "Explain medical concepts using simple Hindi terms (e.g. उच्च रक्तचाप, लक्षण, सावधानियां). "
            "Do NOT greet with generic 'How can I help'; explain the topic directly with bullet points."
        )
    else:
        lang_directive = (
            "LANGUAGE INSTRUCTION: Write in clear, simple, accessible English. "
            "Explain medical concepts simply for community health workers. "
            "Do NOT greet or repeat the question; answer directly with headings and bullet points."
        )

    return f"{RURALHEALTH_SYSTEM_PROMPT}\n\n{lang_directive}"


def check_clinical_safety_override(user_query: str, language: Optional[str] = "en") -> Optional[str]:
    """
    Mandatory safety guardrail: Gemma/LLM must NEVER claim to autonomously diagnose
    or prescribe medication. If user asks for definitive diagnosis or prescription,
    return authoritative clinical safety guidance.
    """
    q = (user_query or "").lower().strip()
    target_lang = detect_target_language(user_query, language)

    # Patterns requesting direct diagnosis, prescription, or official clinical risk scoring
    diagnostic_patterns = [
        "definitely have",
        "confirm diagnosis",
        "diagnose this",
        "diagnose the patient",
        "prescribe medicine",
        "prescribe medication",
        "prescribe dosage",
        "what medicine should i prescribe",
        "give prescription",
        "what dosage should i give",
        "official risk",
        "patient's official risk",
        "patient official risk",
        "determine this patient's risk",
        "what is this patient's risk",
        "what is this patient's official risk",
        "assign risk level",
        "calculate official risk",
        "निश्चित रूप से",
        "निदान करें",
        "दवा लिखें",
        "दवा बताइए",
        "क्या दवा दें",
        "रोगी का आधिकारिक जोखिम",
        "निশ্চিতভাবে",
        "রোগ নির্ণয় করুন",
        "ওষুধ লিখে দিন",
        "কী ওষুধ দেব",
        "রোগীর অফিসিয়াল ঝুঁকি",
    ]

    is_diagnostic_request = any(p in q for p in diagnostic_patterns)
    if not is_diagnostic_request:
        return None

    is_risk_query = any(k in q for k in ['official risk', 'patient\'s official risk', 'patient official risk', 'patient\'s risk', 'রিস্ক', 'ঝুঁকি', 'जोखिम'])

    if is_risk_query:
        if target_lang == "bn":
            return (
                "**ক্লিনিক্যাল রিস্ক সেফটি নির্দেশিকা:**\n\n"
                "রুরালহেলথ AI চ্যাট সহকারী কোনো রোগীর অফিসিয়াল ক্লিনিক্যাল ঝুঁকি (Official Clinical Risk) নিজে থেকে নির্ধারণ করতে পারে না।\n\n"
                "• রোগীর অফিসিয়াল ঝুঁকি স্কোর (Low, Moderate, High) স্ক্রিনিং ইঞ্জিন ও ক্লিনিকে পরিমাপকৃত রোগীর ভাইটালস (রক্তচাপ, সুগার, পালস, বিএমআই ও রেড-ফ্ল্যাগ লক্ষণ)-এর ভিত্তিতে নির্ধারিত হয়।\n"
                "• চূড়ান্ত ক্লিনিক্যাল ঝুঁকি এবং চিকিৎসা সিদ্ধান্ত শুধুমাত্র একজন রেজিস্টার্ড চিকিৎসক বা প্রাথমিক স্বাস্থ্য কেন্দ্রের (PHC) মেডিকেল অফিসার দ্বারা নির্ধারিত হয়।\n\n"
                "⚕️ *রুরালহেলথ AI কেবল তথ্যমূলক সহায়তা প্রদান করে — কোনো আনুষ্ঠানিক ক্লিনিক্যাল সিদ্ধান্ত নয়।*"
            )
        elif target_lang == "hi":
            return (
                "**क्लिनिकल जोखिम सुरक्षा निर्देश:**\n\n"
                "रूरलहेल्थ AI चैट सहायक किसी मरीज का आधिकारिक क्लिनिकल जोखिम (Official Clinical Risk) स्वतः निर्धारित नहीं करता है।\n\n"
                "• आधिकारिक जोखिम स्तर (कम, मध्यम, उच्च) क्लिनिकल स्क्रीनिंग इंजन द्वारा मरीज के मापे गए महत्वपूर्ण संकेतकों (रक्तचाप, ग्लूकोज, पल्स, बीएमआई और रेड-फ्लैग संकेत) के आधार पर निकाला जाता है।\n"
                "• अंतिम क्लिनिकल निर्णय केवल प्राथमिक स्वास्थ्य केंद्र (PHC) के चिकित्सा अधिकारी या योग्य डॉक्टर द्वारा ही मान्य होगा।\n\n"
                "⚕️ *यह केवल सहायक जानकारी है — आधिकारिक चिकित्सीय निर्णय नहीं।*"
            )
        else:
            return (
                "**Clinical Risk Safety Boundary:**\n\n"
                "RuralHealth AI chat assistant does not autonomously determine or assign official patient clinical risk.\n\n"
                "**Clinical Protocol:**\n"
                "• Official patient risk classification (**Low, Moderate, or High Risk**) is computed deterministically by the RuralHealth AI Screening & Risk Engine using recorded patient vitals (systolic/diastolic BP, blood glucose, heart rate, BMI, and emergency red-flag symptoms).\n"
                "• The authoritative risk diagnosis and management plan must always be verified by an in-person Primary Health Centre (PHC) Medical Officer or licensed physician.\n"
                "• Health workers should enter patient measurements into the **Screening Form** to view the rule-based clinical risk stratification.\n\n"
                "⚕️ *RuralHealth AI Guidance: Assistive information only — not an autonomous clinical risk determination.*"
            )

    if target_lang == "hi":
        return (
            "मैं किसी रोगी का चिकित्सीय निदान (Diagnosis) या दवा का पर्चा (Prescription) नहीं दे सकता। "
            "दवा और उपचार का निर्णय केवल एक योग्य डॉक्टर या प्राथमिक स्वास्थ्य केंद्र (PHC) के चिकित्सा अधिकारी द्वारा शारीरिक जांच के बाद ही किया जाना चाहिए। "
            "कृपया रोगी को नजदीकी स्वास्थ्य केंद्र (PHC) में डॉक्टर से परामर्श के लिए भेजें।\n\n"
            "⚕️ *यह केवल मार्गदर्शन है — चिकित्सीय निदान या दवा का पर्चा नहीं। कृपया PHC डॉक्टर से परामर्श लें।*"
        )
    elif target_lang == "bn":
        return (
            "আমি কোনো রোগীর রোগ নির্ণয় (Diagnosis) বা ওষুধের প্রেসক্রিপশন (Prescription) দিতে পারি না। "
            "ওষুধ বা চিকিৎসার সিদ্ধান্ত কেবলমাত্র কোনো উপযুক্ত চিকিৎসক বা প্রাথমিক স্বাস্থ্য কেন্দ্রের (PHC) মেডিকেল অফিসারের মাধ্যমেই নেওয়া উচিত। "
            "অনুগ্রহ করে রোগীকে নিকটস্থ স্বাস্থ্যকেন্দ্রে (PHC) চিকিৎসকের পরামর্শের জন্য পাঠান।\n\n"
            "⚕️ *এটি কেবল স্বাস্থ্য সহায়তা — কোনো ডাক্তারি রোগনির্ণয় বা প্রেসক্রিপশন নয়। অনুগ্রহ করে চিকিৎসকের পরামর্শ নিন।*"
        )
    else:
        return (
            "RuralHealth AI cannot prescribe medication or dosages. All pharmacological treatment "
            "decisions must be made by a qualified Medical Officer or PHC physician following an in-person clinical assessment.\n\n"
            "**Recommended Action for Health Worker:**\n"
            "• Record patient symptoms and baseline vitals (BP, glucose, pulse, temperature).\n"
            "• Refer the patient to the Primary Health Centre (PHC) for clinical evaluation and prescription.\n"
            "• If acute red-flag symptoms are present (chest pain, shortness of breath, severe headache), arrange immediate transport.\n\n"
            "⚕️ *RuralHealth AI Guidance: Assistive information only — not an autonomous diagnosis or prescription. Always consult a qualified medical professional or PHC physician.*"
        )


def get_verified_clinical_topic_response(user_query: str, target_lang: str) -> Optional[str]:
    """
    Authoritative domain-grounded clinical knowledge base.
    Used to ground and guarantee complete, accurate, high-quality answers
    for common health queries across English, Bengali, and Hindi.
    """
    q = (user_query or "").lower()

    # ── 1. HYPERTENSION / HIGH BLOOD PRESSURE ──────────────────────────────────
    if any(k in q for k in ['hypertension', 'blood pressure', 'high bp', 'bp', 'রক্তচাপ', 'উচ্চ রক্তচাপ', 'रक्तचाप', 'उच्च रक्तचाप', 'बीपी']):
        
        # 1.1 Emergency BP reading: 160/100 or higher
        if '160' in q or '100' in q or 'emergency' in q or 'critical' in q:
            if target_lang == "bn":
                return (
                    "**রক্তচাপ ১৬০/১০০ mmHg (Stage 2 Hypertension) হলে করণীয়:**\n\n"
                    "রক্তচাপ ১৬০/১০০ mmHg একটি **উচ্চ ঝুঁকির (High Risk)** মাত্রা। এটি অবিলম্বে নিয়ন্ত্রণে আনা এবং চিকিৎসকের পরামর্শ নেওয়া প্রয়োজন।\n\n"
                    "**জরুরি পদক্ষেপসমূহ:**\n"
                    "• **বিশ্রাম:** রোগীকে শান্তভাবে বসিয়ে ৫-১০ মিনিট বিশ্রাম নিতে বলুন। কোনো প্রকার উত্তেজনা বা দৌড়াদৌড়ি পরিহার করুন।\n"
                    "• **পুনরায় পরিমাপ:** ১০ মিনিট পর আবার রক্তচাপ মেপে নিশ্চিত হোন।\n"
                    "• **বিপদের লক্ষণ পরীক্ষা:** তীব্র মাথাব্যথা, বুকে ব্যথা বা চাপ, শ্বাসকষ্ট, চোখে ঝাপসা দেখা, বা মাথা ঘোরার মতো উপসর্গ আছে কি না লক্ষ্য করুন।\n"
                    "• **অবিলম্বে PHC রেফারেল:** যদি বিপদের কোনো লক্ষণ থাকে বা রক্তচাপ ১৬০/১০০ এর উপরে থাকে, তবে অবিলম্বে নিকটস্থ প্রাথমিক স্বাস্থ্য কেন্দ্রে (PHC) বা ডাক্তারের কাছে পাঠান।\n"
                    "• **পরামর্শ:** কোনো নিজে নিজে ওষুধ দেওয়া যাবে না। খাবারে কাঁচা লবণ পুরোপুরি বন্ধ রাখুন।\n\n"
                    "⚕️ *RuralHealth AI Guidance: Assistive information only — not an autonomous diagnosis or prescription.*"
                )
            elif target_lang == "hi":
                return (
                    "**रक्तचाप 160/100 mmHg (Stage 2 Hypertension) होने पर क्या करें:**\n\n"
                    "रक्तचाप 160/100 mmHg एक **उच्च जोखिम (High Risk)** स्थिति है। इसे नजरअंदाज नहीं किया जाना चाहिए।\n\n"
                    "**आशा / स्वास्थ्य कार्यकर्ता के लिए तत्काल कदम:**\n"
                    "• **विश्राम:** रोगी को शांत वातावरण में 5-10 मिनट बैठने या लेटने दें।\n"
                    "• **दोबारा मापें:** 10 मिनट बाद पुनः बीपी मापकर पुष्टि करें।\n"
                    "• **खतरे के संकेत जांचें:** क्या सीने में दर्द, सांस फूलना, गंभीर सिरदर्द, चक्कर या धुंधला दिखाई दे रहा है?\n"
                    "• **तत्काल PHC रेफरल:** तुरंत निकटतम प्राथमिक स्वास्थ्य केंद्र (PHC) या डॉक्टर के पास भेजें।\n"
                    "• **सावधानी:** अपनी तरफ से कोई दवा न दें। खाने में नमक पूरी तरह कम करवाएं।\n\n"
                    "⚕️ *यह केवल मार्गदर्शन है — चिकित्सीय निदान या पर्चा नहीं। कृपया PHC डॉक्टर से परामर्श लें।*"
                )
            else:
                return (
                    "**Clinical Action Plan for Blood Pressure >=160/100 mmHg (Stage 2 Hypertension):**\n\n"
                    "A reading of **160/100 mmHg** indicates significantly elevated blood pressure and is classified as **High Clinical Risk**.\n\n"
                    "**Immediate Healthcare Worker Actions:**\n"
                    "• **Rest & Re-measure:** Have the patient sit quietly with feet flat on the floor for 5–10 minutes, then re-check BP to confirm.\n"
                    "• **Screen for Red Flags:** Check immediately for chest pain/tightness, severe headache, shortness of breath, blurred vision, or neurological deficits.\n"
                    "• **Urgent PHC Referral:** Refer the patient promptly to the nearest Primary Health Centre (PHC) or Medical Officer for clinical management.\n"
                    "• **Patient Counseling:** Advise strictly against heavy exertion, counsel on reducing dietary salt, and explain that unmanaged high BP strains the heart and kidneys.\n"
                    "• **Never Self-Prescribe:** Do not administer pharmaceutical medications without physician authorization.\n\n"
                    "⚕️ *RuralHealth AI Guidance: Assistive information only — not an autonomous diagnosis or prescription.*"
                )

        # 1.2 General Hypertension Explanation / Symptoms / Causes
        if target_lang == "bn":
            return (
                "**উচ্চ রক্তচাপ (Hypertension) সম্পর্কে সহজ বাংলায় বিস্তারিত তথ্য:**\n\n"
                "**১. উচ্চ রক্তচাপ কী?**\n"
                "রক্ত যখন স্বাভাবিকের চেয়ে বেশি শক্তিতে রক্তনালীর প্রাচীরে চাপ দেয়, তখন তাকে উচ্চ রক্তচাপ বা হাইপারটেনশন বলে। সাধারণত প্রাপ্তবয়স্কদের ক্ষেত্রে রক্তচাপ **১৪০/৯০ mmHg বা তার বেশি** হলে তাকে উচ্চ রক্তচাপ হিসেবে বিবেচনা করা হয় (স্বাভাবিক রক্তচাপ ১২০/৮০ mmHg-এর নিচে)।\n\n"
                "**২. উচ্চ রক্তচাপের প্রধান কারণ ও ঝুঁকি:**\n"
                "• অতিরিক্ত লবণযুক্ত খাবার খাওয়া\n"
                "• অতিরিক্ত ওজন ও শারীরিক ব্যায়ামের অভাব\n"
                "• ধূমপান, বিড়ি বা তামাক সেবন\n"
                "• মানসিক চাপ ও দুশ্চিন্তা\n"
                "• পরিবারে উচ্চ রক্তচাপ বা হৃদরোগের ইতিহাস\n"
                "• বয়স বৃদ্ধি এবং কিডনির সমস্যা\n\n"
                "**৩. সাধারণ লক্ষণসমূহ (অনেক সময় কোনো লক্ষণ থাকে না — একে 'নীরব ঘাতক' বলা হয়):**\n"
                "• সকালে ঘুম থেকে ওঠার পর মাথায় বা ঘাড়ে ব্যথা\n"
                "• মাথা ঘোরা ও অতিরিক্ত ক্লান্তি অনুভব করা\n"
                "• বুক ধড়ফড় করা বা সামান্য পরিশ্রমে হাঁপিয়ে ওঠা\n"
                "• চোখে ঝাপসা দেখা বা ঘুমের সমস্যা\n\n"
                "**৪. প্রতিরোধ ও স্বাস্থ্য পরামর্শ:**\n"
                "• রান্নায় ও পাতে কাঁচা লবণ খাওয়া অবিলম্বে কমান\n"
                "• প্রতিদিন অন্তত ৩০ মিনিট হাঁটা বা হালকা ব্যায়াম করুন\n"
                "• শাকসবজি, ফলমূল ও পরিমিত পুষ্টিকর খাদ্য গ্রহণ করুন\n"
                "• তামাক ও অ্যালকোহল সম্পূর্ণ পরিহার করুন\n"
                "• প্রতি মাসে অন্তত একবার স্বাস্থ্যকেন্দ্রে গিয়ে রক্তচাপ পরীক্ষা করান\n\n"
                "⚕️ *RuralHealth AI Guidance: Assistive information only — not an autonomous diagnosis or prescription.*"
            )
        elif target_lang == "hi":
            return (
                "**उच्च रक्तचाप (Hypertension) की सरल एवं स्पष्ट जानकारी:**\n\n"
                "**1. उच्च रक्तचाप (High BP) क्या है?**\n"
                "जब रक्त वाहिकाओं (धमनियों) में रक्त का दबाव सामान्य से लगातार अधिक रहता है, तो इसे उच्च रक्तचाप कहते हैं। सामान्य रक्तचाप **120/80 mmHg** माना जाता है, जबकि **140/90 mmHg या अधिक** को उच्च रक्तचाप कहा जाता है। इसे 'साइलेंट किलर' भी कहा जाता है क्योंकि कई बार इसके कोई स्पष्ट लक्षण नहीं दिखते।\n\n"
                "**2. सामान्य लक्षण:**\n"
                "• सिर के पीछे या गर्दन में भारीपन और दर्द\n"
                "• चक्कर आना या आंखों के सामने अंधेरा छाना\n"
                "• सीने में घबराहट या दिल की धड़कन तेज होना\n"
                "• सांस लेने में तकलीफ या जल्दी थकान होना\n"
                "• नाक से खून आना (गंभीर स्थिति में)\n\n"
                "**3. प्रमुख जोखिम कारक:**\n"
                "• भोजन में अधिक नमक और तली-भुनी चीजों का सेवन\n"
                "• शारीरिक निष्क्रियता और मोटापा\n"
                "• बीड़ी, तंबाकू और शराब का सेवन\n"
                "• मानसिक तनाव और कम नींद\n"
                "• पारिवारिक इतिहास (माता-पिता को उच्च रक्तचाप होना)\n\n"
                "**4. बचाव और प्रबंधन:**\n"
                "• खाने में नमक कम करें, ऊपर से कच्चा नमक बिल्कुल न लें\n"
                "• रोजाना 30 मिनट टहलें या हल्का व्यायाम करें\n"
                "• हरी सब्जियां और फल अधिक खाएं\n"
                "• हर महीने स्वास्थ्य उप-केंद्र या PHC में बीपी की नियमित जांच कराएं\n\n"
                "⚕️ *यह केवल मार्गदर्शन है — चिकित्सीय निदान या पर्चा नहीं। कृपया PHC डॉक्टर से परामर्श लें।*"
            )
        else:
            return (
                "**Hypertension (High Blood Pressure) — Clinical & Patient Education Summary:**\n\n"
                "**1. What is Hypertension?**\n"
                "Hypertension occurs when the force of blood against artery walls is consistently too high. In adults, a normal reading is below **120/80 mmHg**, while readings persistently at or above **140/90 mmHg** indicate hypertension. It is often called a 'silent killer' because it may cause no obvious symptoms for years.\n\n"
                "**2. Common Symptoms (when present):**\n"
                "• Morning headaches, especially at the back of the head\n"
                "• Dizziness, lightheadedness, or unsteadiness\n"
                "• Palpitations or irregular heartbeat sensation\n"
                "• Shortness of breath during mild exertion\n"
                "• Blurred or altered vision\n\n"
                "**3. Key Risk Factors:**\n"
                "• High dietary sodium (excess salt intake)\n"
                "• Physical inactivity and obesity (BMI > 25)\n"
                "• Tobacco use (smoking, bidi, chewing tobacco)\n"
                "• Chronic psychological stress\n"
                "• Family history of hypertension or cardiovascular disease\n\n"
                "**4. Prevention & Community Health Guidance:**\n"
                "• Reduce table salt and processed food consumption.\n"
                "• Encourage 30 minutes of moderate aerobic activity (e.g. brisk walking) daily.\n"
                "• Maintain a diet rich in fruits, green leafy vegetables, and whole grains.\n"
                "• Avoid tobacco and alcohol.\n"
                "• Ensure regular periodic blood pressure screening at the local PHC or sub-centre.\n\n"
                "⚕️ *RuralHealth AI Guidance: Assistive information only — not an autonomous diagnosis or prescription.*"
            )

    # ── 2. ASHA WORKER SCREENING WORKFLOW ──────────────────────────────────────
    if any(k in q for k in ['asha', 'worker', 'screening', 'what should an asha', 'কমিউনিটি', 'স্ক্রিনিং', 'आशा']):
        if target_lang == "bn":
            return (
                "**কমিউনিটি স্ক্রিনিংয়ের সময় আশা (ASHA) কর্মীর করণীয় নির্দেশিকা:**\n\n"
                "**১. রোগীর তথ্য ও ইতিহাস সংগ্রহ:**\n"
                "• রোগীর বয়স, লিঙ্গ, গ্রাম এবং প্রাথমিক স্বাস্থ্য সমস্যা লিপিবদ্ধ করুন।\n"
                "• ধূমপান, তামাক, অ্যালকোহল সেবন ও পারিবারিক রোগের ইতিহাস জানুন।\n\n"
                "**২. শারীরিক পরিমাপ ও ভাইটালস পরীক্ষা:**\n"
                "• **রক্তচাপ (BP):** রোগীকে ৫ মিনিট বসিয়ে শান্ত অবস্থায় ডিজিটাল বিপি মেশিন দিয়ে সঠিকভাবে মাপুন।\n"
                "• **রক্তে শর্করা (Blood Sugar):** গ্লুকোমিটার দিয়ে ফাস্টিং বা র্যান্ডম সুগার পরীক্ষা করুন।\n"
                "• **তাপমাত্রা ও নাড়ির স্পন্দন:** থার্মোমিটার ও পালস রেট পরিমাপ করুন।\n"
                "• **উচ্চতা ও ওজন:** বিএমআই (BMI) নির্ধারণের জন্য সঠিক ওজন ও উচ্চতা নিন।\n\n"
                "**৩. বিপদের লক্ষণ (Red Flags) চিহ্নিতকরণ:**\n"
                "• রক্তচাপ >=১৬০/১০০, তীব্র বুকে ব্যথা, শ্বাসকষ্ট, ১০২°F-এর বেশি দীর্ঘস্থায়ী জ্বর, বা সংজ্ঞাহীনতা দেখলে দেরি না করে অবিলম্বে PHC-তে রেফার করুন।\n\n"
                "**৪. কাউন্সেলিং ও অ্যাপে রেকর্ড সংরক্ষণ:**\n"
                "• সমস্ত তথ্য RuralHealth AI অ্যাপে নির্ভুলভাবে আপলোড করুন (অফলাইনেও সংরক্ষণ হবে)।\n"
                "• লবণ কমানো, বিশুদ্ধ পানীয় জল এবং স্বাস্থ্যকর জীবনযাত্রার পরামর্শ দিন।\n\n"
                "⚕️ *RuralHealth AI Guidance: Assistive information only — not an autonomous diagnosis or prescription.*"
            )
        elif target_lang == "hi":
            return (
                "**स्क्रीनिंग के दौरान आशा (ASHA) कार्यकर्ता की मुख्य जिम्मेदारियां:**\n\n"
                "**1. आवश्यक जानकारी एकत्र करना:**\n"
                "• मरीज की आयु, लिंग, गांव, मुख्य लक्षण और पारिवारिक इतिहास दर्ज करें।\n"
                "• तंबाकू, बीड़ी, खान-पान और शारीरिक गतिविधि की जानकारी लें।\n\n"
                "**2. प्राथमिक स्वास्थ्य जांच (Vitals Measurement):**\n"
                "• **रक्तचाप (BP):** मरीज को 5 मिनट आराम से बैठाकर बीपी सही तरीके से मापें।\n"
                "• **रक्त शर्करा (Blood Glucose):** ग्लूकोमीटर से ब्लड शुगर की जांच करें।\n"
                "• **तापमान और नाड़ी (Pulse & Temp):** बुखार और हृदय गति जांचें।\n"
                "• **वजन और लंबाई:** बीएमआई (BMI) की गणना के लिए वजन लें।\n\n"
                "**3. खतरे के लक्षण (Red Flags) पहचानना:**\n"
                "• यदि बीपी 160/100 से अधिक हो, सीने में तेज दर्द हो, सांस फूल रही हो या तेज बुखार हो, तो तुरंत PHC डॉक्टर के पास भेजें।\n\n"
                "**4. रिकॉर्ड और मार्गदर्शन:**\n"
                "• सारा डेटा RuralHealth AI ऐप में सेव करें।\n"
                "• खान-पान में नमक कम करने, स्वच्छ पानी पीने और नियमित जांच की सलाह दें।\n\n"
                "⚕️ *यह केवल मार्गदर्शन है — चिकित्सीय निदान या पर्चा नहीं। कृपया PHC डॉक्टर से परामर्श लें।*"
            )
        else:
            return (
                "**Standard Operating Guidance for ASHA Workers during Community Health Screening:**\n\n"
                "**1. Patient Intake & History Collection:**\n"
                "• Record basic demographic data (age, gender, village/habitation).\n"
                "• Inquire about presenting symptoms, duration, lifestyle habits (tobacco, alcohol), and family medical history.\n\n"
                "**2. Standard Baseline Vitals Measurement:**\n"
                "• **Blood Pressure:** Ensure the patient is seated quietly for 5 minutes; measure with an appropriate cuff size.\n"
                "• **Blood Glucose:** Perform capillary blood glucose testing (fasting or post-meal as applicable).\n"
                "• **Pulse & Temperature:** Check pulse regularity and body temperature if fever is reported.\n"
                "• **Anthropometry:** Record height and weight for BMI risk calculation.\n\n"
                "**3. Emergency Red-Flag Identification:**\n"
                "• Identify urgent signs: BP >=160/100 mmHg, acute chest pain/radiating pain, breathlessness, high fever >102°F with stiff neck, or altered consciousness.\n"
                "• Immediately mobilize transport to the nearest PHC/Hospital for red-flag cases.\n\n"
                "**4. App Documentation & Follow-Up:**\n"
                "• Save all assessment entries in the RuralHealth AI app (fully supported offline).\n"
                "• Provide counseling on salt reduction, balanced diet, hydration, and schedule follow-up teleconsultations.\n\n"
                "⚕️ *RuralHealth AI Guidance: Assistive information only — not an autonomous diagnosis or prescription.*"
            )

    return None


def get_rule_based_fallback(user_query: str, language: Optional[str] = "en") -> str:
    """
    Deterministic rule-based medical decision support guidance when local AI runtime is unavailable.
    """
    target_lang = detect_target_language(user_query, language)
    
    # Check if a rich grounded topic response exists first
    topic_res = get_verified_clinical_topic_response(user_query, target_lang)
    if topic_res:
        return topic_res

    q = (user_query or "").lower()

    if target_lang == "bn":
        prefix = "ℹ️ *[অফলাইন সিদ্ধান্ত সহায়তা মোড - লোকাল AI অনুপলব্ধ]*\n\n"
        disclaimer = "\n\n⚕️ *এটি কেবল স্বাস্থ্য সহায়তা — কোনো ডাক্তারি রোগনির্ণয় নয়। অনুগ্রহ করে চিকিৎসকের পরামর্শ নিন।*"
        
        if "fever" in q or "জ্বর" in q:
            body = (
                "• **জ্বর নিয়ন্ত্রণ:** রোগীকে পর্যাপ্ত জল ও ওআরএস (ORS) পান করান, বিশ্রাম দিন এবং কপালে জলপট্টি দিন।\n"
                "• **বিপদের লক্ষণ:** জ্বর ১০২°F-এর বেশি হলে বা ২ দিনের বেশি স্থায়ী হলে অবিলম্বে নিকটস্থ PHC-তে যান।"
            )
        elif "cough" in q or "cold" in q or "কাশি" in q or "সর্দি" in q:
            body = (
                "• **কাশি ও সর্দির যত্ন:** উষ্ণ জল পান করুন, তুলসী-আদার চা দিন এবং ভাপ (স্টিম) নিন।\n"
                "• **সতর্কতা:** কাশি ২ সপ্তাহের বেশি স্থায়ী হলে টিবি পরীক্ষার জন্য স্বাস্থ্যকেন্দ্রে পাঠান।"
            )
        elif "sugar" in q or "diabetes" in q or "ডায়াবেটিস" in q or "সুগার" in q:
            body = (
                "• **রক্তে শর্করা নিয়ন্ত্রণ:** মিষ্টি, অতিরিক্ত ভাত ও ময়দা এড়িয়ে চলুন। প্রচুর শাকসবজি খান।\n"
                "• **পরীক্ষা:** নিয়মিত রক্তে শর্করার মাত্রা পরীক্ষা করান।"
            )
        else:
            body = (
                "• **সাধারণ স্বাস্থ্য পরামর্শ:** বিশুদ্ধ পানীয় জল পান করুন, স্বাস্থ্যবিধি মেনে চলুন এবং সুষম পুষ্টিকর খাবার খান।\n"
                "• **পরামর্শ:** আপনার স্থানীয় আশা কর্মী অথবা প্রাথমিক স্বাস্থ্য কেন্দ্রে (PHC) যোগাযোগ করুন।"
            )
        return prefix + body + disclaimer

    elif target_lang == "hi":
        prefix = "ℹ️ *[ऑफ़लाइन निर्णय समर्थन प्रणाली - लोकल AI अनुपलब्ध]*\n\n"
        disclaimer = "\n\n⚕️ *यह केवल मार्गदर्शन है — चिकित्सीय निदान नहीं। कृपया PHC डॉक्टर से परामर्श लें।*"
        
        if "fever" in q or "बुखार" in q:
            body = (
                "• **बुखार प्रबंधन:** रोगी को स्वच्छ पानी और ओआरएस (ORS) दें, पर्याप्त आराम करने दें, और माथे पर गीले कपड़े की पट्टी रखें।\n"
                "• **खतरे के संकेत:** यदि बुखार 102°F से अधिक है, 2 दिन से अधिक रहता है, या गंभीर सिरदर्द/उल्टी है, तो तुरंत निकटतम PHC ले जाएं।"
            )
        elif "cough" in q or "cold" in q or "खांसी" in q or "जुकाम" in q:
            body = (
                "• **खांसी-जुकाम देखभाल:** गुनगुना पानी, अदरक/तुलसी का काढ़ा दें और भाप दिलाएं।\n"
                "• **सावधानी:** यदि खांसी 2 सप्ताह से अधिक रहे या बलगम में खून आए, तो टीबी (TB) जांच हेतु PHC भेजें।"
            )
        elif "sugar" in q or "diabetes" in q or "शुगर" in q or "मधुमेह" in q:
            body = (
                "• **मधुमेह मार्गदर्शन:** सीधी चीनी, मीठी चाय और मैदा से बचें। हरी सब्जियां व साबुत अनाज लें।\n"
                "• **जांच:** नियमित रूप से उप-स्वास्थ्य केंद्र या PHC में ब्लड ग्लूकोज की जांच करवाएं।"
            )
        else:
            body = (
                "• **सामान्य स्वास्थ्य सलाह:** स्वच्छ पेयजल, संतुलित पोषण, और स्वच्छता बनाए रखें।\n"
                "• **परामर्श:** अपने नजदीकी आशा (ASHA) कार्यकर्ता या प्राथमिक स्वास्थ्य केंद्र (PHC) से संपर्क करें।"
            )
        return prefix + body + disclaimer

    else:
        prefix = "ℹ️ *[Offline Decision Support Mode — Local AI Runtime Unavailable]*\n\n"
        disclaimer = "\n\n⚕️ *This is assistive guidance only — not a medical diagnosis. Please consult a PHC physician.*"
        
        if "fever" in q or "temperature" in q:
            body = (
                "• **Fever Management:** Keep hydrated with clean water/ORS, ensure adequate rest, and use a cool damp cloth on forehead to reduce temperature.\n"
                "• **Red Flags:** If fever >102°F lasts more than 2 days or is accompanied by severe headache, rash, or vomiting, visit the nearest PHC immediately."
            )
        elif "cough" in q or "cold" in q:
            body = (
                "• **Cough & Cold Care:** Drink warm water or herbal tea (tulsi/ginger), practice steam inhalation, and rest.\n"
                "• **Warning:** If cough persists >2 weeks or produces blood/chest pain, get tested for TB/respiratory infection at PHC."
            )
        elif "sugar" in q or "diabetes" in q or "glucose" in q:
            body = (
                "• **Blood Sugar Guidance:** Avoid direct sweets, sugary tea, and refined carbohydrates. Increase green leafy vegetables and stay active.\n"
                "• **Screening:** Regular fasting and post-prandial glucose monitoring at PHC is strongly advised."
            )
        else:
            body = (
                "• **General Health Care:** Ensure clean drinking water, balanced nutrition, personal hygiene, and scheduled immunizations.\n"
                "• **Consultation:** Please visit your local ASHA worker or Primary Health Centre (PHC) for clinical assessment."
            )
        return prefix + body + disclaimer
