import { useState } from "react";
import { Btn, Modal, usePortal } from "./lib";

export function RecomputeStatement() {
  const { w, mutate } = usePortal();
  const [confirm, setConfirm] = useState(false);
  const blocked = w.gstr2bRefreshBlocked;
  return (
    <>
      <Btn
        tone="secondary"
        disabled={!!blocked}
        title={blocked || undefined}
        onClick={() => setConfirm(true)}
      >
        RECOMPUTE GSTR-2B
      </Btn>
      {confirm && (
        <Modal title="Recompute GSTR-2B" onClose={() => setConfirm(false)}>
          <p>
            The ITC statement will be recomputed using supplier-filed records
            and the latest IMS actions. Review GSTR-3B again after this change.
          </p>
          <div className="actions">
            <Btn
              onClick={async () => {
                await mutate("ims/recompute");
                setConfirm(false);
              }}
            >
              AGREE AND CONTINUE
            </Btn>
            <Btn tone="secondary" onClick={() => setConfirm(false)}>
              CANCEL
            </Btn>
          </div>
        </Modal>
      )}
    </>
  );
}
