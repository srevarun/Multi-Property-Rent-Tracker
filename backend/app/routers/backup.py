import json
import os
import sqlite3
import tempfile
import urllib.request
import urllib.parse
from datetime import datetime
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, HTTPException, BackgroundTasks
from fastapi.responses import FileResponse
from pydantic import BaseModel

from ..database import db, DB_PATH

router = APIRouter(prefix="/api/backup", tags=["backup"])


class GoogleDriveConfig(BaseModel):
    service_account_json: Optional[str] = None
    access_token: Optional[str] = None
    folder_id: Optional[str] = None
    folder_name: Optional[str] = "Rent Tracker Backups"
    local_drive_path: Optional[str] = None


def init_backup_tables():
    with db() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS backup_config (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                provider TEXT NOT NULL DEFAULT 'google_drive',
                service_account_json TEXT DEFAULT '',
                access_token TEXT DEFAULT '',
                folder_id TEXT DEFAULT '',
                folder_name TEXT DEFAULT 'Rent Tracker Backups',
                local_drive_path TEXT DEFAULT '',
                last_backup_at TEXT DEFAULT '',
                last_backup_status TEXT DEFAULT '',
                last_backup_file_id TEXT DEFAULT '',
                last_backup_file_name TEXT DEFAULT '',
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP
            );

            INSERT OR IGNORE INTO backup_config (id, provider) VALUES (1, 'google_drive');

            CREATE TABLE IF NOT EXISTS backup_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                backup_type TEXT NOT NULL DEFAULT 'google_drive',
                filename TEXT NOT NULL,
                file_size INTEGER NOT NULL,
                status TEXT NOT NULL,
                details TEXT DEFAULT '',
                file_id TEXT DEFAULT '',
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
            """
        )


try:
    init_backup_tables()
except Exception:
    pass


def create_sqlite_snapshot() -> tuple[str, str, int]:
    """Creates a consistent, ACID-compliant snapshot of the live SQLite database."""
    timestamp = datetime.now().strftime("%Y-%m-%d_%H%M%S")
    filename = f"rent_tracker_backup_{timestamp}.db"

    tmp = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
    tmp_path = tmp.name
    tmp.close()

    src = sqlite3.connect(DB_PATH)
    dest = sqlite3.connect(tmp_path)
    src.backup(dest)
    dest.close()
    src.close()

    size = os.path.getsize(tmp_path)
    return tmp_path, filename, size


def cleanup_file(file_path: str):
    try:
        if os.path.exists(file_path):
            os.remove(file_path)
    except Exception:
        pass


@router.get("/status")
def get_backup_status():
    """Returns database size, table counts, and cloud backup configuration status."""
    init_backup_tables()
    db_size = os.path.getsize(DB_PATH) if os.path.exists(DB_PATH) else 0

    with db() as conn:
        row = conn.execute("SELECT * FROM backup_config WHERE id = 1").fetchone()
        history_rows = conn.execute(
            "SELECT * FROM backup_history ORDER BY id DESC LIMIT 10"
        ).fetchall()

        prop_count = conn.execute("SELECT COUNT(*) FROM properties").fetchone()[0]
        pay_count = conn.execute("SELECT COUNT(*) FROM rent_payments").fetchone()[0]
        tenancy_count = conn.execute("SELECT COUNT(*) FROM tenancies").fetchone()[0]

    config_data = dict(row) if row else {}
    has_sa = bool(config_data.get("service_account_json", "").strip())
    has_token = bool(config_data.get("access_token", "").strip())
    has_local = bool(config_data.get("local_drive_path", "").strip())

    return {
        "db_size_bytes": db_size,
        "db_size_formatted": f"{db_size / 1024:.1f} KB" if db_size < 1024 * 1024 else f"{db_size / (1024 * 1024):.2f} MB",
        "stats": {
            "properties": prop_count,
            "payments": pay_count,
            "tenancies": tenancy_count
        },
        "is_google_drive_configured": has_sa or has_token or has_local,
        "configured_method": "service_account" if has_sa else "access_token" if has_token else "local_path" if has_local else "none",
        "folder_name": config_data.get("folder_name", "Rent Tracker Backups"),
        "folder_id": config_data.get("folder_id", ""),
        "local_drive_path": config_data.get("local_drive_path", ""),
        "last_backup_at": config_data.get("last_backup_at", ""),
        "last_backup_status": config_data.get("last_backup_status", ""),
        "last_backup_file_name": config_data.get("last_backup_file_name", ""),
        "history": [dict(h) for h in history_rows]
    }


@router.get("/download")
def download_database_snapshot(background_tasks: BackgroundTasks):
    """Generates an instant online SQLite backup and returns it as a downloadable file."""
    tmp_path, filename, size = create_sqlite_snapshot()
    background_tasks.add_task(cleanup_file, tmp_path)

    with db() as conn:
        conn.execute(
            "INSERT INTO backup_history (backup_type, filename, file_size, status, details) VALUES (?, ?, ?, ?, ?)",
            ("download", filename, size, "success", "Manual snapshot download")
        )

    return FileResponse(
        path=tmp_path,
        media_type="application/x-sqlite3",
        filename=filename,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'}
    )


@router.post("/google-drive/config")
def save_google_drive_config(payload: GoogleDriveConfig):
    """Saves Google Drive connection configuration."""
    init_backup_tables()
    with db() as conn:
        conn.execute(
            """
            UPDATE backup_config SET
                service_account_json = COALESCE(?, service_account_json),
                access_token = COALESCE(?, access_token),
                folder_id = COALESCE(?, folder_id),
                folder_name = COALESCE(?, folder_name),
                local_drive_path = COALESCE(?, local_drive_path),
                updated_at = CURRENT_TIMESTAMP
            WHERE id = 1
            """,
            (
                payload.service_account_json if payload.service_account_json is not None else None,
                payload.access_token if payload.access_token is not None else None,
                payload.folder_id if payload.folder_id is not None else None,
                payload.folder_name or "Rent Tracker Backups",
                payload.local_drive_path if payload.local_drive_path is not None else None
            )
        )
    return {"status": "saved", "message": "Google Drive backup configuration updated successfully."}


@router.get("/google-drive/config")
def get_google_drive_config():
    """Gets current Google Drive configuration with masked secrets."""
    init_backup_tables()
    with db() as conn:
        row = conn.execute("SELECT * FROM backup_config WHERE id = 1").fetchone()

    if not row:
        return {}

    sa = row["service_account_json"] or ""
    token = row["access_token"] or ""
    masked_sa = ""
    client_email = ""
    if sa.strip():
        try:
            parsed = json.loads(sa)
            client_email = parsed.get("client_email", "")
            masked_sa = f"Service Account ({client_email})"
        except Exception:
            masked_sa = "Service Account (Configured)"

    masked_token = f"{token[:6]}...{token[-4:]}" if len(token) > 10 else ("Configured" if token else "")

    return {
        "has_service_account": bool(sa.strip()),
        "service_account_email": client_email,
        "masked_service_account": masked_sa,
        "has_access_token": bool(token.strip()),
        "masked_access_token": masked_token,
        "folder_id": row["folder_id"] or "",
        "folder_name": row["folder_name"] or "Rent Tracker Backups",
        "local_drive_path": row["local_drive_path"] or "",
        "last_backup_at": row["last_backup_at"] or "",
        "last_backup_status": row["last_backup_status"] or ""
    }


def get_oauth_token_from_service_account(sa_json_str: str) -> str:
    """Exchanges Google Cloud Service Account JSON for an access token using google-auth."""
    try:
        from google.oauth2 import service_account
        from google.auth.transport.requests import Request

        sa_info = json.loads(sa_json_str)
        scopes = ["https://www.googleapis.com/auth/drive.file", "https://www.googleapis.com/auth/drive"]
        credentials = service_account.Credentials.from_service_account_info(sa_info, scopes=scopes)
        credentials.refresh(Request())
        return credentials.token
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to authenticate with Service Account JSON: {str(e)}")


def ensure_google_drive_folder(token: str, folder_name: str, parent_id: Optional[str] = None) -> str:
    """Finds or creates a backup folder in Google Drive."""
    query = f"name = '{folder_name}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false"
    if parent_id:
        query += f" and '{parent_id}' in parents"

    url = f"https://www.googleapis.com/drive/v3/files?q={urllib.parse.quote(query)}&fields=files(id,name)"
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}"})

    try:
        with urllib.request.urlopen(req) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            files = data.get("files", [])
            if files:
                return files[0]["id"]
    except Exception:
        pass

    create_url = "https://www.googleapis.com/drive/v3/files"
    folder_metadata = {
        "name": folder_name,
        "mimeType": "application/vnd.google-apps.folder"
    }
    if parent_id:
        folder_metadata["parents"] = [parent_id]

    body_bytes = json.dumps(folder_metadata).encode("utf-8")
    req = urllib.request.Request(
        create_url,
        data=body_bytes,
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json; charset=UTF-8"
        }
    )
    with urllib.request.urlopen(req) as resp:
        res = json.loads(resp.read().decode("utf-8"))
        return res["id"]


@router.post("/google-drive/upload")
def upload_backup_to_google_drive():
    """Takes a safe snapshot and uploads it directly to Google Drive or mirrors to local Google Drive folder."""
    init_backup_tables()
    with db() as conn:
        row = conn.execute("SELECT * FROM backup_config WHERE id = 1").fetchone()

    if not row:
        raise HTTPException(status_code=400, detail="Backup configuration not found.")

    sa_json = (row["service_account_json"] or "").strip()
    token = (row["access_token"] or "").strip()
    local_path = (row["local_drive_path"] or "").strip()
    folder_id = (row["folder_id"] or "").strip()
    folder_name = (row["folder_name"] or "Rent Tracker Backups").strip()

    tmp_path, filename, file_size = create_sqlite_snapshot()

    try:
        if local_path:
            target_dir = Path(os.path.expanduser(local_path))
            target_dir.mkdir(parents=True, exist_ok=True)
            target_file = target_dir / filename
            with open(tmp_path, "rb") as src_f, open(target_file, "wb") as dst_f:
                dst_f.write(src_f.read())

            now_iso = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            with db() as conn:
                conn.execute(
                    """
                    UPDATE backup_config SET
                        last_backup_at = ?,
                        last_backup_status = 'success',
                        last_backup_file_name = ?
                    WHERE id = 1
                    """,
                    (now_iso, filename)
                )
                conn.execute(
                    """
                    INSERT INTO backup_history (backup_type, filename, file_size, status, details)
                    VALUES (?, ?, ?, ?, ?)
                    """,
                    ("local_drive", filename, file_size, "success", f"Saved to local folder: {target_file}")
                )

            return {
                "status": "success",
                "message": f"Database backup safely saved to local Google Drive folder: {target_file}",
                "filename": filename,
                "file_size": file_size,
                "backup_at": now_iso
            }

        auth_token = None
        if sa_json:
            auth_token = get_oauth_token_from_service_account(sa_json)
        elif token:
            auth_token = token
        else:
            raise HTTPException(
                status_code=400,
                detail="No Google Drive authentication configured. Please provide a Service Account JSON, OAuth Token, or Local Google Drive folder path in Backup Settings."
            )

        dest_folder_id = folder_id
        if not dest_folder_id:
            try:
                dest_folder_id = ensure_google_drive_folder(auth_token, folder_name)
            except Exception:
                dest_folder_id = None

        boundary = f"----WebKitFormBoundary{datetime.now().strftime('%Y%m%d%H%M%S')}"
        metadata = {"name": filename, "mimeType": "application/x-sqlite3"}
        if dest_folder_id:
            metadata["parents"] = [dest_folder_id]

        with open(tmp_path, "rb") as f:
            file_bytes = f.read()

        body = (
            f"--{boundary}\r\n"
            "Content-Type: application/json; charset=UTF-8\r\n\r\n"
            f"{json.dumps(metadata)}\r\n"
            f"--{boundary}\r\n"
            "Content-Type: application/x-sqlite3\r\n\r\n"
        ).encode("utf-8") + file_bytes + f"\r\n--{boundary}--\r\n".encode("utf-8")

        upload_url = "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink,size,createdTime"
        req = urllib.request.Request(
            upload_url,
            data=body,
            headers={
                "Authorization": f"Bearer {auth_token}",
                "Content-Type": f"multipart/related; boundary={boundary}",
                "Content-Length": str(len(body))
            }
        )

        with urllib.request.urlopen(req) as resp:
            resp_data = json.loads(resp.read().decode("utf-8"))

        uploaded_file_id = resp_data.get("id", "")
        web_link = resp_data.get("webViewLink", "")
        now_iso = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

        with db() as conn:
            conn.execute(
                """
                UPDATE backup_config SET
                    last_backup_at = ?,
                    last_backup_status = 'success',
                    last_backup_file_id = ?,
                    last_backup_file_name = ?,
                    folder_id = COALESCE(NULLIF(folder_id, ''), ?)
                WHERE id = 1
                """,
                (now_iso, uploaded_file_id, filename, dest_folder_id or "")
            )
            conn.execute(
                """
                INSERT INTO backup_history (backup_type, filename, file_size, status, details, file_id)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                ("google_drive", filename, file_size, "success", f"Uploaded to Google Drive (ID: {uploaded_file_id})", uploaded_file_id)
            )

        return {
            "status": "success",
            "message": f"Successfully backed up {filename} to Google Drive!",
            "file_id": uploaded_file_id,
            "filename": filename,
            "file_size": file_size,
            "web_link": web_link,
            "backup_at": now_iso
        }

    except HTTPException:
        raise
    except Exception as e:
        now_iso = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        err_msg = str(e)
        with db() as conn:
            conn.execute(
                "UPDATE backup_config SET last_backup_at = ?, last_backup_status = 'failed' WHERE id = 1",
                (now_iso,)
            )
            conn.execute(
                "INSERT INTO backup_history (backup_type, filename, file_size, status, details) VALUES (?, ?, ?, ?, ?)",
                ("google_drive", filename, file_size, "failed", err_msg)
            )
        raise HTTPException(status_code=500, detail=f"Google Drive backup failed: {err_msg}")
    finally:
        cleanup_file(tmp_path)


