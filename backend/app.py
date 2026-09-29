import json
import os
import secrets
import sqlite3
import time
import uuid
from functools import wraps
from pathlib import Path

from flask import Flask, abort, current_app, g, jsonify, request, send_from_directory, session
from werkzeug.security import check_password_hash, generate_password_hash
from werkzeug.utils import secure_filename


ROOT = Path(__file__).resolve().parent.parent
CONTENT_DEFAULTS = {
    "stats": {"children": 1200, "completion": 85, "families": 450, "years": 12},
    "news": None,
    "gallery": None,
    "posts": None,
    "documents": None,
}
CONTENT_KEYS = tuple(CONTENT_DEFAULTS)
UPLOAD_LIMITS = {"photo": 8 * 1024 * 1024, "video": 50 * 1024 * 1024, "document": 15 * 1024 * 1024}
UPLOAD_EXTENSIONS = {
    "photo": {"jpg", "jpeg", "png", "gif", "webp"},
    "video": {"mp4", "webm"},
    "document": {"pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx"},
}


def create_app(test_config=None):
    app = Flask(__name__, static_folder=None)
    data_dir = Path(os.environ.get("CINDI_DATA_DIR", ROOT / "backend" / "data"))
    data_dir.mkdir(parents=True, exist_ok=True)
    configured_secret = os.environ.get("CINDI_SECRET_KEY") or _load_secret_key(data_dir)
    app.config.from_mapping(
        SECRET_KEY=configured_secret,
        DATABASE=str(data_dir / "cindi.sqlite3"),
        UPLOAD_FOLDER=str(data_dir / "uploads"),
        SESSION_COOKIE_HTTPONLY=True,
        SESSION_COOKIE_SAMESITE="Lax",
        SESSION_COOKIE_SECURE=os.environ.get("CINDI_COOKIE_SECURE", "0") == "1",
        SETUP_TOKEN=os.environ.get("CINDI_SETUP_TOKEN"),
        PERMANENT_SESSION_LIFETIME=60 * 60 * 2,
        MAX_CONTENT_LENGTH=UPLOAD_LIMITS["video"] + 1024 * 1024,
    )
    if test_config:
        app.config.update(test_config)
    if os.environ.get("CINDI_ENV", "").lower() == "production" and not app.config["SETUP_TOKEN"]:
        raise RuntimeError("Set CINDI_SETUP_TOKEN before starting in production mode.")

    Path(app.config["DATABASE"]).parent.mkdir(parents=True, exist_ok=True)
    Path(app.config["UPLOAD_FOLDER"]).mkdir(parents=True, exist_ok=True)
    _initialize_database(app)
    app.teardown_appcontext(close_db)

    @app.before_request
    def enforce_same_origin_writes():
        if request.method in {"POST", "PUT", "PATCH", "DELETE"}:
            origin = request.headers.get("Origin")
            if origin and origin != request.host_url.rstrip("/"):
                return jsonify(error="Cross-origin requests are not allowed."), 403

    @app.after_request
    def security_headers(response):
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
        response.headers.setdefault("X-Frame-Options", "DENY")
        response.headers.setdefault("Content-Security-Policy", "frame-ancestors 'none'")
        response.headers.setdefault("Cache-Control", "no-store" if request.path.startswith("/api/") else "no-cache")
        return response

    @app.errorhandler(413)
    def request_too_large(_error):
        return jsonify(error="The uploaded file is larger than the server limit."), 413

    @app.get("/api/admin/status")
    def admin_status():
        configured = get_db().execute("SELECT 1 FROM admins LIMIT 1").fetchone() is not None
        return jsonify(configured=configured, authenticated=_authenticated())

    @app.post("/api/admin/setup")
    def setup_admin():
        payload = _json_object()
        setup_token = app.config["SETUP_TOKEN"]
        if setup_token and not secrets.compare_digest(str(payload.get("setupToken", "")), setup_token):
            return jsonify(error="The server setup key is missing or incorrect."), 403
        username = str(payload.get("username", "")).strip()
        password = str(payload.get("password", ""))
        if not 3 <= len(username) <= 40 or len(password) < 10:
            return jsonify(error="Use a username of 3-40 characters and a password of at least 10 characters."), 400
        if username.casefold() in password.casefold():
            return jsonify(error="The password must not contain the username."), 400

        db = get_db()
        db.execute("BEGIN IMMEDIATE")
        if db.execute("SELECT 1 FROM admins LIMIT 1").fetchone():
            db.rollback()
            return jsonify(error="Admin setup has already been completed."), 409
        db.execute(
            "INSERT INTO admins (username, password_hash, created_at) VALUES (?, ?, ?)",
            (username, generate_password_hash(password), int(time.time())),
        )
        _store_content(payload.get("content", {}), db)
        db.commit()
        _start_session(username)
        return jsonify(ok=True, username=username), 201

    @app.post("/api/admin/login")
    def login_admin():
        payload = _json_object()
        username = str(payload.get("username", "")).strip()
        password = str(payload.get("password", ""))
        address = request.remote_addr or "unknown"
        db = get_db()
        attempt = db.execute("SELECT failures, locked_until FROM login_attempts WHERE address = ?", (address,)).fetchone()
        now = int(time.time())
        if attempt and attempt["locked_until"] > now:
            return jsonify(error="Too many failed attempts. Try again later."), 429

        admin = db.execute("SELECT username, password_hash FROM admins LIMIT 1").fetchone()
        valid = admin and username.casefold() == admin["username"].casefold() and check_password_hash(admin["password_hash"], password)
        if not valid:
            failures = (attempt["failures"] if attempt and attempt["locked_until"] <= now else 0) + 1
            locked_until = now + 300 if failures >= 5 else 0
            db.execute(
                "INSERT INTO login_attempts (address, failures, locked_until) VALUES (?, ?, ?) "
                "ON CONFLICT(address) DO UPDATE SET failures = excluded.failures, locked_until = excluded.locked_until",
                (address, failures, locked_until),
            )
            db.commit()
            return jsonify(error="Incorrect username or password."), 401

        db.execute("DELETE FROM login_attempts WHERE address = ?", (address,))
        db.commit()
        _start_session(admin["username"])
        return jsonify(ok=True, username=admin["username"])

    @app.get("/api/admin/session")
    def admin_session():
        if not _authenticated():
            return jsonify(authenticated=False), 401
        return jsonify(authenticated=True, username=session["username"])

    @app.post("/api/admin/logout")
    def logout_admin():
        session.clear()
        return jsonify(ok=True)

    @app.post("/api/admin/password")
    @admin_required
    def change_password():
        payload = _json_object()
        current = str(payload.get("current", ""))
        new_password = str(payload.get("password", ""))
        admin = get_db().execute("SELECT password_hash FROM admins WHERE username = ?", (session["username"],)).fetchone()
        if not admin or not check_password_hash(admin["password_hash"], current):
            return jsonify(error="Current password is incorrect."), 401
        if len(new_password) < 10 or session["username"].casefold() in new_password.casefold():
            return jsonify(error="Choose a password of at least 10 characters that does not contain your username."), 400
        get_db().execute("UPDATE admins SET password_hash = ? WHERE username = ?", (generate_password_hash(new_password), session["username"]))
        get_db().commit()
        return jsonify(ok=True)

    @app.get("/api/content")
    def public_content():
        return jsonify(_read_content())

    @app.get("/api/admin/content")
    @admin_required
    def admin_content():
        return jsonify(_read_content())

    @app.put("/api/admin/content")
    @admin_required
    def replace_content():
        payload = _json_object()
        for key, value in payload.items():
            if key in CONTENT_KEYS and _normalize_content(key, value) is None:
                return jsonify(error=f"Invalid {key} content."), 400
        _store_content(payload)
        return jsonify(_read_content())

    @app.put("/api/admin/content/<key>")
    @admin_required
    def update_content(key):
        if key not in CONTENT_KEYS:
            return jsonify(error="Unknown content collection."), 404
        payload = request.get_json(silent=True)
        value = _normalize_content(key, payload)
        if value is None:
            return jsonify(error=f"Invalid {key} content."), 400
        get_db().execute(
            "INSERT INTO content (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            (key, json.dumps(value, ensure_ascii=False)),
        )
        get_db().commit()
        return jsonify(ok=True)

    @app.post("/api/admin/media")
    @admin_required
    def upload_media():
        uploaded = request.files.get("file")
        category = request.form.get("category", "")
        if category not in UPLOAD_LIMITS or uploaded is None or not uploaded.filename:
            return jsonify(error="Choose a file and a valid media category."), 400
        filename = secure_filename(uploaded.filename)
        extension = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
        if extension not in UPLOAD_EXTENSIONS[category]:
            return jsonify(error="That file type is not allowed for this category."), 400
        data = uploaded.read(UPLOAD_LIMITS[category] + 1)
        if not data or len(data) > UPLOAD_LIMITS[category]:
            return jsonify(error="The file is empty or exceeds the category size limit."), 413
        stored_name = f"{uuid.uuid4().hex}.{extension}"
        Path(app.config["UPLOAD_FOLDER"], stored_name).write_bytes(data)
        return jsonify(url=f"/uploads/{stored_name}", name=filename, size=len(data)), 201

    @app.get("/uploads/<path:filename>")
    def uploaded_file(filename):
        return send_from_directory(app.config["UPLOAD_FOLDER"], filename, conditional=True)

    @app.post("/api/contact")
    def submit_contact():
        payload = _json_object()
        category = payload.get("type")
        fields = payload.get("fields")
        if category not in {"general", "volunteer", "partner"} or not isinstance(fields, dict):
            return jsonify(error="Choose a valid inquiry type and provide form details."), 400
        clean_fields = {
            str(key)[:40]: str(value).strip()[:5000]
            for key, value in fields.items()
            if isinstance(key, str) and isinstance(value, (str, int, float, bool))
        }
        if not any(value for key, value in clean_fields.items() if key.lower().endswith(("name", "contact", "org"))):
            return jsonify(error="Please provide your name or organisation."), 400
        if not any(key.lower().endswith("email") and "@" in value for key, value in clean_fields.items()):
            return jsonify(error="Please provide a valid email address."), 400
        get_db().execute(
            "INSERT INTO messages (category, fields, created_at) VALUES (?, ?, ?)",
            (category, json.dumps(clean_fields, ensure_ascii=False), int(time.time())),
        )
        get_db().commit()
        return jsonify(ok=True), 201

    @app.get("/api/admin/messages")
    @admin_required
    def list_messages():
        rows = get_db().execute("SELECT id, category, fields, created_at, read FROM messages ORDER BY id DESC").fetchall()
        return jsonify([
            {"id": row["id"], "category": row["category"], "fields": json.loads(row["fields"]),
             "createdAt": row["created_at"], "read": bool(row["read"])}
            for row in rows
        ])

    @app.patch("/api/admin/messages/<int:message_id>")
    @admin_required
    def mark_message_read(message_id):
        cursor = get_db().execute("UPDATE messages SET read = 1 WHERE id = ?", (message_id,))
        get_db().commit()
        if cursor.rowcount == 0:
            return jsonify(error="Message not found."), 404
        return jsonify(ok=True)

    @app.get("/")
    def home_page():
        return send_from_directory(ROOT, "index.html")

    @app.get("/<path:asset>")
    def static_asset(asset):
        target = (ROOT / asset).resolve()
        if not target.is_relative_to(ROOT) or not target.is_file():
            abort(404)
        return send_from_directory(ROOT, asset)

    return app


