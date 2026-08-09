"""
Sends raw OCR text (never the raw image, to keep Grok usage/cost down)
to Grok and gets back a structured list of individual comments, each
corrected, translated, and coded against the research taxonomy.
"""

import json
import os
import requests

GROK_ENDPOINT = "https://api.x.ai/v1/chat/completions"

SYSTEM_PROMPT = """You are an AI research assistant supporting an academic study of \
digital violence and gender-based violence (GBV) discourse in Amharic-language \
social media content ("Mapping the Silence").

You will receive OCR-extracted Amharic text from a single social-media \
screenshot. The text may contain multiple separate comments, usernames, \
timestamps, and like/reply counts mixed together.

Your task is NOT to judge who is a good or bad person. Your task is to:
1. Split the OCR text into individual, distinct comments (ignore UI chrome \
   like "Reply", "Like", platform navigation text).
2. Correct obvious OCR errors in each comment's Amharic text.
3. Translate each comment into English, preserving meaning and tone.
4. Preserve slang, insults, threats, sarcasm, and coded language rather than \
   softening them.
5. Distinguish direct speech ("I will hurt you") from description \
   ("he threatened to hurt me"), condemnation, quotation, or discussion of \
   violence — these are not equivalent.
6. Code each comment against ALL applicable themes (multi-label) from this \
   fixed list:
   - victim_blaming
   - normalization_of_gbv
   - survivor_support
   - gender_stereotypes_misogyny
   - online_harassment_abuse
   - feminist_resistance
   - silence_self_censorship
   - no_apparent_violence  (use when nothing else applies)
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
  "comments": [
    {
      "raw_amharic": "",
      "corrected_amharic": "",
      "english_translation": "",
      "comment_date": null,
      "likes": null,
      "replies": null,
      "violence_present": false,
      "themes": [],
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


def classify_comments(raw_ocr_text: str) -> list[dict]:
    api_key = os.environ["GROK_API_KEY"]
    model = os.environ.get("GROK_MODEL", "grok-4")

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
        GROK_ENDPOINT,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        json=body,
        timeout=45,
    )
    resp.raise_for_status()
    content = resp.json()["choices"][0]["message"]["content"]

    parsed = json.loads(content)
    return parsed.get("comments", [])
