"""
Shared Firebase Admin SDK initialization for all /api serverless
functions. Uses a service account key stored as a single JSON string
in the FIREBASE_SERVICE_ACCOUNT_JSON env var (set in Vercel's
Environment Variables dashboard — never commit the key file itself).
"""

import json
import os

import firebase_admin
from firebase_admin import credentials, firestore

_app = None


def get_db():
    global _app
    if _app is None:
        raw = os.environ["FIREBASE_SERVICE_ACCOUNT_JSON"]
        cred = credentials.Certificate(json.loads(raw))
        _app = firebase_admin.initialize_app(cred)
    return firestore.client()
