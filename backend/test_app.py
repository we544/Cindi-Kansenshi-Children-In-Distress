import io
import tempfile
import unittest
from pathlib import Path

from backend.app import create_app


class BackendTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        root = Path(self.temp_dir.name)
        app = create_app({
            "TESTING": True,
            "SECRET_KEY": "test-session-secret",
            "DATABASE": str(root / "test.sqlite3"),
            "UPLOAD_FOLDER": str(root / "uploads"),
        })
        self.client = app.test_client()
        response = self.client.post("/api/admin/setup", json={"username": "staff", "password": "safe-passphrase-42"})
        self.assertEqual(response.status_code, 201)

    def tearDown(self):
        self.temp_dir.cleanup()

    def test_content_is_shared_and_requires_authentication_to_write(self):
        anonymous = self.client.application.test_client()
        denied = anonymous.put("/api/admin/content/news", json=[])
        self.assertEqual(denied.status_code, 401)

        news = [{"id": "n1", "title": "Shared update", "category": "community"}]
        saved = self.client.put("/api/admin/content/news", json=news)
        self.assertEqual(saved.status_code, 200)
        invalid = self.client.put("/api/admin/content/stats", json={"children": "many"})
        self.assertEqual(invalid.status_code, 400)
        public = self.client.get("/api/content")
        self.assertEqual(public.json["news"], news)

    def test_contact_messages_are_visible_in_admin_inbox(self):
        response = self.client.post("/api/contact", json={
            "type": "general",
            "fields": {"gName": "Jane Banda", "gEmail": "jane@example.org", "gMessage": "Hello CINDI"},
        })
        self.assertEqual(response.status_code, 201)
        messages = self.client.get("/api/admin/messages").json
        self.assertEqual(len(messages), 1)
        self.assertFalse(messages[0]["read"])
        marked = self.client.patch(f"/api/admin/messages/{messages[0]['id']}")
        self.assertEqual(marked.status_code, 200)
        self.assertTrue(self.client.get("/api/admin/messages").json[0]["read"])

    def test_upload_is_saved_and_served_from_server(self):
        response = self.client.post("/api/admin/media", data={
            "category": "photo",
            "file": (io.BytesIO(b"test-image"), "photo.jpg"),
        }, content_type="multipart/form-data")
        self.assertEqual(response.status_code, 201)
        served = self.client.get(response.json["url"])
        self.assertEqual(served.data, b"test-image")
        served.close()

    def test_password_change_and_static_site(self):
        changed = self.client.post("/api/admin/password", json={
            "current": "safe-passphrase-42",
            "password": "another-safe-passphrase-54",
        })
        self.assertEqual(changed.status_code, 200)
        self.client.post("/api/admin/logout")
        login = self.client.post("/api/admin/login", json={
            "username": "staff",
            "password": "another-safe-passphrase-54",
        })
        self.assertEqual(login.status_code, 200)
        home = self.client.get("/")
        self.assertEqual(home.status_code, 200)
        self.assertIn("frame-ancestors 'none'", home.headers["Content-Security-Policy"])
        home.close()

    def test_setup_key_is_enforced_when_configured(self):
        root = Path(self.temp_dir.name) / "locked-setup"
        app = create_app({
            "TESTING": True,
            "SECRET_KEY": "test-session-secret",
            "DATABASE": str(root / "test.sqlite3"),
            "UPLOAD_FOLDER": str(root / "uploads"),
            "SETUP_TOKEN": "one-time-key",
        })
        client = app.test_client()
        credentials = {"username": "staff", "password": "safe-passphrase-42"}
        self.assertEqual(client.post("/api/admin/setup", json=credentials).status_code, 403)
        credentials["setupToken"] = "one-time-key"
        self.assertEqual(client.post("/api/admin/setup", json=credentials).status_code, 201)


if __name__ == "__main__":
    unittest.main()