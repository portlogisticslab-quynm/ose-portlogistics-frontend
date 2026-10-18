"""
Đếm người truy cập từng app *.ose.vn (Admin › Truy cập app).

Nhận "beacon" từ script dùng chung https://portlogistics.ose.vn/ose-track.js,
được gắn vào <head> của mọi app (route.ose.vn, ukc.ose.vn, ...) và của chính hub.

  POST /api/v1/visit                 công khai, không cần CORS preflight (text/plain), luôn trả 204
  GET  /api/v1/admin/stats/visits    chỉ Admin/Editor: số liệu cho tab "Truy cập app"

Module tự chứa: không phụ thuộc models.py hiện có. Cắm vào app chính bằng 3 dòng:

    from app.visits import build_visits_router, init_visits
    init_visits(engine)                                              # tạo bảng app_visits nếu chưa có
    app.include_router(build_visits_router(get_db, <dependency kiểm tra admin/editor>))

Không lưu IP, tên, email. Mã khách `vid` (ngẫu nhiên, do trình duyệt tạo) được băm thêm
một lần với VISIT_SALT trước khi ghi, nên không thể đối chiếu ngược lại cookie.

Biến môi trường (tuỳ chọn):
  READ_ONLY=true            Render dự phòng: nhận beacon nhưng không ghi (trả 204)
  VISIT_SALT                chuỗi bí mật để băm mã khách (mặc định dùng GATE_SECRET hoặc "ose")
  VISIT_HOST_SUFFIXES       tên miền được đếm, mặc định ".ose.vn,portlogistics.vn"
  VISIT_DEDUPE_MINUTES      cùng người + cùng app trong khoảng này chỉ tính 1 lượt (mặc định 30)
"""
from __future__ import annotations

import hashlib
import json
import os
import re
import threading
import time
from collections import defaultdict, deque
from datetime import date, datetime, timedelta, timezone
from typing import Any, Callable

from fastapi import APIRouter, Depends, Query, Request, Response
from sqlalchemy import Column, Index, Integer, MetaData, String, Table, text
from sqlalchemy.orm import Session

VN_TZ = timezone(timedelta(hours=7))

metadata = MetaData()
app_visits = Table(
    "app_visits", metadata,
    Column("id", Integer, primary_key=True, autoincrement=True),
    Column("ts", Integer, nullable=False),            # epoch giây (UTC)
    Column("day", String(10), nullable=False),        # YYYY-MM-DD theo giờ Việt Nam
    Column("host", String(120), nullable=False),      # route.ose.vn
    Column("vid", String(16), nullable=False),        # mã khách đã băm
    Column("is_new", Integer, nullable=False, default=0),
    Column("source", String(12), nullable=False),     # hub | ose | search | social | direct | other
    Column("ref", String(120), nullable=False, default=""),
    Column("country", String(2), nullable=False, default=""),
    Column("lang", String(2), nullable=False, default=""),
    Index("ix_app_visits_day_host", "day", "host"),
    Index("ix_app_visits_vid_host_ts", "vid", "host", "ts"),
)


def init_visits(engine) -> None:
    """Tạo bảng app_visits nếu chưa có (an toàn khi chạy lại)."""
    metadata.create_all(engine, tables=[app_visits])


# ---------------------------------------------------------------- phân loại (thuần Python, có test)

HUB_HOSTS = {"portlogistics.ose.vn", "hub.portlogistics.vn", "portlogistics.vn"}
_SEARCH = re.compile(r"(^|\.)(google|bing|coccoc|duckduckgo|yahoo|yandex|baidu|ecosia|naver|search\.brave)\.")
_SOCIAL = re.compile(
    r"(^|\.)(facebook\.com|fb\.com|fb\.me|messenger\.com|linkedin\.com|lnkd\.in|zalo\.me|zaloapp\.com|youtube\.com|youtu\.be|"
    r"t\.co|x\.com|twitter\.com|tiktok\.com|reddit\.com|instagram\.com|threads\.net|t\.me|telegram\.org)$")
_UTM_SOCIAL = re.compile(r"facebook|^fb|zalo|linkedin|youtube|tiktok|twitter|^x$|instagram|telegram|messenger")
_UTM_SEARCH = re.compile(r"google|bing|coccoc|search")
_UTM_HUB = re.compile(r"portlogistics|^hub$|ose")
_BOT_UA = re.compile(r"bot|crawl|spider|slurp|headless|lighthouse|pagespeed|preview|facebookexternalhit|curl|wget|python-|httpclient|java/", re.I)
_HOST_RE = re.compile(r"^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$")
_VID_RE = re.compile(r"^[A-Za-z0-9]{12,40}$")


