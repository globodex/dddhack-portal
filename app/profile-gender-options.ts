/** Current editor choices. Older saved values remain intact in storage. */
export const profileGenderChoices = [
  { key: "man", label: "Male" },
  { key: "woman", label: "Female" },
  { key: "non-binary", label: "Non-binary" },
] as const;

type GenderBucket = { key: string; label: string; value: number };

/** Presentation only: reconcile every aggregate without exposing raw legacy text. */
export function genderBreakdownDisplay(buckets: readonly GenderBucket[]) {
  const current = new Set<string>(
    profileGenderChoices.map((choice) => choice.key),
  );
  return {
    choices: profileGenderChoices.map((choice) => ({
      ...choice,
      value: buckets
        .filter((bucket) => bucket.key === choice.key)
        .reduce((sum, bucket) => sum + bucket.value, 0),
    })),
    notProvided: buckets
      .filter((bucket) => bucket.key === "not-provided")
      .reduce((sum, bucket) => sum + bucket.value, 0),
    otherSaved: buckets
      .filter(
        (bucket) => bucket.key !== "not-provided" && !current.has(bucket.key),
      )
      .reduce((sum, bucket) => sum + bucket.value, 0),
  };
}