def _initialize_database(app):
    connection = sqlite3.connect(app.config["DATABASE"])
    connection.executescript(
        "CREATE TABLE IF NOT EXISTS admins (username TEXT PRIMARY KEY COLLATE NOCASE, password_hash TEXT NOT NULL, created_at INTEGER NOT NULL);"
        "CREATE TABLE IF NOT EXISTS content (key TEXT PRIMARY KEY, value TEXT NOT NULL);"
        "CREATE TABLE IF NOT EXISTS login_attempts (address TEXT PRIMARY KEY, failures INTEGER NOT NULL, locked_until INTEGER NOT NULL);"
        "CREATE TABLE IF NOT EXISTS messages (id INTEGER PRIMARY KEY AUTOINCREMENT, category TEXT NOT NULL, fields TEXT NOT NULL, created_at INTEGER NOT NULL, read INTEGER NOT NULL DEFAULT 0);"
    )
    connection.close()


def _load_secret_key(data_dir):
    key_path = data_dir / "session.key"
    if key_path.exists():
        return key_path.read_text(encoding="utf-8").strip()
    key = secrets.token_urlsafe(48)
    try:
        key_path.write_text(key, encoding="utf-8")
    except FileExistsError:
        return key_path.read_text(encoding="utf-8").strip()
    return key


