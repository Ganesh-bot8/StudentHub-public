import os
import re
import sqlite3
import uuid

from flask import Flask, request, jsonify, session
from flask_cors import CORS
from dotenv import load_dotenv
from werkzeug.security import generate_password_hash, check_password_hash
from google import genai
from psycopg.errors import UniqueViolation
load_dotenv()

app = Flask(__name__)

# --------------------------------------------------
# ENVIRONMENT AND SECURITY
# --------------------------------------------------

IS_PRODUCTION = (
    os.getenv("APP_ENV", "").lower() == "production"
    or os.getenv("RENDER", "").lower() == "true"
)

SECRET_KEY = os.getenv("FLASK_SECRET_KEY")

if IS_PRODUCTION and not SECRET_KEY:
    raise RuntimeError("FLASK_SECRET_KEY must be configured in production.")

app.secret_key = SECRET_KEY or "local-development-secret-change-before-deployment"

app.config["SESSION_COOKIE_HTTPONLY"] = True
app.config["SESSION_COOKIE_SECURE"] = IS_PRODUCTION
app.config["SESSION_COOKIE_SAMESITE"] = (
    "None" if IS_PRODUCTION else "Lax"
)
app.config["PERMANENT_SESSION_LIFETIME"] = 60 * 60 * 24 * 7

GUEST_MESSAGE_LIMIT = 3

# --------------------------------------------------
# CORS
# --------------------------------------------------

allowed_origins = {
    "http://127.0.0.1:5500",
    "http://localhost:5500",
    "http://127.0.0.1:5501",
    "http://localhost:5501",
}

frontend_url = os.getenv("FRONTEND_URL", "").strip().rstrip("/")

if frontend_url:
    allowed_origins.add(frontend_url)
CORS(
    app,
    origins=list(allowed_origins),
    supports_credentials=True
)


# Check request origins on state-changing requests.
@app.before_request
def check_request_origin():
    if request.method in ("POST", "PUT", "PATCH", "DELETE"):
        origin = request.headers.get("Origin")

        if origin and origin.rstrip("/") not in allowed_origins:
            return jsonify({"error": "Request origin not allowed."}), 403


# --------------------------------------------------
# DATABASE CONFIGURATION
# --------------------------------------------------

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

DATABASE_URL = os.getenv("DATABASE_URL", "").strip()

USE_POSTGRES = bool(DATABASE_URL)

if USE_POSTGRES:
    DATABASE_URL = DATABASE_URL.replace(
        "postgres://",
        "postgresql://",
        1
    )


def get_database():
    if USE_POSTGRES:
        import psycopg
        from psycopg.rows import dict_row

        return psycopg.connect(
            DATABASE_URL,
            row_factory=dict_row
        )

    connection = sqlite3.connect(
        os.path.join(BASE_DIR, "studenthub.db")
    )

    connection.row_factory = sqlite3.Row

    return connection


# Convert SQLite-style placeholders to PostgreSQL placeholders.
def execute(connection, query, params=()):
    if USE_POSTGRES:
        query = query.replace("?", "%s")

    return connection.execute(query, params)


def init_database():
    connection = get_database()

    try:
        if USE_POSTGRES:
            user_id_type = "BIGSERIAL PRIMARY KEY"
        else:
            user_id_type = "INTEGER PRIMARY KEY AUTOINCREMENT"

        execute(
            connection,
            f"""
            CREATE TABLE IF NOT EXISTS users (
                id {user_id_type},
                full_name TEXT NOT NULL,
                email TEXT NOT NULL UNIQUE,
                password TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
            """
        )

        execute(
            connection,
            """
            CREATE TABLE IF NOT EXISTS guest_usage (
                guest_id TEXT PRIMARY KEY,
                used INTEGER NOT NULL DEFAULT 0
            )
            """
        )

        connection.commit()

    finally:
        connection.close()


init_database()


# --------------------------------------------------
# GEMINI CONFIGURATION
# --------------------------------------------------

