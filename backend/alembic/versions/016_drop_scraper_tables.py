"""drop the scraper / layout-pattern data pipeline tables

The scraper feature was removed; nothing reads these tables any more.

Revision ID: 016
Revises: 015
Create Date: 2026-09-24
"""

import importlib.util
from pathlib import Path

from alembic import op


revision = "016"
down_revision = "015"
branch_labels = None
depends_on = None


def _migration(name: str):
    path = Path(__file__).with_name(name)
    spec = importlib.util.spec_from_file_location(path.stem, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def upgrade() -> None:
    # Children before parents (FKs point at scraper_sources / scraper_runs).
    op.drop_table("layout_patterns")
    op.drop_table("scraped_records")
    op.drop_table("scraper_runs")
    op.drop_table("scraper_sources")


def downgrade() -> None:
    for name in (
        "008_add_scraper_sources_and_runs.py",
        "009_add_scraped_records.py",
        "010_add_layout_patterns.py",
    ):
        _migration(name).upgrade()
