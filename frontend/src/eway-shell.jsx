import { useState } from "react";
import { Btn, Panel, usePortal } from "./lib";
export function EwayBrand({ onHome }) {
  return (
    <header className="eway-brandbar">
      <button className="eway-identity" onClick={onHome}>
        <img src="/eway-emblem.png" alt="National Emblem of India" />
        <strong>
          Goods and Services Tax
          <br />E - Waybill System
        </strong>
      </button>
      <div className="eway-brand-logos">
        <img src="/eway-gst-logo.png" alt="One Nation One Tax One Market" />
        <img src="/eway-nic-logo.png" alt="National Informatics Centre" />
      </div>
    </header>
  );
}
export function EwayHome({ onLogin, onRegister }) {
  const { go } = usePortal();
  const [info, setInfo] = useState("");
  return (
    <div className="eway-home">
      <EwayBrand onHome={() => setInfo("")} />
      <nav className="eway-public-nav">
        {[
          "Home",
          "Forms",
          "Help",
          "Search",
          "Registration",
          "Statistics",
          "Contact Us",
          "Site Map",
          "Documents",
          "Media",
        ].map((name) => (
          <button
            key={name}
            onClick={() =>
              name === "Registration"
                ? onRegister()
                : setInfo(name === "Home" ? "" : name)
            }
          >
            {name}
            {["Help", "Search", "Registration"].includes(name) ? " ▾" : ""}
          </button>
        ))}
        <button onClick={onLogin}>Login ➜</button>
        <button onClick={() => go("dashboard")}>GST Portal ↗</button>
      </nav>
      {info ? (
        <div className="eway-home-info">
          <Panel title={info}>
            <p>
              {info === "Search"
                ? "Search generated e-way bills by their number after logging in."
                : info === "Forms" || info === "Documents"
                  ? "Prepare invoice details, upload e-way bill JSON, and review the generated EWB-01 in the portal."
                  : "Use Registration to create portal credentials. After login, use Generate New, Generate Bulk, Update Vehicle or Cancel."}
            </p>
            <Btn onClick={onLogin}>LOGIN</Btn>
          </Panel>
        </div>
      ) : (
        <div className="eway-home-grid">
          <section>
            <img
              className="eway-hero"
              src="/eway-banner.jpg"
              alt="E-way bill transportation and logistics"
            />
            <p className="eway-intro">
              E-Way bill system — prepare goods movement details, generate e-way
              bills, and manage transportation documents.
            </p>
          </section>
          <section className="eway-updates">
            <h2>Latest Updates</h2>
            {[
              [
                "24 OCT",
                "Working date selection is available for historical return periods.",
              ],
              [
                "20 OCT",
                "Bulk JSON upload supports item-wise invoices and transportation details.",
              ],
              [
                "16 OCT",
                "Review Part A, Part B and document totals before generation.",
              ],
            ].map(([d, t]) => (
              <article key={d}>
                <b>
                  {d}
                  <br />
                  2026
                </b>
                <p>{t}</p>
              </article>
            ))}
          </section>
        </div>
      )}
    </div>
  );
}
