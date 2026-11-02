import { useEffect, useRef, useState } from "react";
import { Btn, Input, Select, Spinner, usePortal } from "./lib";
export function JurisdictionFields({ values, state, onChange }) {
  const { api, setError } = usePortal();
  const apiRef = useRef(api);
  apiRef.current = api;
  const [options, setOptions] = useState([]),
    [loading, setLoading] = useState(false),
    [fetched, setFetched] = useState(false),
    [training, setTraining] = useState(false),
    [manual, setManual] = useState(false);
  const signature = [
    state,
    values.pincode,
    values.district,
    values.latitude,
    values.longitude,
    values.address,
    values.street,
  ].join(":");
  const previous = useRef(signature);
  useEffect(() => {
    if (previous.current !== signature) {
      previous.current = signature;
      setFetched(false);
      setManual(false);
      setOptions([]);
      if (values.jurisdiction || values.centreJurisdiction)
        onChange({
          jurisdiction: "",
          ward: "",
          centreJurisdiction: "",
          commissionerate: "",
          division: "",
          range: "",
        });
    }
  }, [signature]);
  const fetchList = async () => {
    setLoading(true);
    try {
      const result = await apiRef.current(
        "/workspace/registration/jurisdictions",
        {
          state,
          pincode: values.pincode,
          district: values.district,
          latitude: values.latitude,
          longitude: values.longitude,
        },
      );
      setOptions(result.rows);
      setTraining(result.trainingOnly);
      setFetched(true);
      setManual(false);
      if (result.rows.length === 1) select(result.rows[0], result.trainingOnly);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };
  const select = (row, isTraining = training) =>
    onChange({
      jurisdiction: row.stateJurisdiction,
      ward: row.ward,
      centreJurisdiction: [row.commissionerate, row.division, row.range].join(
        " / ",
      ),
      commissionerate: row.commissionerate,
      division: row.division,
      range: row.range,
      jurisdictionTrainingOnly: isTraining,
    });
  return (
    <section className="jurisdiction-fields">
      <h3>Jurisdiction Details</h3>
      <div className="actions">
        <Btn
          tone="secondary"
          disabled={
            loading ||
            !/^\d{6}$/.test(values.pincode || "") ||
            !values.address ||
            !values.city
          }
          onClick={fetchList}
        >
          GET STATE JURISDICTION
        </Btn>
        <Btn
          tone="secondary"
          disabled={!fetched && !values.jurisdiction}
          onClick={() => {
            setFetched(false);
            setManual(true);
            onChange({
              jurisdiction: "",
              ward: "",
              centreJurisdiction: "",
              commissionerate: "",
              division: "",
              range: "",
            });
          }}
        >
          RESET JURISDICTION
        </Btn>
        {loading && <Spinner label="Fetching jurisdiction options" />}
      </div>
      {training && fetched && (
        <p className="muted">
          Training directory. Your instructor can supply jurisdiction mappings
          for a specific exercise.
        </p>
      )}
      <div className="form-grid">
        <Select
          label="State Jurisdiction / Ward"
          disabled={
            !(fetched || manual) ||
            (state === "Gujarat" && fetched && options.length === 1)
          }
          options={options.map((row, index) => [
            String(index),
            `${row.stateJurisdiction} / ${row.ward}`,
          ])}
          value={String(
            options.findIndex(
              (row) =>
                row.ward === values.ward &&
                row.stateJurisdiction === values.jurisdiction,
            ),
          )}
          onChange={(e) => select(options[Number(e.target.value)])}
        />
        <Select
          label="Centre Jurisdiction"
          disabled={
            !(fetched || manual) ||
            (state === "Gujarat" && fetched && options.length === 1)
          }
          options={options.map((row, index) => [
            String(index),
            [row.commissionerate, row.division, row.range].join(" / "),
          ])}
          value={String(
            options.findIndex(
              (row) =>
                row.range === values.range && row.division === values.division,
            ),
          )}
          onChange={(e) => select(options[Number(e.target.value)])}
        />
      </div>
      {values.centreJurisdiction && !fetched && (
        <p>
          Saved jurisdiction: {values.jurisdiction} / {values.ward} ·{" "}
          {values.centreJurisdiction}. Fetch the list to revise it.
        </p>
      )}
    </section>
  );
}