def get_db():
    if "db" not in g:
        g.db = sqlite3.connect(current_app.config["DATABASE"])
        g.db.row_factory = sqlite3.Row
    return g.db


def close_db(_error=None):
    db = g.pop("db", None)
    if db is not None:
        db.close()


def _read_content():
    values = dict(CONTENT_DEFAULTS)
    for row in get_db().execute("SELECT key, value FROM content"):
        values[row["key"]] = json.loads(row["value"])
    return values


def _store_content(payload, connection=None):
    if not isinstance(payload, dict):
        return
    db = connection or get_db()
    for key in CONTENT_KEYS:
        if key not in payload:
            continue
        value = _normalize_content(key, payload[key])
        if value is None:
            continue
        db.execute(
            "INSERT INTO content (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            (key, json.dumps(value, ensure_ascii=False)),
        )
    if connection is None:
        db.commit()


def _validate_collection(key, value):
    if not isinstance(value, list) or len(value) > 5000:
        return None
    limit = 14000 if key == "posts" else 10000
    if any(not isinstance(item, dict) or len(json.dumps(item, ensure_ascii=False)) > limit for item in value):
        return None
    return value


def _normalize_content(key, value):
    if key == "stats":
        if not isinstance(value, dict):
            return None
        try:
            return {
                "children": max(0, int(value.get("children", 0))),
                "completion": min(100, max(0, int(value.get("completion", 0)))),
                "families": max(0, int(value.get("families", 0))),
                "years": max(0, int(value.get("years", 0))),
            }
        except (TypeError, ValueError):
            return None
    return _validate_collection(key, value)


def _json_object():
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        abort(400, description="A JSON object is required.")
    return payload


def _start_session(username):
    session.clear()
    now = int(time.time())
    session.update(username=username, created_at=now, last_activity=now)
    session.permanent = True


def _authenticated():
    username = session.get("username")
    if not username:
        return False
    now = int(time.time())
    if now - session.get("last_activity", 0) > 15 * 60 or now - session.get("created_at", 0) > 2 * 60 * 60:
        session.clear()
        return False
    session["last_activity"] = now
    return True


def admin_required(handler):
    @wraps(handler)
    def wrapped(*args, **kwargs):
        if not _authenticated():
            return jsonify(error="Sign in to continue."), 401
        return handler(*args, **kwargs)

    return wrapped


app = create_app()


if __name__ == "__main__":
    app.run(host=os.environ.get("CINDI_HOST", "127.0.0.1"), port=int(os.environ.get("CINDI_PORT", "5000")))