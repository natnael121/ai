"""
POST /api/reset

DESTRUCTIVE, no undo: deletes every document in images, ocr_results,
comments, classifications, and annotations, and makes a best-effort
attempt to delete each screenshot's file from ImageBB via its stored
deleteUrl.

Uses the Admin SDK, which bypasses firestore.rules entirely — the rules
themselves still forbid the client from ever deleting ocr_results/
comments/classifications directly (evidence preservation for normal
use). This endpoint is the one deliberate exception, gated client-side
behind a typed "DELETE" confirmation (see src/pages/Upload.tsx). It does
not re-confirm anything itself, so treat it as dangerous by construction.
"""

import os
import sys
import traceback
import json as jsonlib
from http.server import BaseHTTPRequestHandler

import requests

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from _lib.firebase_admin_client import get_db

COLLECTIONS = ["ocr_results", "comments", "classifications", "annotations", "images"]


def delete_collection(db, name: str, batch_size: int = 400) -> int:
    """Deletes every doc in a collection, batching writes (Firestore caps
    a single batch at 500 operations). Returns the count deleted."""
    deleted = 0
    coll = db.collection(name)
    while True:
        docs = list(coll.limit(batch_size).stream())
        if not docs:
            break
        batch = db.batch()
        for d in docs:
            batch.delete(d.reference)
        batch.commit()
        deleted += len(docs)
    return deleted


def delete_imagebb_files(image_docs: list[dict]) -> dict:
    """Best-effort only: ImageBB's delete_url is a browser confirmation
    page, not a documented API — a non-error response here does not
    guarantee the file was actually removed."""
    attempted = 0
    ok = 0
    for doc in image_docs:
        delete_url = doc.get("deleteUrl")
        if not delete_url:
            continue
        attempted += 1
        try:
            resp = requests.get(delete_url, timeout=15)
            if resp.status_code < 400:
                ok += 1
        except Exception:  # noqa: BLE001
            pass
    return {"attempted": attempted, "ok": ok}


def handle_reset() -> dict:
    db = get_db()

    # Snapshot image docs (need deleteUrl) before anything is deleted.
    image_docs = [d.to_dict() for d in db.collection("images").stream()]
    imagebb_result = delete_imagebb_files(image_docs)

    deleted_counts = {name: delete_collection(db, name) for name in COLLECTIONS}
    return {"deletedCounts": deleted_counts, "imagebb": imagebb_result}


class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        try:
            result = handle_reset()
            self._respond(200, result)
        except Exception as exc:  # noqa: BLE001
            traceback.print_exc()
            self._respond(500, {"error": str(exc)})

    def _respond(self, status: int, payload: dict):
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(jsonlib.dumps(payload).encode())