def _suffixes() -> list[str]:
    raw = os.getenv("VISIT_HOST_SUFFIXES", ".ose.vn,portlogistics.vn")
    return [s.strip().lower() for s in raw.split(",") if s.strip()]


def clean_host(h: Any) -> str:
    """Trả về host hợp lệ đã chuẩn hoá, hoặc "" nếu không thuộc tên miền được đếm."""
    if not isinstance(h, str):
        return ""
    h = h.strip().lower()
    if h.startswith("www."):
        h = h[4:]
    if len(h) > 120 or not _HOST_RE.match(h):
        return ""
    for s in _suffixes():
        bare = s.lstrip(".")
        if h == bare or h.endswith("." + bare):
            return h
    return ""


def classify(host: str, ref: str, utm: str) -> str:
    """Nguồn đến của lượt truy cập."""
    utm = (utm or "").lower()
    if utm:
        if _UTM_HUB.search(utm):
            return "hub"
        if _UTM_SOCIAL.search(utm):
            return "social"
        if _UTM_SEARCH.search(utm):
            return "search"
        return "other"
    ref = (ref or "").lower()
    if ref.startswith("www."):
        ref = ref[4:]
    if not ref or ref == host:
        return "direct"
    if ref in HUB_HOSTS:
        return "hub"
    if ref == "ose.vn" or ref.endswith(".ose.vn"):
        return "ose"
    if _SEARCH.search(ref):
        return "search"
    if _SOCIAL.search(ref) or ref.startswith(("l.facebook.", "lm.facebook.", "m.facebook.")):
        return "social"
    return "other"


def hash_vid(vid: str) -> str:
    salt = os.getenv("VISIT_SALT") or os.getenv("GATE_SECRET") or "ose"
    return hashlib.sha256(f"{salt}|{vid}".encode()).hexdigest()[:16]


def vn_day(ts: float | None = None) -> str:
    return datetime.fromtimestamp(ts if ts is not None else time.time(), VN_TZ).strftime("%Y-%m-%d")


# ---------------------------------------------------------------- SQL (dùng được cho SQLite và PostgreSQL)

SQL_RECENT = """
SELECT 1 FROM app_visits WHERE vid = :vid AND host = :host AND ts >= :since LIMIT 1
"""

SQL_INSERT = """
INSERT INTO app_visits (ts, day, host, vid, is_new, source, ref, country, lang)
VALUES (:ts, :day, :host, :vid, :is_new, :source, :ref, :country, :lang)
"""

SQL_BY_HOST = """
SELECT host,
       COUNT(*)                                             AS visits,
       COUNT(DISTINCT vid)                                  AS visitors,
       COUNT(DISTINCT CASE WHEN is_new = 1 THEN vid END)    AS new_visitors,
       SUM(CASE WHEN source = 'hub'    THEN 1 ELSE 0 END)   AS src_hub,
       SUM(CASE WHEN source = 'ose'    THEN 1 ELSE 0 END)   AS src_ose,
       SUM(CASE WHEN source = 'search' THEN 1 ELSE 0 END)   AS src_search,
       SUM(CASE WHEN source = 'social' THEN 1 ELSE 0 END)   AS src_social,
       SUM(CASE WHEN source = 'direct' THEN 1 ELSE 0 END)   AS src_direct,
       SUM(CASE WHEN source = 'other'  THEN 1 ELSE 0 END)   AS src_other,
       COUNT(DISTINCT day)                                  AS active_days,
       MAX(ts)                                              AS last_ts
FROM app_visits
WHERE day >= :since AND day <= :until
GROUP BY host
"""

SQL_PREV_BY_HOST = """
SELECT host, COUNT(DISTINCT vid) AS visitors, COUNT(*) AS visits
FROM app_visits
WHERE day >= :since AND day <= :until
GROUP BY host
"""

SQL_RETURNING_BY_HOST = """
SELECT host, COUNT(*) AS returning_visitors FROM (
  SELECT host, vid FROM app_visits
  WHERE day >= :since AND day <= :until
  GROUP BY host, vid
  HAVING COUNT(DISTINCT day) >= 2
) r GROUP BY host
"""

SQL_DAILY = """
SELECT day, host, COUNT(DISTINCT vid) AS visitors
FROM app_visits
WHERE day >= :since AND day <= :until
GROUP BY day, host
"""

