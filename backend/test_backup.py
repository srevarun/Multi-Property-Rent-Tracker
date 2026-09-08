import asyncio
import os
import sqlite3
import tempfile
import unittest
from pathlib import Path
from fastapi import BackgroundTasks
from app import database
from app.routers.backup import (
    get_backup_status,
    download_database_snapshot,
    save_google_drive_config,
    get_google_drive_config,
    cleanup_file,
    GoogleDriveConfig
)

class TestBackupEndpoints(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.original = database.DB_PATH
        database.DB_PATH = Path(self.tmp.name) / "test_ledger.db"
        database.init_db()

    def tearDown(self):
        database.DB_PATH = self.original
        self.tmp.cleanup()

    def test_backup_status(self):
        status = get_backup_status()
        self.assertIn("db_size_bytes", status)
        self.assertIn("is_google_drive_configured", status)
        self.assertIn("stats", status)
        self.assertIn("history", status)

    def test_create_snapshot_and_download(self):
        bg = BackgroundTasks()
        resp = download_database_snapshot(bg)
        self.assertEqual(resp.media_type, "application/x-sqlite3")
        self.assertTrue(os.path.exists(resp.path))

        # Check snapshot sqlite validity
        conn = sqlite3.connect(resp.path)
        tables = [t[0] for t in conn.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()]
        self.assertIn("properties", tables)
        self.assertIn("rent_payments", tables)
        self.assertIn("tenancies", tables)
        conn.close()

        # Run background task execution
        asyncio.run(bg())
        self.assertFalse(os.path.exists(resp.path))

    def test_save_and_get_config(self):
        # Save config
        payload = GoogleDriveConfig(
            folder_name="Rent Tracker Test Backups",
            local_drive_path="/tmp/test_backup_folder"
        )
        res = save_google_drive_config(payload)
        self.assertEqual(res["status"], "saved")

        # Get config
        cfg = get_google_drive_config()
        self.assertEqual(cfg["folder_name"], "Rent Tracker Test Backups")
        self.assertEqual(cfg["local_drive_path"], "/tmp/test_backup_folder")

if __name__ == "__main__":
    unittest.main()
