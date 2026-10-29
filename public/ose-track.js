/*!
 * ose-track.js — đếm người truy cập cho mọi app *.ose.vn (Port & Logistics AI)
 *
 * Gắn 1 dòng vào <head> của app:
 *   <script src="https://portlogistics.ose.vn/ose-track.js" defer></script>
 *
 * - Mỗi phiên trình duyệt (tab) chỉ gửi 1 lượt cho mỗi app.
 * - Mã khách ẩn danh `ose_vid` (cookie Domain=.ose.vn) dùng chung cho mọi app,
 *   nên cùng một người vào nhiều app vẫn được nhận ra là một người.
 * - Không gửi IP, tên, email hay nội dung nhập trong app.
 * - Gửi tới 2 máy chủ: api-portlogistics.ose.vn (Admin portlogistics) và api-osevn.ose.vn (Admin ose.vn).
 * - Tuỳ chọn: data-api="https://a,https://b" để đổi danh sách máy chủ nhận số liệu.
 * - Lỗi gì cũng bị bỏ qua: script không bao giờ làm hỏng app.
 */
(function () {
  try {
    var w = window, d = document, n = navigator;
    if (w.__oseTrack) return;
    w.__oseTrack = 1;

    var ua = n.userAgent || "";
    if (n.webdriver || /bot|crawl|spider|slurp|headless|lighthouse|pagespeed|preview|facebookexternalhit|zalo.*link/i.test(ua)) return;

    var host = (location.hostname || "").toLowerCase().replace(/^www\./, "");
    if (!host || host === "localhost" || /^[\d.:]+$/.test(host) || /\.pages\.dev$/.test(host)) return;

    var me = d.currentScript;
    var apis = ((me && me.getAttribute("data-api")) || "https://api-portlogistics.ose.vn,https://api-osevn.ose.vn").split(",");

    // 1 lượt / phiên / app
    var sk = "ose_v_" + host;
    try {
      if (sessionStorage.getItem(sk)) return;
      sessionStorage.setItem(sk, "1");
    } catch (e) { /* sessionStorage bị chặn: vẫn đếm, máy chủ sẽ lọc trùng 30 phút */ }

    // Mã khách ẩn danh
    var m = d.cookie.match(/(?:^|;\s*)ose_vid=([A-Za-z0-9]{12,40})/);
    var vid = m ? m[1] : "";
    var isNew = 0;
    if (!vid) { try { vid = localStorage.getItem("ose_vid") || ""; } catch (e) { /* ignore */ } }
    if (!/^[A-Za-z0-9]{12,40}$/.test(vid)) {
      vid = "";
      var a = new Uint8Array(12);
      (w.crypto || w.msCrypto).getRandomValues(a);
      for (var i = 0; i < a.length; i++) vid += ("0" + a[i].toString(16)).slice(-2);
      isNew = 1;
    }
    var dom = /(^|\.)ose\.vn$/.test(host) ? "; Domain=.ose.vn" : "";
    d.cookie = "ose_vid=" + vid + "; Max-Age=63072000; Path=/; SameSite=Lax" + dom + (location.protocol === "https:" ? "; Secure" : "");
    try { localStorage.setItem("ose_vid", vid); } catch (e) { /* ignore */ }

    var ref = "";
    try { ref = d.referrer ? new URL(d.referrer).hostname.toLowerCase() : ""; } catch (e) { /* ignore */ }
    var utm = "";
    try { utm = (new URLSearchParams(location.search).get("utm_source") || "").toLowerCase().slice(0, 40); } catch (e) { /* ignore */ }

    var body = JSON.stringify({
      host: host,
      path: (location.pathname || "/").slice(0, 200),
      ref: ref.slice(0, 120),
      utm: utm,
      vid: vid,
      new: isNew,
      lang: (n.language || "").slice(0, 2).toLowerCase()
    });

    var sendOne = function (api) {
      api = (api || "").replace(/\s+/g, "").replace(/\/$/, "");
      if (!/^https:\/\//.test(api)) return;
      var url = api + "/api/v1/visit";
      try {
        if (n.sendBeacon && n.sendBeacon(url, new Blob([body], { type: "text/plain;charset=UTF-8" }))) return;
      } catch (e) { /* fall through */ }
      try { fetch(url, { method: "POST", body: body, keepalive: true, mode: "no-cors", headers: { "Content-Type": "text/plain;charset=UTF-8" } }); } catch (e) { /* ignore */ }
    };
    var send = function () { for (var j = 0; j < apis.length; j++) sendOne(apis[j]); };

    // Trang mở ngầm (prerender) thì đợi tới khi người dùng thật sự xem
    if (d.visibilityState === "prerender" || d.prerendering) {
      d.addEventListener("visibilitychange", function once() {
        if (d.visibilityState === "visible") { d.removeEventListener("visibilitychange", once); send(); }
      });
    } else {
      send();
    }
  } catch (e) { /* không bao giờ làm hỏng app */ }
})();
