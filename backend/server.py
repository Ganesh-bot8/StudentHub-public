
import os
import re
import sqlite3

from flask import Flask, request, jsonify, session
from flask_cors import CORS
from dotenv import load_dotenv
from werkzeug.security import generate_password_hash, check_password_hash
from google import genai


# Load environment variables
load_dotenv()

app = Flask(__name__)

# Secret key for login and guest sessions
app.secret_key = os.getenv(
    "FLASK_SECRET_KEY",
    "development-only-change-this-before-deployment"
)

# Session security settings
app.config["SESSION_COOKIE_HTTPONLY"] = True
app.config["SESSION_COOKIE_SAMESITE"] = "Lax"
app.config["SESSION_COOKIE_SECURE"] = False  # Enable True after HTTPS deployment

# Guest AI message allowance
GUEST_MESSAGE_LIMIT = 3


# Allow local frontend
CORS(
    app,
    origins=[
        "http://127.0.0.1:5500",
        "http://localhost:5500",
        "http://127.0.0.1:5501",
        "http://localhost:5501"
    ],
    supports_credentials=True
)


# Database location
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATABASE = os.path.join(BASE_DIR, "studenthub.db")


# Create database and users table
def init_database():
    connection = sqlite3.connect(DATABASE)

    connection.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            full_name TEXT NOT NULL,
            email TEXT NOT NULL UNIQUE,
            password TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    connection.commit()
    connection.close()


init_database()


# Database connection
def get_database():
    connection = sqlite3.connect(DATABASE)
    connection.row_factory = sqlite3.Row
    return connection


# Gemini API configuration
api_key = os.getenv("GEMINI_API_KEY")
client = genai.Client(api_key=api_key) if api_key else None


# Career Mentor instructions
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


# Backend health check
@app.route("/api/health", methods=["GET"])
def health():
    return jsonify({
        "status": "online",
        "service": "StudentHub"
    })


# REGISTER
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

    if len(password) < 8:
        return jsonify({
            "error": "Password must contain at least 8 characters."
        }), 400

    if len(password) > 128:
        return jsonify({
            "error": "Password is too long."
        }), 400

    hashed_password = generate_password_hash(password)

    connection = get_database()

    try:
        connection.execute(
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

    except sqlite3.IntegrityError:
        return jsonify({
            "error": "An account with this email already exists."
        }), 409

    finally:
        connection.close()


# LOGIN
@app.route("/api/login", methods=["POST"])
def login():
    data = request.get_json(silent=True) or {}

    email = data.get("email", "")
    password = data.get("password", "")

    if not isinstance(email, str) or not isinstance(password, str):
        return jsonify({"error": "Invalid input."}), 400

    email = email.strip().lower()

    connection = get_database()

    user = connection.execute(
        "SELECT * FROM users WHERE email = ?",
        (email,)
    ).fetchone()

    connection.close()

    if user is None or not check_password_hash(user["password"], password):
        return jsonify({
            "error": "Incorrect email or password."
        }), 401

    session.clear()
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


# CHECK CURRENT LOGIN
@app.route("/api/me", methods=["GET"])
def current_user():
    user_id = session.get("user_id")

    if not user_id:
        return jsonify({"logged_in": False}), 401

    connection = get_database()

    user = connection.execute(
        "SELECT id, full_name, email FROM users WHERE id = ?",
        (user_id,)
    ).fetchone()

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


# LOGOUT
@app.route("/api/logout", methods=["POST"])
def logout():
    session.clear()

    return jsonify({
        "message": "Logged out successfully."
    })


# CHECK AI CHAT USAGE
@app.route("/api/chat-usage", methods=["GET"])
def chat_usage():
    if session.get("user_id"):
        return jsonify({
            "logged_in": True,
            "unlimited": True,
            "remaining": None
        })

    used = session.get("guest_chat_count", 0)
    remaining = max(0, GUEST_MESSAGE_LIMIT - used)

    return jsonify({
        "logged_in": False,
        "unlimited": False,
        "limit": GUEST_MESSAGE_LIMIT,
        "used": used,
        "remaining": remaining
    })


# GEMINI CAREER MENTOR
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

    # Check guest message allowance
    logged_in = bool(session.get("user_id"))

    if not logged_in:
        used = session.get("guest_chat_count", 0)

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

        # Count only successful guest responses
        remaining = None

        if not logged_in:
            used = session.get("guest_chat_count", 0) + 1
            session["guest_chat_count"] = used
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


if __name__ == "__main__":
    app.run(
        host="127.0.0.1",
        port=5000,
        debug=False
    )
