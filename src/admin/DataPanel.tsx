import { useRef, useState } from "react";
import { ApiError, apiFetch } from "../lib/api";
import type { Session } from "./AdminApp";
import { Notice, Panel, btn } from "./ui";

export default function DataPanel({ session, onAuthError }: { session: Session; onAuthError: (e: unknown) => void }) {
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const doExport = async () => {
    try {
      const data = await apiFetch<unknown>("/api/v1/admin/export", { token: session.token });
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `portlogistics-hub-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
      setMsg({ kind: "ok", text: "Đã tải file sao lưu." });
    } catch (e) { onAuthError(e); setMsg({ kind: "error", text: e instanceof Error ? e.message : String(e) }); }
  };

  const doImport = async (file: File) => {
    let data: unknown;
    try { data = JSON.parse(await file.text()); } catch { setMsg({ kind: "error", text: "File không phải JSON hợp lệ." }); return; }
    if (!window.confirm("Khôi phục sẽ GHI ĐÈ toàn bộ nhóm, phần mềm, tài liệu, demo, khoá học và liên kết bằng nội dung trong file.\nTài khoản người dùng và nhật ký được giữ nguyên.\n\nTiếp tục?")) return;
    setBusy(true);
    try {
      const r = await apiFetch<{ imported: Record<string, number> }>("/api/v1/admin/import?confirm=true",
        { method: "POST", body: JSON.stringify(data), token: session.token, timeoutMs: 30000 });
      setMsg({ kind: "ok", text: `Đã khôi phục: ${Object.entries(r.imported).map(([k, v]) => `${v} ${k}`).join(", ")}.` });
    } catch (e) { onAuthError(e); setMsg({ kind: "error", text: e instanceof ApiError ? e.message : String(e) }); }
    finally { setBusy(false); if (fileRef.current) fileRef.current.value = ""; }
  };

  return (
    <Panel title="Sao lưu và khôi phục">
      {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
      <div className="grid gap-6 md:grid-cols-2">
        <div className="rounded-xl border border-line p-5">
          <h2 className="font-semibold">Xuất (Export)</h2>
          <p className="mt-1 text-sm text-mute">Tải toàn bộ nội dung (kể cả mục đang ẩn) về một file JSON. Nên làm sau mỗi lần cập nhật lớn — PostgreSQL miễn phí của Render không có backup và hết hạn sau 30 ngày.</p>
          <button className={`${btn.primary} mt-4`} onClick={doExport}>Tải file sao lưu</button>
        </div>
        <div className="rounded-xl border border-signal/30 p-5">
          <h2 className="font-semibold">Khôi phục (Import)</h2>
          <p className="mt-1 text-sm text-mute">Ghi đè nội dung bằng file JSON đã xuất (hoặc file <code className="font-mono">catalog.seed.json</code>). Dùng khi chuyển sang database mới.</p>
          <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={(e) => e.target.files?.[0] && doImport(e.target.files[0])} />
          <button className={`${btn.danger} mt-4`} disabled={busy} onClick={() => fileRef.current?.click()}>{busy ? "Đang khôi phục…" : "Chọn file và khôi phục"}</button>
        </div>
      </div>
    </Panel>
  );
}
