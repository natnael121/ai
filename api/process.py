"""
POST /api/process   body: {"imageId": "..."}

Processes ONE screenshot's Groq stage:
  Firestore ocr_results/{imageId}   (written client-side by Tesseract.js,
                                      see src/lib/ocr.ts — this endpoint
                                      does NOT run OCR itself)
      -> Groq: split + correct +      -> comments/{commentId}
         translate + classify         -> classifications/{commentId}
      -> images/{imageId}.status = "classified"

Deliberately scoped to a single image so the function finishes well
inside Vercel's execution time limit. Process 100 screenshots by calling
this endpoint 100 times (the Upload page does this one at a time, right
after each screenshot's client-side OCR finishes) rather than looping
in one request.

Every stage is written to its own collection and never overwritten,
per the evidence-preservation requirement: raw OCR stays raw even if
Groq is re-run later with an updated taxonomy.
"""

import os
import sys
import time
import traceback
from http.server import BaseHTTPRequestHandler
import json as jsonlib

# Vercel's Python runtime loads this file via importlib.util, which does
# not add the file's own directory to sys.path the way a normal `python
# script.py` invocation would — so the sibling import below needs help
# finding `_lib` (api/_lib/).
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from _lib.firebase_admin_client import get_db
from _lib.groq import classify_comments


def handle_process(image_id: str) -> dict:
    db = get_db()
    image_ref = db.collection("images").document(image_id)
    image_doc = image_ref.get()
    if not image_doc.exists:
        raise ValueError(f"No such image: {image_id}")

    # OCR runs client-side (Tesseract.js) before this endpoint is ever
    # called — see src/pages/Upload.tsx. If it's missing, the client
    # skipped a step rather than this function needing to do OCR itself.
    ocr_ref = db.collection("ocr_results").document(image_id)
    ocr_doc = ocr_ref.get()
    if not ocr_doc.exists:
        raise ValueError(
            f"No OCR result for {image_id}. Run client-side OCR "
            "(src/lib/ocr.ts) and write ocr_results/{imageId} before "
            "calling /api/process."
        )
    raw_text = ocr_doc.to_dict()["rawText"]

    if not raw_text.strip():
        image_ref.update({"status": "classified", "errorMessage": "OCR returned no text"})
        return {"imageId": image_id, "commentCount": 0}

    # --- Groq: split into comments, correct, translate, classify ---
    image_ref.update({"status": "grok_pending"})
    platform, comments = classify_comments(raw_text)

    batch = db.batch()
    for i, c in enumerate(comments, start=1):
        comment_id = f"{image_id}-C{i:02d}"
        comment_ref = db.collection("comments").document(comment_id)
        batch.set(
            comment_ref,
            {
                "commentId": comment_id,
                "imageId": image_id,
                "rawAmharic": c.get("raw_amharic", ""),
                "correctedAmharic": c.get("corrected_amharic", ""),
                "englishTranslation": c.get("english_translation", ""),
                "commentDate": c.get("comment_date"),
                "likes": c.get("likes"),
                "replies": c.get("replies"),
                "createdAt": time.time(),
            },
        )

        classification_ref = db.collection("classifications").document(comment_id)
        batch.set(
            classification_ref,
            {
                "commentId": comment_id,
                "imageId": image_id,
                "violencePresent": c.get("violence_present", False),
                "theme": c.get("theme"),
                "severity": c.get("severity", "none"),
                "targetType": c.get("target_type", "unclear"),
                "targetExplicitlyIdentified": c.get("target_explicitly_identified", False),
                "threatPresent": c.get("threat_present", False),
                "incitementPresent": c.get("incitement_present", False),
                "identityBased": c.get("identity_based", False),
                "sexualContent": c.get("sexual_content", False),
                "privacyAbuse": c.get("privacy_abuse", False),
                "tone": c.get("tone", "neutral"),
                "rationale": c.get("rationale", ""),
                "confidence": c.get("confidence", 0.0),
                "uncertainties": c.get("uncertainties", []),
                "model": "groq",
                "createdAt": time.time(),
            },
        )
    batch.commit()

    image_ref.update(
        {"status": "classified", "visibleCommentCount": len(comments), "platform": platform}
    )
    return {"imageId": image_id, "commentCount": len(comments)}


class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        length = int(self.headers.get("Content-Length", 0))
        body = jsonlib.loads(self.rfile.read(length) or b"{}")
        image_id = body.get("imageId")

        if not image_id:
            self._respond(400, {"error": "imageId is required"})
            return

        try:
            result = handle_process(image_id)
            self._respond(200, result)
        except Exception as exc:  # noqa: BLE001
            traceback.print_exc()
            try:
                get_db().collection("images").document(image_id).update(
                    {"status": "failed", "errorMessage": str(exc)}
                )
            except Exception:  # noqa: BLE001
                pass
            self._respond(500, {"error": str(exc)})

    def _respond(self, status: int, payload: dict):
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(jsonlib.dumps(payload).encode())