api_key = os.getenv("GEMINI_API_KEY")

client = genai.Client(api_key=api_key) if api_key else None

SYSTEM_INSTRUCTION = """
You are Career Mentor, an AI assistant inside Student Hub.

Help people with:
1. Career guidance
2. Learning roadmaps
3. Programming skills
4. Resume and GitHub projects
5. Internship preparation
6. Interview preparation
7. Placement preparation

Rules:
- Use simple English.
- Explain step by step.
- Give practical examples.
- Support beginners.
- Do not invent job openings or statistics.
- Keep answers organized and useful.
"""


# --------------------------------------------------
# HELPER FUNCTIONS
# --------------------------------------------------

def get_guest_id():
    if "guest_id" not in session:
        session["guest_id"] = str(uuid.uuid4())

    return session["guest_id"]


def get_guest_usage(guest_id):
    connection = get_database()

    try:
        result = execute(
            connection,
            "SELECT used FROM guest_usage WHERE guest_id = ?",
            (guest_id,)
        ).fetchone()

        return result["used"] if result else 0

    finally:
        connection.close()


def increment_guest_usage(guest_id):
    connection = get_database()

    try:
        execute(
            connection,
            """
            INSERT INTO guest_usage (guest_id, used)
            VALUES (?, 1)
            ON CONFLICT (guest_id)
            DO UPDATE SET used = guest_usage.used + 1
            """,
            (guest_id,)
        )

        connection.commit()

    finally:
        connection.close()


# --------------------------------------------------
# HEALTH CHECK
# --------------------------------------------------

@app.route("/api/health", methods=["GET"])
def health():
    return jsonify({
        "status": "online",
        "service": "StudentHub",
        "database": "postgresql" if USE_POSTGRES else "sqlite"
    })


# --------------------------------------------------
# REGISTER
# --------------------------------------------------

@app.route("/api/register", methods=["POST"])
def register():
    data = request.get_json(silent=True) or {}

    full_name = data.get("full_name", "")
    email = data.get("email", "")
    password = data.get("password", "")

    if not all(
        isinstance(value, str)
        for value in [full_name, email, password]
    ):
        return jsonify({"error": "Invalid input."}), 400

    full_name = full_name.strip()
    email = email.strip().lower()

    if len(full_name) < 2 or len(full_name) > 80:
        return jsonify({
            "error": "Name must be between 2 and 80 characters."
        }), 400

    if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", email):
        return jsonify({
            "error": "Enter a valid email address."
        }), 400

    if len(password) < 8 or len(password) > 128:
        return jsonify({
            "error": "Password must contain between 8 and 128 characters."
        }), 400

    hashed_password = generate_password_hash(password)

    connection = get_database()

    try:
        execute(
            connection,
            """
            INSERT INTO users (full_name, email, password)
            VALUES (?, ?, ?)
            """,
            (full_name, email, hashed_password)
        )

        connection.commit()

        return jsonify({
            "message": "Registration successful. You can now log in."
        }), 201

    except (sqlite3.IntegrityError, UniqueViolation):
        connection.rollback()

        return jsonify({
            "error": "An account with this email already exists."
        }), 409

    except Exception:
        connection.rollback()
        app.logger.exception("Registration error")

        return jsonify({
            "error": "Registration failed. Please try again."
        }), 500

    finally:
        connection.close()


# --------------------------------------------------
# LOGIN
# --------------------------------------------------

@app.route("/api/login", methods=["POST"])
def login():
    data = request.get_json(silent=True) or {}

    email = data.get("email", "")
    password = data.get("password", "")

    if not isinstance(email, str) or not isinstance(password, str):
        return jsonify({"error": "Invalid input."}), 400

    email = email.strip().lower()

    connection = get_database()

    try:
        user = execute(
            connection,
            "SELECT * FROM users WHERE email = ?",
            (email,)
        ).fetchone()

    finally:
        connection.close()

    if user is None or not check_password_hash(user["password"], password):
        return jsonify({
            "error": "Incorrect email or password."
        }), 401

    session.clear()
    session.permanent = True
    session["user_id"] = user["id"]
    session["user_name"] = user["full_name"]

    return jsonify({
        "message": "Login successful.",
        "user": {
            "id": user["id"],
            "full_name": user["full_name"],
            "email": user["email"]
        }
    })