SQL_TOTALS = """
SELECT COUNT(*) AS visits,
       COUNT(DISTINCT vid) AS visitors,
       COUNT(DISTINCT CASE WHEN is_new = 1 THEN vid END) AS new_visitors
FROM app_visits
WHERE day >= :since AND day <= :until
"""

SQL_MULTI_APP = """
SELECT COUNT(*) AS n FROM (
  SELECT vid FROM app_visits
  WHERE day >= :since AND day <= :until
  GROUP BY vid
  HAVING COUNT(DISTINCT host) >= 2
) m
"""

SQL_COUNTRIES = """
SELECT country, COUNT(DISTINCT vid) AS visitors
FROM app_visits
WHERE day >= :since AND day <= :until AND country <> ''
GROUP BY country
ORDER BY visitors DESC
LIMIT 10
"""

SQL_OTHER_REFS = """
SELECT ref, COUNT(*) AS visits
FROM app_visits
WHERE day >= :since AND day <= :until AND source = 'other' AND ref <> ''
GROUP BY ref
ORDER BY visits DESC
LIMIT 10
"""

SQL_FIRST_DAY = "SELECT MIN(day) AS d FROM app_visits"


def periods(days: int, today: str | None = None) -> dict[str, str | None]:
    """Khoảng ngày hiện tại và kỳ liền trước cùng độ dài (days=0: từ đầu, không có kỳ trước)."""
    t = date.fromisoformat(today or vn_day())
    if days <= 0:
        return {"since": "0000-00-00", "until": t.isoformat(), "prev_since": None, "prev_until": None}
    since = t - timedelta(days=days - 1)
    prev_until = since - timedelta(days=1)
    prev_since = prev_until - timedelta(days=days - 1)
    return {"since": since.isoformat(), "until": t.isoformat(),
            "prev_since": prev_since.isoformat(), "prev_until": prev_until.isoformat()}


def _rows(db: Session, sql: str, **params) -> list[dict[str, Any]]:
    return [dict(r._mapping) for r in db.execute(text(sql), params)]


def build_stats(db: Session, days: int, today: str | None = None) -> dict[str, Any]:
    p = periods(days, today)
    win = {"since": p["since"], "until": p["until"]}

    hosts = {r["host"]: r for r in _rows(db, SQL_BY_HOST, **win)}
    for r in _rows(db, SQL_RETURNING_BY_HOST, **win):
        if r["host"] in hosts:
            hosts[r["host"]]["returning_visitors"] = r["returning_visitors"]
    prev: dict[str, dict[str, Any]] = {}
    if p["prev_since"]:
        prev = {r["host"]: r for r in _rows(db, SQL_PREV_BY_HOST, since=p["prev_since"], until=p["prev_until"])}

    out_hosts = []
    for h in sorted(set(hosts) | set(prev)):
        cur = hosts.get(h, {})
        pv = prev.get(h)
        last_ts = cur.get("last_ts")
        out_hosts.append({
            "host": h,
            "visits": int(cur.get("visits") or 0),
            "visitors": int(cur.get("visitors") or 0),
            "new_visitors": int(cur.get("new_visitors") or 0),
            "returning_visitors": int(cur.get("returning_visitors") or 0),
            "active_days": int(cur.get("active_days") or 0),
            "sources": {k: int(cur.get(f"src_{k}") or 0) for k in ("hub", "ose", "search", "social", "direct", "other")},
            "prev_visitors": int(pv["visitors"]) if pv else (0 if p["prev_since"] else None),
            "prev_visits": int(pv["visits"]) if pv else (0 if p["prev_since"] else None),
            "last": datetime.fromtimestamp(int(last_ts), VN_TZ).isoformat(timespec="minutes") if last_ts else None,
        })

    daily: dict[str, dict[str, int]] = defaultdict(dict)
    for r in _rows(db, SQL_DAILY, **win):
        daily[r["host"]][r["day"]] = int(r["visitors"])

    tot = _rows(db, SQL_TOTALS, **win)[0]
    first = _rows(db, SQL_FIRST_DAY)[0]["d"]
    return {
        "days": days,
        "since": p["since"] if days > 0 else first,
        "until": p["until"],
        "prev_since": p["prev_since"],
        "prev_until": p["prev_until"],
        "first_day": first,
        "totals": {
            "visits": int(tot["visits"] or 0),
            "visitors": int(tot["visitors"] or 0),
            "new_visitors": int(tot["new_visitors"] or 0),
            "multi_app_visitors": int(_rows(db, SQL_MULTI_APP, **win)[0]["n"] or 0),
        },
        "hosts": out_hosts,
        "daily": {h: d for h, d in daily.items()},
        "countries": [{"country": r["country"], "visitors": int(r["visitors"])} for r in _rows(db, SQL_COUNTRIES, **win)],
        "other_refs": [{"ref": r["ref"], "visits": int(r["visits"])} for r in _rows(db, SQL_OTHER_REFS, **win)],
    }


