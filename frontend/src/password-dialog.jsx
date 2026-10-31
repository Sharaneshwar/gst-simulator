import { useState } from "react";
import { Btn, Input, Modal, usePortal } from "./lib";
export function PasswordDialog({ target, onClose, onSaved }) {
  const { user, api, setError } = usePortal();
  const own = !target || target.id === user.id;
  const [currentPassword, setCurrent] = useState("");
  const [newPassword, setNew] = useState("");
  const [confirmPassword, setConfirm] = useState("");
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <Modal
      title={own ? "Change Password" : "Reset Student Password"}
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <p>
        {own
          ? "Enter your current password and choose a new password. Other sessions will be signed out."
          : `Set a new password for ${target.email}. The student will be signed out; their saved work will stay intact. Share the new password with them.`}
      </p>
      {!own && (
        <p>This resets the password only. Account access stays unchanged.</p>
      )}
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setError("");
          setBusy(true);
          try {
            if (newPassword !== confirmPassword)
              throw Error("The new passwords do not match.");
            const result = await api(
              own
                ? "/account/password"
                : `/instructor/users/${target.id}/password/reset`,
              { currentPassword, newPassword, confirmPassword },
            );
            await onSaved(result);
          } catch (error) {
            setError(error.message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {own && (
          <Input
            label="Current Password"
            required
            type={visible ? "text" : "password"}
            autoComplete="current-password"
            value={currentPassword}
            onChange={(e) => setCurrent(e.target.value)}
            maxLength={128}
            disabled={busy}
          />
        )}
        <Input
          label="New Password"
          required
          type={visible ? "text" : "password"}
          autoComplete="new-password"
          minLength={8}
          maxLength={128}
          help="Use 8–128 characters. Passwords are case-sensitive."
          value={newPassword}
          onChange={(e) => setNew(e.target.value)}
          disabled={busy}
        />
        <Input
          label="Confirm New Password"
          required
          type={visible ? "text" : "password"}
          autoComplete="new-password"
          minLength={8}
          maxLength={128}
          value={confirmPassword}
          onChange={(e) => setConfirm(e.target.value)}
          disabled={busy}
        />
        <label className="check-line">
          <input
            type="checkbox"
            checked={visible}
            onChange={(e) => setVisible(e.target.checked)}
          />
          Show passwords
        </label>
        <div className="actions">
          <Btn type="button" tone="secondary" disabled={busy} onClick={onClose}>
            CANCEL
          </Btn>
          <Btn type="submit" loading={busy}>
            {own ? "CHANGE PASSWORD" : "RESET PASSWORD"}
          </Btn>
        </div>
      </form>
    </Modal>
  );
}