@router.get("/google-drive/files")
def list_google_drive_backups():
    """Lists backup files present in Google Drive or history logs."""
    init_backup_tables()
    with db() as conn:
        row = conn.execute("SELECT * FROM backup_config WHERE id = 1").fetchone()
        history_rows = conn.execute(
            "SELECT * FROM backup_history ORDER BY id DESC LIMIT 20"
        ).fetchall()

    if not row:
        return {"cloud_files": [], "history": [dict(h) for h in history_rows]}

    sa_json = (row["service_account_json"] or "").strip()
    token = (row["access_token"] or "").strip()
    folder_id = (row["folder_id"] or "").strip()

    cloud_files = []
    if sa_json or token:
        try:
            auth_token = get_oauth_token_from_service_account(sa_json) if sa_json else token
            q = "name contains 'rent_tracker_backup' and trashed = false"
            if folder_id:
                q += f" and '{folder_id}' in parents"

            url = f"https://www.googleapis.com/drive/v3/files?q={urllib.parse.quote(q)}&fields=files(id,name,size,createdTime,webViewLink)&orderBy=createdTime desc&pageSize=15"
            req = urllib.request.Request(url, headers={"Authorization": f"Bearer {auth_token}"})
            with urllib.request.urlopen(req) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                cloud_files = data.get("files", [])
        except Exception:
            pass

    return {
        "cloud_files": cloud_files,
        "history": [dict(h) for h in history_rows]
    }
