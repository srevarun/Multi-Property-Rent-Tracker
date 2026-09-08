import os
import tempfile
import unittest
from pathlib import Path
from fastapi import HTTPException
from app import database
from app.routers.auth import login, get_me, logout, change_password, LoginRequest, ChangePasswordRequest

class TestAuthEndpoints(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.original = database.DB_PATH
        database.DB_PATH = Path(self.tmp.name) / "test_auth.db"
        database.init_db()

    def tearDown(self):
        database.DB_PATH = self.original
        self.tmp.cleanup()

    def test_login_success(self):
        req = LoginRequest(username="srevarun", password="abcd1234")
        resp = login(req)
        self.assertEqual(resp["status"], "success")
        self.assertTrue(len(resp["token"]) > 20)
        self.assertEqual(resp["user"]["username"], "srevarun")
        self.assertEqual(resp["user"]["full_name"], "Srevarun Somasundaram")

    def test_login_wrong_password(self):
        req = LoginRequest(username="srevarun", password="wrongpassword")
        with self.assertRaises(HTTPException) as ctx:
            login(req)
        self.assertEqual(ctx.exception.status_code, 401)

    def test_get_me_and_logout(self):
        # 1. Login
        req = LoginRequest(username="srevarun", password="abcd1234")
        resp = login(req)
        token = resp["token"]
        auth_header = f"Bearer {token}"

        # 2. Get Me
        me_resp = get_me(auth_header)
        self.assertEqual(me_resp["status"], "authenticated")
        self.assertEqual(me_resp["user"]["username"], "srevarun")

        # 3. Logout
        logout(auth_header)

        # 4. Get Me after logout should fail with 401
        with self.assertRaises(HTTPException) as ctx:
            get_me(auth_header)
        self.assertEqual(ctx.exception.status_code, 401)

    def test_change_password(self):
        # 1. Login
        login_res = login(LoginRequest(username="srevarun", password="abcd1234"))
        token = login_res["token"]
        auth_header = f"Bearer {token}"

        # 2. Change password
        chg_res = change_password(ChangePasswordRequest(current_password="abcd1234", new_password="newsecret123"), auth_header)
        self.assertEqual(chg_res["status"], "success")

        # 3. Old password fails
        with self.assertRaises(HTTPException):
            login(LoginRequest(username="srevarun", password="abcd1234"))

        # 4. New password succeeds
        new_login = login(LoginRequest(username="srevarun", password="newsecret123"))
        self.assertEqual(new_login["status"], "success")

if __name__ == "__main__":
    unittest.main()
