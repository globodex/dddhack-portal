"use client";
import {
  adminGenderChoices,
  type AdminDemographics,
} from "../lib/admin-demographic-filters";
import { profileDescriptionChoices } from "../lib/profile-contract";

export type AdminDemographicControls = {
  value: AdminDemographics;
  onChange: (value: AdminDemographics) => void;
  pending?: boolean;
};
export default function AdminDemographicFilters({
  value,
  onChange,
  pending,
}: AdminDemographicControls) {
  return (
    <fieldset
      className="admin-demographic-filters"
      aria-busy={pending || undefined}
    >
      <legend className="sr-only">Member profile filters</legend>
      <label>
        Gender
        <select
          aria-label="Gender"
          value={value.gender || ""}
          onChange={(event) =>
            onChange({ ...value, gender: event.target.value })
          }
        >
          <option value="">All genders</option>
          {adminGenderChoices.map((choice) => (
            <option key={choice.value} value={choice.value}>
              {choice.label}
            </option>
          ))}
        </select>
      </label>
      <label>
        Profession
        <select
          aria-label="Profession"
          value={value.profession || ""}
          onChange={(event) =>
            onChange({ ...value, profession: event.target.value })
          }
        >
          <option value="">All professions</option>
          {profileDescriptionChoices.map((choice) => (
            <option key={choice}>{choice}</option>
          ))}
        </select>
      </label>
      {(value.gender || value.profession) && (
        <button
          type="button"
          className="button secondary"
          onClick={() => onChange({ gender: "", profession: "" })}
        >
          Clear profile filters
        </button>
      )}
      {pending && <span role="status">Updating…</span>}
    </fieldset>
  );
}
