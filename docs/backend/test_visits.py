"""Kiểm thử app/visits.py. Chạy trong thư mục backend:  pytest -q tests/test_visits.py"""
import time

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.visits import build_stats, build_visits_router, classify, clean_host, init_visits, record_visit

T0 = 1792200000  # 2026-10-17 08:20 giờ VN


@pytest.fixture()
def db():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    init_visits(engine)
    s = sessionmaker(bind=engine)()
    yield s
    s.close()


def v(vid="a" * 24, host="route.ose.vn", **kw):
    return {"host": host, "vid": vid, "ref": "", "utm": "", "new": 0, "lang": "vi", **kw}


def test_clean_host():
    assert clean_host("Route.OSE.vn") == "route.ose.vn"
    assert clean_host("www.portlogistics.vn") == "portlogistics.vn"
    assert clean_host("evil.com") == ""
    assert clean_host("ose.vn.evil.com") == ""
    assert clean_host("x" * 200 + ".ose.vn") == ""


def test_classify():
    assert classify("route.ose.vn", "", "") == "direct"
    assert classify("route.ose.vn", "route.ose.vn", "") == "direct"
    assert classify("route.ose.vn", "portlogistics.ose.vn", "") == "hub"
    assert classify("route.ose.vn", "ukc.ose.vn", "") == "ose"
    assert classify("route.ose.vn", "www.google.com.vn", "") == "search"
    assert classify("route.ose.vn", "l.facebook.com", "") == "social"
    assert classify("route.ose.vn", "", "facebook") == "social"
    assert classify("route.ose.vn", "blog.example.org", "") == "other"


def test_dedupe_and_bots(db):
    assert record_visit(db, v(), now=T0)
    assert not record_visit(db, v(), now=T0 + 60)          # trùng trong 30 phút
    assert record_visit(db, v(), now=T0 + 31 * 60)         # sau 30 phút: lượt mới
    assert not record_visit(db, v(), user_agent="Googlebot/2.1", now=T0 + 99 * 60)
    assert not record_visit(db, v(host="evil.com"), now=T0)
    assert not record_visit(db, v(vid="short"), now=T0)


def test_stats(db):
    day = 86400
    record_visit(db, v("a" * 24, new=1, ref="portlogistics.ose.vn"), now=T0)
    record_visit(db, v("a" * 24, host="ukc.ose.vn", ref="route.ose.vn"), now=T0)
    record_visit(db, v("b" * 24, new=1, utm="facebook"), now=T0)
    record_visit(db, v("a" * 24), now=T0 + day)                     # quay lại hôm sau
    record_visit(db, v("c" * 24), now=T0 - 10 * day)                # kỳ trước
    s = build_stats(db, 7, today="2026-10-18")
    r = {h["host"]: h for h in s["hosts"]}
    assert r["route.ose.vn"]["visitors"] == 2
    assert r["route.ose.vn"]["visits"] == 3
    assert r["route.ose.vn"]["new_visitors"] == 2
    assert r["route.ose.vn"]["returning_visitors"] == 1
    assert r["route.ose.vn"]["prev_visitors"] == 1
    assert r["route.ose.vn"]["sources"]["hub"] == 1 and r["route.ose.vn"]["sources"]["social"] == 1
    assert r["ukc.ose.vn"]["sources"]["ose"] == 1
    assert s["totals"]["visitors"] == 2 and s["totals"]["multi_app_visitors"] == 1
    assert sum(s["daily"]["route.ose.vn"].values()) == 3            # 2 người hôm trước + 1 người hôm sau
    assert build_stats(db, 0, today="2026-10-18")["totals"]["visitors"] == 3


def test_endpoints(db, monkeypatch):
    app = FastAPI()
    app.include_router(build_visits_router(lambda: db, lambda: None))
    c = TestClient(app)
    body = '{"host":"route.ose.vn","vid":"%s","new":1}' % ("d" * 24)
    assert c.post("/api/v1/visit", content=body, headers={"content-type": "text/plain"}).status_code == 204
    assert c.post("/api/v1/visit", content="not json").status_code == 204
    monkeypatch.setenv("READ_ONLY", "true")
    assert c.post("/api/v1/visit", content=body.replace("d", "e")).status_code == 204
    s = c.get("/api/v1/admin/stats/visits?days=30").json()
    assert s["totals"]["visitors"] == 1                             # bản READ_ONLY không ghi