def record_visit(db: Session, payload: dict[str, Any], *, user_agent: str = "", country: str = "",
                 now: float | None = None) -> bool:
    """Ghi một lượt. Trả về True nếu đã ghi, False nếu bị bỏ qua (bot, sai host, trùng)."""
    if _BOT_UA.search(user_agent or ""):
        return False
    host = clean_host(payload.get("host"))
    vid = payload.get("vid")
    if not host or not isinstance(vid, str) or not _VID_RE.match(vid):
        return False
    now = time.time() if now is None else now
    hv = hash_vid(vid)
    dedupe = int(os.getenv("VISIT_DEDUPE_MINUTES", "30")) * 60
    if db.execute(text(SQL_RECENT), {"vid": hv, "host": host, "since": int(now) - dedupe}).first():
        return False
    ref = payload.get("ref") if isinstance(payload.get("ref"), str) else ""
    ref = ref.strip().lower()[:120]
    utm = payload.get("utm") if isinstance(payload.get("utm"), str) else ""
    source = classify(host, ref, utm[:40])
    lang = payload.get("lang") if isinstance(payload.get("lang"), str) else ""
    country = (country or "").upper()
    db.execute(text(SQL_INSERT), {
        "ts": int(now), "day": vn_day(now), "host": host, "vid": hv,
        "is_new": 1 if payload.get("new") in (1, True, "1") else 0,
        "source": source,
        "ref": ref if source == "other" else "",          # chỉ giữ tên miền nguồn lạ, để xem ai giới thiệu
        "country": country if re.fullmatch(r"[A-Z]{2}", country) and country not in ("XX", "T1") else "",
        "lang": re.sub(r"[^a-z]", "", lang.lower())[:2],
    })
    db.commit()
    return True


# ---------------------------------------------------------------- giới hạn tần suất (trong bộ nhớ)

class _RateLimiter:
    def __init__(self, per_minute: int = 120):
        self.per_minute = per_minute
        self.hits: dict[str, deque] = defaultdict(deque)
        self.lock = threading.Lock()

    def allow(self, key: str) -> bool:
        now = time.monotonic()
        with self.lock:
            q = self.hits[key]
            while q and now - q[0] > 60:
                q.popleft()
            if len(q) >= self.per_minute:
                return False
            q.append(now)
            if len(self.hits) > 20000:      # chống phình bộ nhớ
                self.hits.clear()
            return True


_limiter = _RateLimiter()


def _read_only() -> bool:
    return os.getenv("READ_ONLY", "").strip().lower() in ("1", "true", "yes", "on")


# ---------------------------------------------------------------- router

def build_visits_router(get_db: Callable, require_staff: Callable) -> APIRouter:
    """get_db: dependency trả về Session hiện có của app.
    require_staff: dependency kiểm tra token Admin/Editor (giống endpoint /admin/stats/clicks)."""
    router = APIRouter()

    @router.post("/api/v1/visit", status_code=204, include_in_schema=False)
    async def visit(request: Request, db: Session = Depends(get_db)) -> Response:
        ok = Response(status_code=204, headers={"Access-Control-Allow-Origin": "*"})
        if _read_only():
            return ok
        ip = request.headers.get("cf-connecting-ip") or (request.client.host if request.client else "?")
        if not _limiter.allow(ip):
            return ok
        raw = await request.body()
        if not raw or len(raw) > 2048:
            return ok
        try:
            payload = json.loads(raw)
            if isinstance(payload, dict):
                record_visit(db, payload, user_agent=request.headers.get("user-agent", ""),
                             country=request.headers.get("cf-ipcountry", ""))
        except Exception:  # noqa: BLE001 — số liệu không bao giờ được làm lỗi API
            db.rollback()
        return ok

    @router.get("/api/v1/admin/stats/visits", dependencies=[Depends(require_staff)])
    def visit_stats(days: int = Query(30, ge=0, le=3650), db: Session = Depends(get_db)) -> dict[str, Any]:
        return build_stats(db, days)

    return router
