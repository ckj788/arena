"use client";

import type { SubmissionServiceDetails, SubmissionHistory } from "@/lib/submissionPlans";

export default function ServiceFields({ value, onChange }: {
  value: SubmissionServiceDetails;
  onChange: (value: SubmissionServiceDetails) => void;
}) {
  return <section className="submission-service-fields" aria-labelledby="directory-history-heading">
    <p className="launch-eyebrow">Directory submission details</p>
    <label htmlFor="delivery-email">Where should we send your confirmation and report?</label>
    <input id="delivery-email" type="email" autoComplete="email" value={value.email} onChange={event => onChange({ ...value, email: event.target.value })} placeholder="you@yourproduct.com" required maxLength={254} />
    <h3 id="directory-history-heading">Have you submitted to any directories already?</h3>
    <p>Share what you have tried so existing listings can be reviewed before any new submissions.</p>
    <fieldset className="submission-history-options">
      <legend className="sr-only">Previous directory submissions</legend>
      {[
        ["none", "Not yet"],
        ["provided", "Yes, I have a list"],
        ["unsure", "I’m not sure"],
      ].map(([id, label]) => <label key={id}><input type="radio" name="directory-history" value={id} checked={value.history === id} onChange={() => onChange({ ...value, history: id as SubmissionHistory })} required />{label}</label>)}
    </fieldset>
    {value.history === "provided" && <div>
      <label htmlFor="submitted-directories">Previously submitted directories</label>
      <textarea id="submitted-directories" rows={5} maxLength={8000} required value={value.directories} onChange={event => onChange({ ...value, directories: event.target.value })} placeholder={"Product Hunt — already live\nhttps://example-directory.com/your-product\nAnother directory — pending review"} />
      <p>Names, listing URLs, or a link to your submission report. Include pending submissions too. No passwords or private account links.</p>
    </div>}
  </section>;
}
