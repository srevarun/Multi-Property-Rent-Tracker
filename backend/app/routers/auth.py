import hashlib
import secrets
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, HTTPException, Header
from pydantic import BaseModel

from ..database import db

router = APIRouter(prefix="/api/auth", tags=["auth"])


class LoginRequest(BaseModel):
    username: str
    password: str
    remember_me: Optional[bool] = True


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    key = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), 100000)
    return f"{salt}${key.hex()}"


def verify_password(password: str, stored_hash: str) -> bool:
    try:
        salt, key_hex = stored_hash.split("$", 1)
        test_key = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), 100000)
        return secrets.compare_digest(test_key.hex(), key_hex)
    except Exception:
        return False


def get_current_user_from_token(authorization: Optional[str] = Header(None)) -> dict:
    if not authorization:
        raise HTTPException(status_code=401, detail="Authentication token required.")

    token = authorization.replace("Bearer ", "").strip()
    with db() as conn:
        row = conn.execute(
            """
            SELECT u.id, u.username, u.full_name, u.role, s.expires_at
            FROM user_sessions s
            JOIN users u ON s.user_id = u.id
            WHERE s.token = ? AND datetime(s.expires_at) > datetime('now')
            """,
            (token,)
        ).fetchone()

    if not row:
        raise HTTPException(status_code=401, detail="Session invalid or expired. Please sign in again.")

    return {
        "id": row["id"],
        "username": row["username"],
        "full_name": row["full_name"],
        "role": row["role"]
    }


@router.post("/login")
def login(payload: LoginRequest):
    username = payload.username.strip()
    with db() as conn:
        user = conn.execute(
            "SELECT id, username, password_hash, full_name, role FROM users WHERE username = ?",
            (username,)
        ).fetchone()

    if not user or not verify_password(payload.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid username or password.")

    token = secrets.token_hex(32)
    days = 30 if payload.remember_me else 1
    expires_at = (datetime.utcnow() + timedelta(days=days)).strftime("%Y-%m-%d %H:%M:%S")

    with db() as conn:
        conn.execute(
            "INSERT INTO user_sessions (token, user_id, expires_at) VALUES (?, ?, ?)",
            (token, user["id"], expires_at)
        )

    return {
        "status": "success",
        "token": token,
        "user": {
            "id": user["id"],
            "username": user["username"],
            "full_name": user["full_name"],
            "role": user["role"]
        }
    }


@router.get("/me")
def get_me(authorization: Optional[str] = Header(None)):
    user = get_current_user_from_token(authorization)
    return {"status": "authenticated", "user": user}


@router.post("/logout")
def logout(authorization: Optional[str] = Header(None)):
    if authorization:
        token = authorization.replace("Bearer ", "").strip()
        with db() as conn:
            conn.execute("DELETE FROM user_sessions WHERE token = ?", (token,))
    return {"status": "success", "message": "Logged out successfully."}


@router.post("/change-password")
def change_password(payload: ChangePasswordRequest, authorization: Optional[str] = Header(None)):
    user = get_current_user_from_token(authorization)

    if len(payload.new_password) < 6:
        raise HTTPException(status_code=400, detail="New password must be at least 6 characters long.")

    with db() as conn:
        row = conn.execute("SELECT password_hash FROM users WHERE id = ?", (user["id"],)).fetchone()
        if not row or not verify_password(payload.current_password, row["password_hash"]):
            raise HTTPException(status_code=400, detail="Current password is incorrect.")

        new_hash = hash_password(payload.new_password)
        conn.execute("UPDATE users SET password_hash = ? WHERE id = ?", (new_hash, user["id"]))

    return {"status": "success", "message": "Password changed successfully."}