# --------------------------------------------------
# CHECK CURRENT LOGIN
# --------------------------------------------------

@app.route("/api/me", methods=["GET"])
def current_user():
    user_id = session.get("user_id")

    if not user_id:
        return jsonify({"logged_in": False}), 401

    connection = get_database()

    try:
        user = execute(
            connection,
            "SELECT id, full_name, email FROM users WHERE id = ?",
            (user_id,)
        ).fetchone()

    finally:
        connection.close()

    if user is None:
        session.clear()
        return jsonify({"logged_in": False}), 401

    return jsonify({
        "logged_in": True,
        "user": {
            "id": user["id"],
            "full_name": user["full_name"],
            "email": user["email"]
        }
    })


# --------------------------------------------------
# LOGOUT
# --------------------------------------------------

@app.route("/api/logout", methods=["POST"])
def logout():
    session.clear()

    return jsonify({
        "message": "Logged out successfully."
    })


# --------------------------------------------------
# CHECK AI CHAT USAGE
# --------------------------------------------------

@app.route("/api/chat-usage", methods=["GET"])
def chat_usage():
    if session.get("user_id"):
        return jsonify({
            "logged_in": True,
            "unlimited": True,
            "remaining": None
        })

    guest_id = get_guest_id()
    used = get_guest_usage(guest_id)
    remaining = max(0, GUEST_MESSAGE_LIMIT - used)

    return jsonify({
        "logged_in": False,
        "unlimited": False,
        "limit": GUEST_MESSAGE_LIMIT,
        "used": used,
        "remaining": remaining
    })


# --------------------------------------------------
# GEMINI CAREER MENTOR
# --------------------------------------------------

@app.route("/api/chat", methods=["POST"])
def chat():

    if client is None:
        return jsonify({
            "error": "Gemini API key is missing."
        }), 500

    data = request.get_json(silent=True) or {}
    message = data.get("message", "")

    if not isinstance(message, str):
        return jsonify({"error": "Invalid message."}), 400

    message = message.strip()

    if not message:
        return jsonify({
            "error": "Please enter a message."
        }), 400

    if len(message) > 4000:
        return jsonify({
            "error": "Message is too long."
        }), 400

    logged_in = bool(session.get("user_id"))
    guest_id = None

    if not logged_in:
        guest_id = get_guest_id()
        used = get_guest_usage(guest_id)

        if used >= GUEST_MESSAGE_LIMIT:
            return jsonify({
                "error": "Your 3 free AI messages have been used.",
                "code": "GUEST_LIMIT_REACHED",
                "message": "Please register or log in to continue using AI Career Mentor."
            }), 403

    prompt = SYSTEM_INSTRUCTION + "\n\nUser question:\n" + message

    try:
        response = client.models.generate_content(
            model="gemini-3.5-flash-lite",
            contents=prompt
        )

        answer = response.text

        if not answer:
            return jsonify({
                "error": "No response received. Try again."
            }), 502

        remaining = None

        if not logged_in:
            increment_guest_usage(guest_id)

            used = get_guest_usage(guest_id)
            remaining = max(0, GUEST_MESSAGE_LIMIT - used)

        return jsonify({
            "reply": answer,
            "remaining": remaining,
            "unlimited": logged_in
        })

    except Exception:
        app.logger.exception("Gemini API error")

        return jsonify({
            "error": "AI service unavailable. Please try again."
        }), 502


# --------------------------------------------------
# START SERVER
# --------------------------------------------------

if __name__ == "__main__":
    app.run(
        host="0.0.0.0",
        port=int(os.getenv("PORT", 5000)),
        debug=False
    )