import json
import shutil
import sys
import unittest
import os
from datetime import datetime, timedelta
import asyncio
import io
from pathlib import Path
from uuid import uuid4


class TestCreatorMode(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        # Ensure backend package imports work when running via unittest discovery
        sys.path.insert(0, "/opt/agrs/gui-v2/backend")

        if not (os.getenv("DATABASE_URL") or "").strip():
            raise unittest.SkipTest("DATABASE_URL not set; skipping Creator DB-backed tests.")

        cls.project_name = f"ZZZ_CREATOR_TEST_{uuid4().hex[:10]}"
        cls.project_dir = Path("/opt/agrs/Projects") / cls.project_name
        cls.project_dir.mkdir(parents=True, exist_ok=False)

        # Minimal project files required for project resolution + EPSG extraction
        metadata = {
            "project_name": cls.project_name,
            "project_id": f"AGRS_{cls.project_name}_TST_2026_001",
            "date_created": "2026-01-10T00:00:00Z",
            "status": "active",
            "project_creator": "Unit Test",
            "collaborators": [],
            "organization": "AGRS",
            "country": "Testland",
            "iso3": "TST",
            "measurement_system": "SI",
            "crs": {"epsg": 32633, "name": "WGS 84 / UTM zone 33N"},
        }
        (cls.project_dir / "project_metadata.json").write_text(json.dumps(metadata, indent=2), encoding="utf-8")
        (cls.project_dir / "pipeline_specs.json").write_text(
            json.dumps(
                {"product": "Test", "inner_diameter": 1.0, "outer_diameter": 2.0, "measurement_system": "SI"},
                indent=2,
            ),
            encoding="utf-8",
        )

        # Ensure required DB tables exist for these integration tests.
        from api.db import get_engine
        from api.db_models import Base

        Base.metadata.create_all(bind=get_engine())

    @classmethod
    def tearDownClass(cls) -> None:
        shutil.rmtree(cls.project_dir, ignore_errors=True)

    def _user(self) -> dict:
        # Direct-call tests (like test_earthworks.py) pass the user explicitly.
        return {"username": "admin", "name": "AGRS Admin", "role": "admin", "company": "AGRS Global"}

    def test_creator_crud_with_changelog_and_attachments(self) -> None:
        from fastapi import UploadFile
        from api.creator import (
            create_creator_entry,
            update_creator_entry,
            delete_creator_entry,
            get_creator_geojson,
            get_creator_changelog,
        )
        from api.db import get_sessionmaker
        from api.db_models import Sortie
        from api.projects_db import upsert_project_row

        SessionLocal = get_sessionmaker()
        with SessionLocal() as db:
            # Create a sortie for the project
            db_project = upsert_project_row(db, self.project_name)
            sortie = Sortie(project_id=db_project.id, code="SRT-001", name="Unit Test Sortie")
            db.add(sortie)
            db.commit()
            db.refresh(sortie)

            survey_create = {
                "observation_type": "New",
                "confidence": "High",
                "method": "Walkover",
                "status": "Open",
                "gps_quality": "Good",
                "category_fields": {"asset_type": "culvert", "condition": "good"},
            }
            dataset_features_create = [
                {
                    "dataset": "pipelines_OpenStreetMap-Pipelines-Extract_EPSG32611_processed",
                    "feature": {
                        "type": "Feature",
                        "id": "feat-1",
                        "geometry": {"type": "Point", "coordinates": [13.405, 45.0]},
                        "properties": {"name": "pipe-1", "diameter": 12},
                    },
                    "within_aoi": False,
                    "distance_m": 10.5,
                    "rank": 1,
                }
            ]

            # Create a POI with one attachment, linked to a sortie
            point = {"type": "Point", "coordinates": [13.405, 45.0]}
            upload = UploadFile(filename="note.txt", file=io.BytesIO(b"hello world"))
            created = asyncio.run(
                create_creator_entry(
                    project=self.project_name,
                    entry_type="POI",
                    title="Test POI",
                    category="Engineering",
                    category_other=None,
                    comment="Initial note",
                    datasets=None,
                    sortie_id=str(sortie.id),
                    survey_json=json.dumps(survey_create),
                    dataset_features_json=json.dumps(dataset_features_create),
                    geometry_wgs84=json.dumps(point),
                    attachments=[upload],
                    user=self._user(),
                    db=db,
                )
            )
            entry_id = created.get("id")
            self.assertTrue(entry_id)
            self.assertEqual(created.get("type"), "POI")
            self.assertEqual(created.get("status"), "active")
            self.assertEqual((created.get("created_by") or {}).get("username"), "admin")
            self.assertIsInstance(created.get("attachments"), list)
            self.assertEqual(len(created["attachments"]), 1)
            self.assertIsInstance(created.get("survey"), dict)
            self.assertEqual((created.get("survey") or {}).get("observation_type"), "New")
            self.assertIsInstance(created.get("dataset_features"), list)
            self.assertEqual((created.get("dataset_features") or [{}])[0].get("dataset"), "pipelines_OpenStreetMap-Pipelines-Extract_EPSG32611_processed")

            # Ensure on-disk files were created under data/creator/
            entry_path = self.project_dir / "data" / "creator" / "entries" / f"{entry_id}.json"
            self.assertTrue(entry_path.exists())
            changelog_path = self.project_dir / "data" / "creator" / "changelog" / f"{entry_id}.jsonl"
            self.assertTrue(changelog_path.exists())

            # GeoJSON feed should include the new feature
            fc = asyncio.run(get_creator_geojson(project=self.project_name, include_deleted=False))
            self.assertEqual(fc.get("type"), "FeatureCollection")
            self.assertEqual(len(fc.get("features", [])), 1)

            # Update title, move geometry, remove old attachment and add a new one
            old_filename = created["attachments"][0]["filename"]
            new_point = {"type": "Point", "coordinates": [13.41, 45.001]}
            upload2 = UploadFile(filename="extra.txt", file=io.BytesIO(b"more"))
            survey_update = {
                "observation_type": "Correct",
                "confidence": "Med",
                "method": "Vehicle",
                "status": "NeedsReview",
                "gps_quality": "OK",
                "category_fields": {"asset_type": "culvert", "condition": "fair"},
            }
            dataset_features_update = [
                {
                    "dataset": "pipelines_OpenStreetMap-Pipelines-Extract_EPSG32611_processed",
                    "feature": {
                        "type": "Feature",
                        "id": "feat-2",
                        "geometry": {"type": "Point", "coordinates": [13.41, 45.001]},
                        "properties": {"name": "pipe-2", "diameter": 14},
                    },
                    "within_aoi": False,
                    "distance_m": 25.0,
                    "rank": 1,
                }
            ]
            updated = asyncio.run(
                update_creator_entry(
                    project=self.project_name,
                    entry_id=entry_id,
                    title="Updated POI",
                    category=None,
                    category_other=None,
                    comment=None,
                    datasets=None,
                    sortie_id=str(sortie.id),
                    survey_json=json.dumps(survey_update),
                    dataset_features_json=json.dumps(dataset_features_update),
                    geometry_wgs84=json.dumps(new_point),
                    remove_attachments=json.dumps([old_filename]),
                    attachments=[upload2],
                    user=self._user(),
                    db=db,
                )
            )
            self.assertEqual(updated.get("title"), "Updated POI")
            self.assertIsInstance(updated.get("attachments"), list)
            self.assertEqual(len(updated["attachments"]), 1)
            self.assertNotEqual(updated["attachments"][0]["filename"], old_filename)
            self.assertIsInstance(updated.get("survey"), dict)
            self.assertEqual((updated.get("survey") or {}).get("observation_type"), "Correct")
            self.assertIsInstance(updated.get("dataset_features"), list)
            self.assertEqual((updated.get("dataset_features") or [{}])[0].get("feature", {}).get("id"), "feat-2")

            # Changelog should have at least create + update
            changelog = asyncio.run(get_creator_changelog(project=self.project_name, entry_id=entry_id))
            self.assertGreaterEqual(len(changelog), 2)
            self.assertEqual(changelog[0].get("action"), "create")
            self.assertEqual(changelog[1].get("action"), "update")
            self.assertIsInstance(changelog[0].get("sortie"), dict)
            self.assertEqual((changelog[0].get("sortie") or {}).get("code"), "SRT-001")
            self.assertIsInstance(changelog[1].get("sortie"), dict)
            self.assertEqual((changelog[1].get("sortie") or {}).get("code"), "SRT-001")
            self.assertIsInstance(changelog[0].get("survey"), dict)
            self.assertEqual((changelog[0].get("survey") or {}).get("observation_type"), "New")
            self.assertIsInstance(changelog[1].get("survey"), dict)
            self.assertEqual((changelog[1].get("survey") or {}).get("observation_type"), "Correct")
            self.assertIsInstance(changelog[0].get("dataset_features"), list)
            self.assertEqual((changelog[0].get("dataset_features") or [{}])[0].get("feature", {}).get("id"), "feat-1")
            self.assertIsInstance(changelog[1].get("dataset_features"), list)
            self.assertEqual((changelog[1].get("dataset_features") or [{}])[0].get("feature", {}).get("id"), "feat-2")

            # Soft delete
            deleted = asyncio.run(delete_creator_entry(project=self.project_name, entry_id=entry_id, user=self._user(), db=db))
            self.assertEqual(deleted.get("status"), "deleted")
            self.assertTrue(deleted.get("deleted_at"))

            # Default geojson should hide deleted; include_deleted should show it
            fc_default = asyncio.run(get_creator_geojson(project=self.project_name, include_deleted=False))
            self.assertEqual(len(fc_default.get("features", [])), 0)
            fc_all = asyncio.run(get_creator_geojson(project=self.project_name, include_deleted=True))
            self.assertEqual(len(fc_all.get("features", [])), 1)


if __name__ == "__main__":
    unittest.main()


