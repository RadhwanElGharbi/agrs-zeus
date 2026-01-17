import os
import sys
import unittest
from pathlib import Path
from uuid import uuid4
import shutil
import json


class TestSortiesApi(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        sys.path.insert(0, "/opt/agrs/gui-v2/backend")

        if not (os.getenv("DATABASE_URL") or "").strip():
            raise unittest.SkipTest("DATABASE_URL not set; skipping Sorties DB-backed tests.")

        cls.project_name = f"ZZZ_SORTIES_TEST_{uuid4().hex[:10]}"
        cls.project_dir = Path("/opt/agrs/Projects") / cls.project_name
        cls.project_dir.mkdir(parents=True, exist_ok=False)

        # Minimal project files required for project resolution + EPSG extraction (creator uses EPSG)
        metadata = {
            "project_name": cls.project_name,
            "project_id": f"AGRS_{cls.project_name}_TST_2026_001",
            "date_created": "2026-01-10T00:00:00Z",
            "status": "active",
            "project_creator": "Unit Test",
            "organization": "AGRS",
            "country": "Testland",
            "iso3": "TST",
            "measurement_system": "SI",
            "crs": {"epsg": 32633, "name": "WGS 84 / UTM zone 33N"},
        }
        (cls.project_dir / "project_metadata.json").write_text(json.dumps(metadata, indent=2), encoding="utf-8")
        (cls.project_dir / "pipeline_specs.json").write_text(json.dumps({"product": "Test"}, indent=2), encoding="utf-8")

        # Ensure required DB tables exist.
        from api.db import get_engine
        from api.db_models import Base

        Base.metadata.create_all(bind=get_engine())

    @classmethod
    def tearDownClass(cls) -> None:
        shutil.rmtree(cls.project_dir, ignore_errors=True)

    def _actor(self) -> dict:
        return {"username": "admin", "name": "AGRS Admin", "role": "admin", "company": "AGRS Global"}

    def test_create_list_get_and_uniqueness(self) -> None:
        from fastapi import HTTPException
        from api.db import get_sessionmaker
        from api.sorties import SortieCreateRequest, SortieUpdateRequest, archive_sortie, create_sortie, get_sortie, list_sorties, update_sortie

        SessionLocal = get_sessionmaker()
        with SessionLocal() as db:
            created = create_sortie(
                project=self.project_name,
                payload=SortieCreateRequest(code="SRT-UNIT-001", name="Unit Sortie"),
                actor=self._actor(),
                db=db,
            )
            self.assertEqual(created.get("code"), "SRT-UNIT-001")
            self.assertTrue(created.get("id"))

            # Canonical project file mirror must exist
            sortie_id = str(created["id"])
            entry_path = self.project_dir / "data" / "sorties" / "entries" / f"{sortie_id}.json"
            self.assertTrue(entry_path.exists(), f"Expected sortie JSON file at {entry_path}")
            doc = json.loads(entry_path.read_text(encoding="utf-8"))
            self.assertEqual(doc.get("schema"), "agrs.sortie.v1")
            self.assertEqual(doc.get("id"), sortie_id)
            self.assertEqual(doc.get("project_name"), self.project_name)
            self.assertEqual(doc.get("code"), "SRT-UNIT-001")

            # Duplicate code within same project should be rejected
            with self.assertRaises(HTTPException) as ctx:
                create_sortie(
                    project=self.project_name,
                    payload=SortieCreateRequest(code="SRT-UNIT-001"),
                    actor=self._actor(),
                    db=db,
                )
            self.assertEqual(ctx.exception.status_code, 409)

            listed = list_sorties(project=self.project_name, q="SRT-UNIT", limit=50, actor=self._actor(), db=db)
            self.assertGreaterEqual(int(listed.get("count") or 0), 1)
            codes = [s.get("code") for s in (listed.get("sorties") or [])]
            self.assertIn("SRT-UNIT-001", codes)

            fetched = get_sortie(project=self.project_name, sortie_id=str(created["id"]), actor=self._actor(), db=db)
            self.assertEqual(fetched.get("code"), "SRT-UNIT-001")

            # Update should rewrite file
            updated = update_sortie(
                project=self.project_name,
                sortie_id=sortie_id,
                payload=SortieUpdateRequest(name="Updated Sortie Name"),
                actor=self._actor(),
                db=db,
            )
            self.assertEqual(updated.get("name"), "Updated Sortie Name")
            doc2 = json.loads(entry_path.read_text(encoding="utf-8"))
            self.assertEqual(doc2.get("name"), "Updated Sortie Name")

            # Archive should set status=archived in canonical doc
            archived = archive_sortie(project=self.project_name, sortie_id=sortie_id, actor=self._actor(), db=db)
            self.assertEqual(archived.get("code"), "SRT-UNIT-001")
            doc3 = json.loads(entry_path.read_text(encoding="utf-8"))
            self.assertEqual(doc3.get("status"), "archived")


if __name__ == "__main__":
    unittest.main()


