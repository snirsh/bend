import { useRef, useState } from "react";
import type { useSession } from "./useSession.ts";

type Props = { readonly session: ReturnType<typeof useSession> };

const download = (text: string, name: string) => {
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

/** Out-of-the-way actions: backup export/import, finishing early, notification opt-in. */
export const Menu = ({ session }: Props) => {
  const dialog = useRef<HTMLDialogElement>(null);
  const file = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [permission, setPermission] = useState(() => (typeof Notification === "undefined" ? "unsupported" : Notification.permission));
  const { phase } = session;
  const logged = phase.kind === "active" ? phase.workout.logged.length : 0;

  const exportNow = () => {
    const text = session.exportFile();
    if (!text) return;
    download(text, `bend-backup-${new Date().toISOString().slice(0, 10)}.json`);
    setMessage({ ok: true, text: "Backup downloaded." });
  };

  const importNow = async (picked: File | undefined) => {
    if (!picked) return;
    const result = await session.importFile(await picked.text());
    setMessage({ ok: result.ok, text: result.message });
    if (file.current) file.current.value = "";
  };

  return (
    <>
      <button
        className="icon-btn"
        type="button"
        aria-label="Menu"
        aria-haspopup="dialog"
        onClick={() => {
          setMessage(null);
          dialog.current?.showModal();
        }}
      >
        <svg viewBox="0 0 18 18" fill="currentColor" aria-hidden="true">
          <circle cx="3.5" cy="9" r="1.5" />
          <circle cx="9" cy="9" r="1.5" />
          <circle cx="14.5" cy="9" r="1.5" />
        </svg>
      </button>
      <dialog className="menu" ref={dialog} aria-labelledby="menu-title" onClick={(e) => e.target === dialog.current && dialog.current.close()}>
        <h2 id="menu-title">Data</h2>
        <p>Everything stays on this device. Import adds sessions to your history and never removes any.</p>
        <div className="menu-actions">
          <button className="tbtn" type="button" onClick={exportNow}>
            Export backup
          </button>
          <button className="tbtn" type="button" onClick={() => file.current?.click()}>
            Import backup
          </button>
          <input
            ref={file}
            type="file"
            accept="application/json,.json"
            hidden
            data-testid="import-file"
            onChange={(e) => void importNow(e.target.files?.[0])}
          />
          {phase.kind === "active" && (
            <button
              className="tbtn"
              type="button"
              disabled={logged === 0}
              onClick={() => void session.finish().then((ok) => ok && dialog.current?.close())}
            >
              {logged === 0 ? "Finish early (log a set first)" : `Finish early, save ${logged} set${logged === 1 ? "" : "s"}`}
            </button>
          )}
          {permission === "default" && (
            <button
              className="tbtn"
              type="button"
              onClick={() => void Notification.requestPermission().then(setPermission)}
            >
              Notify me when rest ends
            </button>
          )}
          <button className="tbtn" type="button" onClick={() => dialog.current?.close()}>
            Close
          </button>
        </div>
        {message && (
          <p className="notice" data-tone={message.ok ? "ok" : "error"} role={message.ok ? "status" : "alert"} style={{ marginTop: 12 }}>
            {message.text}
          </p>
        )}
      </dialog>
    </>
  );
};
