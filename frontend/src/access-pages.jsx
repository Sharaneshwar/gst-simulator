import { useEffect, useState } from "react";
import {
  Btn,
  Crumbs,
  Input,
  Modal,
  Panel,
  Select,
  Table,
  usePortal,
} from "./lib";
import "./access.css";

const roleLabel = (role) => (role === "instructor" ? "Instructor" : "Student");
const timestamp = (value) =>
  value
    ? new Date(value).toLocaleString("en-IN", {
        timeZone: "Asia/Kolkata",
        dateStyle: "medium",
        timeStyle: "short",
      })
    : "Not yet";
const invitationStatus = (user) =>
  user.accessStatus === "revoked"
    ? "Revoked"
    : user.deliveryStatus === "failed"
      ? "Delivery failed"
      : Date.parse(user.inviteExpiresAt) <= Date.now()
        ? "Expired"
        : user.deliveryStatus === "sent"
          ? "Awaiting first login"
          : "Sending";

export function UserAccess() {
  const { user, token, api, setError, setNotice } = usePortal();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("onboarded");
  const [search, setSearch] = useState("");
  const [invite, setInvite] = useState(null);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState(null);
  const [reviewNote, setReviewNote] = useState("");
  async function refresh() {
    const result = await api("/instructor/users");
    setUsers(result.users);
  }
  useEffect(() => {
    if (user.role !== "instructor") return;
    let live = true;
    const fetchUsers = () =>
      api("/instructor/users")
        .then((data) => {
          if (live) {
            setUsers(data.users);
            setLoading(false);
          }
        })
        .catch((error) => {
          if (live) {
            setError(error.message);
            setLoading(false);
          }
        });
    fetchUsers();
    const timer = setInterval(fetchUsers, 60000);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [token, user.role]);
  if (user.role !== "instructor")
    return (
      <div className="container page-space">
        <Panel title="Access restricted">
          Only instructors can manage users.
        </Panel>
      </div>
    );
  const filtered = users.filter(
    (item) =>
      (tab === "onboarded"
        ? item.accessStatus === "onboarded"
        : item.accessStatus !== "onboarded") &&
      `${item.name} ${item.email} ${item.role} ${item.business?.gstin || ""}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const detail = users.find((item) => item.id === selected);
  async function action(item, suffix, body = {}) {
    const result = await api(`/instructor/users/${item.id}/${suffix}`, body);
    await refresh();
    setNotice(result.message);
  }
  return (
    <div className="container access-page">
      <Crumbs items={["User Access"]} />
      <div className="dashboard-title">
        <h1>User Access</h1>
        <Btn
          onClick={() => {
            setError("");
            setInvite({
              name: "",
              email: "",
              role: "student",
              tradeName: "",
              gstin: "",
            });
          }}
        >
          INVITE USER
        </Btn>
      </div>
      <Panel
        title="Manage portal access"
        extra={
          <button
            className="link"
            onClick={() => refresh().catch((error) => setError(error.message))}
          >
            Refresh
          </button>
        }
      >
        <p>
          Invite students and instructors. Student accounts each represent one
          business; their email belongs to the person using the account.
        </p>
        <div className="access-toolbar">
          <div className="tabs" role="tablist" aria-label="Account status">
            {[
              ["onboarded", "Onboarded"],
              ["invited", "Invited"],
            ].map(([value, label]) => (
              <button
                key={value}
                role="tab"
                aria-selected={tab === value}
                className={tab === value ? "active" : ""}
                onClick={() => setTab(value)}
              >
                {label} (
                {
                  users.filter((item) =>
                    value === "onboarded"
                      ? item.accessStatus === "onboarded"
                      : item.accessStatus !== "onboarded",
                  ).length
                }
                )
              </button>
            ))}
          </div>
          <Input
            label="Find a user"
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Business, email or role"
          />
        </div>
        {loading ? (
          <p role="status">Loading users…</p>
        ) : (
          <Table
            count={filtered.length}
            columns={
              tab === "onboarded"
                ? [
                    "Business / Name",
                    "Email",
                    "Role",
                    "First accessed (IST)",
                    "Last accessed (IST)",
                    "Access",
                    "Details",
                  ]
                : [
                    "Business / Name",
                    "Email",
                    "Role",
                    "Invited (IST)",
                    "Status",
                    "Actions",
                  ]
            }
            empty={
              tab === "onboarded"
                ? "No onboarded users found."
                : "No invitations found."
            }
          >
            {filtered.map((item) => (
              <tr key={item.id}>
                <td>
                  <strong>{item.name}</strong>
                  {item.amendment?.status === "Pending" && (
                    <span className="access-badge">Amendment pending</span>
                  )}
                </td>
                <td>
                  {item.email}
                  {item.id === user.id && (
                    <small className="access-muted">Your account</small>
                  )}
                </td>
                <td>{roleLabel(item.role)}</td>
                {tab === "onboarded" ? (
                  <>
                    <td>{timestamp(item.firstAccessAt)}</td>
                    <td>{timestamp(item.lastAccessAt)}</td>
                    <td>
                      <button
                        className={`access-switch ${item.isEnabled ? "is-active" : ""}`}
                        role="switch"
                        aria-checked={item.isEnabled}
                        aria-label={`Access for ${item.email}`}
                        disabled={item.id === user.id}
                        title={
                          item.id === user.id
                            ? "You cannot deactivate your own account"
                            : "Change account access"
                        }
                        onClick={() => {
                          if (
                            item.isEnabled &&
                            !window.confirm(
                              `Deactivate ${item.email}? Existing sessions will end immediately.`,
                            )
                          )
                            return;
                          action(item, "access", {
                            enabled: !item.isEnabled,
                          }).catch((error) => setError(error.message));
                        }}
                      >
                        <span />
                        {item.isEnabled ? "Active" : "Inactive"}
                      </button>
                    </td>
                    <td>
                      <Btn
                        tone="secondary"
                        onClick={() => {
                          setSelected(item.id);
                          setReviewNote("");
                        }}
                      >
                        VIEW
                      </Btn>
                    </td>
                  </>
                ) : (
                  <>
                    <td>{timestamp(item.invitedAt)}</td>
                    <td>
                      <span className="access-badge">
                        {invitationStatus(item)}
                      </span>
                      <small className="access-muted">
                        Expires: {timestamp(item.inviteExpiresAt)}
                      </small>
                    </td>
                    <td>
                      <div className="access-actions">
                        <Btn
                          tone="secondary"
                          onClick={() => action(item, "resend")}
                        >
                          RESEND
                        </Btn>
                        {item.accessStatus !== "revoked" && (
                          <Btn
                            tone="danger"
                            onClick={() => {
                              if (
                                window.confirm(
                                  `Revoke the invitation for ${item.email}?`,
                                )
                              )
                                return action(item, "revoke");
                            }}
                          >
                            REVOKE
                          </Btn>
                        )}
                      </div>
                    </td>
                  </>
                )}
              </tr>
            ))}
          </Table>
        )}
      </Panel>
      {invite && (
        <Modal
          title="Invite a user"
          onClose={() => {
            if (!busy) setInvite(null);
          }}
        >
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError("");
              try {
                const result = await api("/instructor/users/invite", invite);
                await refresh();
                setTab("invited");
                setInvite(null);
                setNotice(result.message);
              } catch (error) {
                setError(error.message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <Select
              label="Role"
              required
              value={invite.role}
              options={[
                ["student", "Student"],
                ["instructor", "Instructor"],
              ]}
              onChange={(e) => setInvite({ ...invite, role: e.target.value })}
            />
            <Input
              label={
                invite.role === "student"
                  ? "Legal Name of Business"
                  : "Instructor Name"
              }
              required
              maxLength={80}
              minLength={2}
              value={invite.name}
              onChange={(e) => setInvite({ ...invite, name: e.target.value })}
            />
            <Input
              label="Contact / Login Email"
              required
              type="email"
              maxLength={254}
              value={invite.email}
              onChange={(e) => setInvite({ ...invite, email: e.target.value })}
            />
            {invite.role === "student" && (
              <>
                <Input
                  label="Trade Name (optional)"
                  maxLength={80}
                  value={invite.tradeName}
                  onChange={(e) =>
                    setInvite({ ...invite, tradeName: e.target.value })
                  }
                />
                <Input
                  label="Dummy GSTIN (optional)"
                  maxLength={15}
                  value={invite.gstin}
                  onChange={(e) =>
                    setInvite({
                      ...invite,
                      gstin: e.target.value.toUpperCase(),
                    })
                  }
                  help="Leave blank to use the default practice GSTIN. Dummy GSTINs can repeat across student accounts."
                />
              </>
            )}
            <p>
              A unique, case-sensitive six-letter password will be emailed to
              this person. They must first sign in within 48 hours.
            </p>
            <div className="actions">
              <Btn
                type="button"
                tone="secondary"
                disabled={busy}
                onClick={() => setInvite(null)}
              >
                CANCEL
              </Btn>
              <Btn type="submit" disabled={busy}>
                {busy ? "SENDING…" : "SEND INVITATION"}
              </Btn>
            </div>
          </form>
        </Modal>
      )}
      {detail && (
        <Modal title="Account details" onClose={() => setSelected(null)}>
          <dl className="details-list">
            <dt>Name / Business</dt>
            <dd>{detail.name}</dd>
            <dt>Email</dt>
            <dd>{detail.email}</dd>
            <dt>Role</dt>
            <dd>{roleLabel(detail.role)}</dd>
            {detail.business && (
              <>
                <dt>GSTIN</dt>
                <dd>{detail.business.gstin}</dd>
                <dt>Trade Name</dt>
                <dd>{detail.business.tradeName}</dd>
              </>
            )}
          </dl>
          {detail.amendment && (
            <section className="access-review">
              <h3>Core-field amendment — {detail.amendment.status}</h3>
              <p>Submitted: {timestamp(detail.amendment.submittedAt)}</p>
              <p>
                Legal name: {detail.amendment.original.legalName} →{" "}
                <strong>{detail.amendment.legalName}</strong>
              </p>
              <p>
                Trade name: {detail.amendment.original.tradeName} →{" "}
                <strong>{detail.amendment.tradeName}</strong>
              </p>
              <p>Reason: {detail.amendment.reason}</p>
              {detail.amendment.status === "Pending" ? (
                <>
                  <Input
                    label="Review note (optional)"
                    maxLength={500}
                    value={reviewNote}
                    onChange={(e) => setReviewNote(e.target.value)}
                  />
                  <p>This approval applies only to the practice business.</p>
                  <div className="actions">
                    <Btn
                      tone="danger"
                      onClick={() =>
                        action(detail, "business-amendment", {
                          decision: "reject",
                          amendmentId: detail.amendment.id,
                          note: reviewNote,
                        })
                      }
                    >
                      REJECT
                    </Btn>
                    <Btn
                      onClick={() =>
                        action(detail, "business-amendment", {
                          decision: "approve",
                          amendmentId: detail.amendment.id,
                          note: reviewNote,
                        })
                      }
                    >
                      APPROVE AMENDMENT
                    </Btn>
                  </div>
                </>
              ) : (
                <p>
                  Reviewed: {timestamp(detail.amendment.reviewedAt)}
                  {detail.amendment.note && ` — ${detail.amendment.note}`}
                </p>
              )}
            </section>
          )}
        </Modal>
      )}
    </div>
  );
}

export function MyProfile() {
  const { user, active, api, load, setError, setNotice, go } = usePortal();
  const [name, setName] = useState(user.name);
  const [amending, setAmending] = useState(false);
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  const business = active.state.taxpayer;
  async function submit(e, path, body) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await api(path, body);
      await load();
      setAmending(false);
      setNotice(result.message);
    } catch (error) {
      setError(error.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="container access-page">
      <Crumbs items={["My Profile"]} />
      <h1>My Profile</h1>
      <Panel title="Account details">
        <dl className="details-list">
          <dt>Role</dt>
          <dd>{roleLabel(user.role)}</dd>
          <dt>Contact / Login Email</dt>
          <dd>{user.email}</dd>
          <dt>First Accessed (IST)</dt>
          <dd>{timestamp(user.firstAccessAt)}</dd>
          <dt>Last Accessed (IST)</dt>
          <dd>{timestamp(user.lastAccessAt)}</dd>
        </dl>
        {user.role === "instructor" && (
          <form
            className="access-profile-form"
            onSubmit={(e) => submit(e, "/account/profile", { name })}
          >
            <Input
              label="Instructor Name"
              required
              minLength={2}
              maxLength={80}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <Btn type="submit" disabled={busy}>
              SAVE NAME
            </Btn>
            <Btn type="button" tone="secondary" onClick={() => go("access")}>
              USER ACCESS
            </Btn>
          </form>
        )}
      </Panel>
      <Panel
        title={
          user.role === "student"
            ? "Business details"
            : "Selected practice business"
        }
      >
        <Table columns={["Particulars", "Details"]}>
          {Object.entries(business).map(([key, value]) => (
            <tr key={key}>
              <td className="capitalize">{key.replace(/([A-Z])/g, " $1")}</td>
              <td>{value}</td>
            </tr>
          ))}
        </Table>
        {user.role === "student" ? (
          <>
            <p>
              Your account is linked to this business. All supported return
              periods and documents are available within it.
            </p>
            <p>
              Legal and trade names are registration core fields. Submit an
              amendment instead of editing your profile; GSTIN and PAN stay
              unchanged.
            </p>
            <Btn
              disabled={user.amendment?.status === "Pending"}
              onClick={() => {
                setForm({
                  legalName: business.legalName,
                  tradeName: business.tradeName,
                  reason: "",
                  declaration: false,
                });
                setAmending(true);
              }}
            >
              AMEND BUSINESS NAME
            </Btn>
            {user.amendment && (
              <div className="access-review">
                <strong>Last amendment: {user.amendment.status}</strong>
                <p>
                  {user.amendment.legalName} / {user.amendment.tradeName}
                </p>
                <p>Submitted: {timestamp(user.amendment.submittedAt)}</p>
                {user.amendment.note && (
                  <p>Review note: {user.amendment.note}</p>
                )}
              </div>
            )}
          </>
        ) : (
          <div className="actions">
            <Btn onClick={() => go("business")}>SWITCH BUSINESS</Btn>
          </div>
        )}
      </Panel>
      {amending && (
        <Modal
          title="Amendment of Registration — Core Fields"
          onClose={() => {
            if (!busy) setAmending(false);
          }}
        >
          <form
            onSubmit={(e) => submit(e, "/account/business-amendment", form)}
          >
            <p>
              GSTIN: <strong>{business.gstin}</strong> · PAN:{" "}
              <strong>{business.pan}</strong>
            </p>
            <Input
              label="Legal Name of Business"
              required
              minLength={2}
              maxLength={80}
              value={form.legalName}
              onChange={(e) => setForm({ ...form, legalName: e.target.value })}
            />
            <Input
              label="Trade Name"
              required
              minLength={2}
              maxLength={80}
              value={form.tradeName}
              onChange={(e) => setForm({ ...form, tradeName: e.target.value })}
            />
            <Input
              label="Reason for Amendment"
              required
              minLength={5}
              maxLength={500}
              value={form.reason}
              onChange={(e) => setForm({ ...form, reason: e.target.value })}
            />
            <label className="access-declaration">
              <input
                type="checkbox"
                required
                checked={form.declaration}
                onChange={(e) =>
                  setForm({ ...form, declaration: e.target.checked })
                }
              />
              I confirm these changes do not involve a change of PAN.
            </label>
            <p>
              Your instructor will review this amendment for the practice
              portal. Existing return records are retained.
            </p>
            <div className="actions">
              <Btn
                type="button"
                tone="secondary"
                disabled={busy}
                onClick={() => setAmending(false)}
              >
                CANCEL
              </Btn>
              <Btn type="submit" disabled={busy}>
                SUBMIT AMENDMENT
              </Btn>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
