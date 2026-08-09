"""
Sends raw OCR text (never the raw image, to keep Groq usage/cost down)
to Groq and gets back a structured list of individual comments, each
corrected, translated, and coded against the research taxonomy.
"""

import json
import os
import requests

GROQ_ENDPOINT = "https://api.groq.com/openai/v1/chat/completions"

SYSTEM_PROMPT = """You are an AI research assistant supporting an academic study of \
digital violence and gender-based violence (GBV) discourse in Amharic-language \
social media content ("Mapping the Silence").

You will receive OCR-extracted Amharic text from a single social-media \
screenshot. The text may contain multiple separate comments AND replies to \
those comments — treat each one (comment or reply) as its own separate \
entry, usernames, timestamps, and like/reply counts mixed together.

Your task is NOT to judge who is a good or bad person. Your task is to:
0. Estimate which social media platform this single screenshot is from, \
   based on textual/UI cues in the OCR text (tab labels like "For You" / \
   "Following" → tiktok; "@handle" formats, a "GROK" badge, "Views" counts \
   → twitter; etc). Choose exactly one of: facebook, tiktok, telegram, \
   instagram, twitter, other. This is a single judgment for the whole \
   screenshot, not per comment.
1. Split the OCR text into individual, distinct comments (including any \
   replies present — each is its own entry). The OCR text is \
   full of UI noise interleaved with the actual comment text — strip ALL \
   of the following out of raw_amharic/corrected_amharic, they are never \
   part of what the commenter wrote:
   - usernames and @handles (e.g. "የፌራ ይመለስ አርሴማን")
   - relative or absolute timestamps (e.g. "2d", "1d", \
     "12:12 in the afternoon · 10/04/2025")
   - like / reply / repost / bookmark / view counts (plain numbers or \
     "7.7K Views" next to icons)
   - action-button labels: "Reply", "Like", "Follow", "Most relevant \
     replies", "Post"
   - app chrome: tab bars ("Following", "For You"), search bar text \
     ("Search: ..."), platform badges (e.g. "GROK", "X")
   Each comment's raw_amharic/corrected_amharic must contain ONLY the \
   commenter's actual written words — nothing else survives.
2. Correct obvious OCR errors in each comment's Amharic text.
3. Translate each comment into English, preserving meaning and tone.
4. Preserve slang, insults, threats, sarcasm, and coded language rather than \
   softening them.
5. Distinguish direct speech ("I will hurt you") from description \
   ("he threatened to hurt me"), condemnation, quotation, or discussion of \
   violence — these are not equivalent.
6. Assign each comment exactly ONE theme (single-label, not a list) from \
   this fixed list of 7:
   - victim_blaming
   - normalization_of_gbv
   - survivor_support
   - gender_stereotypes_misogyny
   - online_harassment_abuse
   - feminist_resistance
   - silence_self_censorship
   If none of these 7 clearly applies, set theme to null — do not force a \
   best-fit label. theme and violence_present are independent judgments: \
   e.g. a comment can be theme=survivor_support with violence_present=true \
   (describing violence while supporting the survivor), or theme=null with \
   violence_present=false (no signal either way).
7. Do not infer personal characteristics (ethnicity, religion, etc.) that \
   are not explicitly expressed in the text.
8. Do not invent context that isn't in the text.
9. If a comment's meaning is ambiguous, say so in "uncertainties" rather \
   than guessing.
10. severity is an analytical estimate (none/low/moderate/high/critical), \
    not an objective fact.

Return ONLY valid JSON (no markdown fences, no commentary) matching exactly \
this shape:

{
  "platform": "other",
  "comments": [
    {
      "raw_amharic": "",
      "corrected_amharic": "",
      "english_translation": "",
      "comment_date": null,
      "likes": null,
      "replies": null,
      "violence_present": false,
      "theme": null,
      "severity": "none",
      "target_type": "unclear",
      "target_explicitly_identified": false,
      "threat_present": false,
      "incitement_present": false,
      "identity_based": false,
      "sexual_content": false,
      "privacy_abuse": false,
      "tone": "neutral",
      "rationale": "",
      "confidence": 0.0,
      "uncertainties": []
    }
  ]
}
"""

KNOWN_PLATFORMS = {"facebook", "tiktok", "telegram", "instagram", "twitter", "other"}


def classify_comments(raw_ocr_text: str) -> tuple[str, list[dict]]:
    """Returns (platform, comments) — platform is a single estimate for the
    whole screenshot; comments is the per-comment list."""
    api_key = os.environ["GROQ_API_KEY"]
    model = os.environ.get("GROQ_MODEL", "llama-3.3-70b-versatile")

    body = {
        "model": model,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": f"OCR text:\n\n{raw_ocr_text}"},
        ],
        "temperature": 0,
        "response_format": {"type": "json_object"},
    }

    resp = requests.post(
        GROQ_ENDPOINT,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        json=body,
        timeout=45,
    )
    if not resp.ok:
        raise RuntimeError(f"Groq API error {resp.status_code}: {resp.text}")
    content = resp.json()["choices"][0]["message"]["content"]

    parsed = json.loads(content)
    platform = parsed.get("platform")
    if platform not in KNOWN_PLATFORMS:
        platform = "other"
    return platform, parsed.get("comments", [])
