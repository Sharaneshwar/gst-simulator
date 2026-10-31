import { useMemo, useRef, useState } from "react";
import { Btn, Modal, Spinner, Table, usePortal } from "./lib";
import { MAX_BULK_INVITES, parseInvites } from "./bulk-invites.mjs";

export function BulkInviteDialog({ users, onClose, onComplete }) {
  const { api, setError } = usePortal();
  const [text, setText] = useState("");
  const [results, setResults] = useState(null);
  const [busy, setBusy] = useState(false);
  const [processed, setProcessed] = useState(0);
  const [total, setTotal] = useState(0);
  const stop = useRef(false);
  const preview = useMemo(() => parseInvites(text, users), [text, users]);
  const rows = results || preview;
  const ready = preview.filter((row) => row.status === "ready");
  const tooMany = preview.length > MAX_BULK_INVITES;
  async function send(event) {
    event.preventDefault();
    if (busy || !ready.length || tooMany) return;
    setError("");
    setBusy(true);
    stop.current = false;
    setProcessed(0);
    setTotal(ready.length);
    const next = preview.map((row) => ({ ...row }));
    setResults([...next]);
    try {
      for (let offset = 0; offset < ready.length; offset += 5) {
        if (stop.current) break;
        const batch = ready.slice(offset, offset + 5);
        for (const row of batch)
          Object.assign(next[row.key], {
            status: "sending",
            message: "Invitation in progress",
          });
        setResults(next.map((row) => ({ ...row })));
        try {
          const response = await api("/instructor/users/invite-bulk", {
            emails: batch.map((row) => row.email),
          });
          if (
            !Array.isArray(response.results) ||
            response.results.length !== batch.length
          )
            throw Error("The invitation result could not be confirmed.");
          batch.forEach((row, index) =>
            Object.assign(next[row.key], response.results[index]),
          );
          setProcessed((value) => value + batch.length);
        } catch (error) {
          batch.forEach((row) =>
            Object.assign(next[row.key], {
              status: "unconfirmed",
              message:
                "Not confirmed. Check the invitation list before retrying.",
            }),
          );
          setError(error.message);
          stop.current = true;
        }
        setResults(next.map((row) => ({ ...row })));
      }
    } finally {
      next.forEach((row) => {
        if (row.status === "ready")
          Object.assign(row, {
            status: "not_sent",
            message: "Not sent. Start a new list to invite this address.",
          });
      });
      setResults(next.map((row) => ({ ...row })));
      setBusy(false);
      try {
        await onComplete();
      } catch (error) {
        setError(error.message);
      }
    }
  }
  const statusLabel = {
    not_sent: "Not sent",
    ready: "Ready",
    sending: "Sending",
    sent: "Accepted by email provider",
    exists: "Already exists",
    invalid: "Invalid",
    duplicate: "Duplicate skipped",
    delivery_failed: "Email failed",
    failed: "Failed",
    unconfirmed: "Check delivery status",
  };
  const sent = rows.filter((row) => row.status === "sent").length;
  return (
    <Modal
      title="Invite students in bulk"
      wide
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <form onSubmit={send} className="bulk-invite-form">
        {!results && (
          <>
            <label className="field">
              <span>
                Student email addresses <b className="required">●</b>
              </span>
              <textarea
                required
                rows={6}
                maxLength={32000}
                value={text}
                onChange={(event) => setText(event.target.value)}
                placeholder={"student1@example.com\nstudent2@example.com"}
              />
              <small>
                Paste up to {MAX_BULK_INVITES} addresses separated by new lines,
                commas or semicolons.
              </small>
            </label>
            <p>
              Each student receives their own password by email. Invitations
              expire after 48 hours. Existing accounts are skipped.
            </p>
            {tooMany ? (
              <p role="alert" className="bulk-error">
                Use no more than {MAX_BULK_INVITES} addresses at a time.
              </p>
            ) : (
              preview.length > 0 && (
                <p>
                  {ready.length} ready to invite ·{" "}
                  {preview.length - ready.length} skipped. Only ready addresses
                  will be invited.
                </p>
              )
            )}
          </>
        )}
        {results && (
          <div className="bulk-progress" aria-live="polite">
            <div>
              {busy && <Spinner />}
              <strong>
                {busy
                  ? `${processed} of ${total} processed`
                  : `${sent} invitations accepted by the email provider`}
              </strong>
            </div>
            <progress
              max={total || 1}
              value={processed}
              aria-label="Invitation progress"
            />
            {!busy && (
              <p>
                Delivery failures can be retried with Resend in the invitation
                list. Actual inbox delivery may take a little longer.
              </p>
            )}
          </div>
        )}
        {rows.length > 0 && (
          <div className="bulk-results">
            <Table columns={["Email", "Status"]} count={rows.length}>
              {rows.map((row) => (
                <tr key={row.key}>
                  <td>{row.email}</td>
                  <td>
                    <span className={`bulk-status ${row.status}`}>
                      {row.status === "sending" && <Spinner />}
                      {statusLabel[row.status]}
                    </span>
                    <small className="access-muted">{row.message}</small>
                  </td>
                </tr>
              ))}
            </Table>
          </div>
        )}
        <div className="actions">
          {busy ? (
            <Btn
              type="button"
              tone="secondary"
              onClick={() => {
                stop.current = true;
              }}
            >
              STOP AFTER CURRENT BATCH
            </Btn>
          ) : (
            <Btn type="button" tone="secondary" onClick={onClose}>
              CLOSE
            </Btn>
          )}
          {!results && (
            <Btn
              type="submit"
              disabled={!ready.length || tooMany}
              loading={busy}
            >
              SEND {ready.length || ""}{" "}
              {ready.length === 1 ? "INVITATION" : "INVITATIONS"}
            </Btn>
          )}
          {results && !busy && (
            <Btn
              type="button"
              onClick={() => {
                setResults(null);
                setText("");
                setError("");
              }}
            >
              NEW LIST
            </Btn>
          )}
        </div>
      </form>
    </Modal>
  );
}
