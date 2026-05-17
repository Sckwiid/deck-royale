import { useMemo, useState } from "react";
import { submitProContact } from "@/lib/api";
import { getDictionary } from "@/lib/i18n";
import type { Locale } from "@/types";

interface ProTrackingFormProps {
  locale: Locale;
}

interface FormState {
  playerTag: string;
  email: string;
  discord: string;
  message: string;
  language: Locale;
  consent: boolean;
  website: string;
}

const TAG_REGEX = /[^0289PYLQGRJCUV]/g;
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/i;

const normalizeTagInput = (value: string) => {
  const clean = value.trim().toUpperCase().replace(/^#+/, "").replace(TAG_REGEX, "");
  return clean.length >= 3 && clean.length <= 15 ? `#${clean}` : "";
};

export default function ProTrackingForm({ locale }: ProTrackingFormProps) {
  const dict = getDictionary(locale);
  const labels = dict.proTrackingPage;
  const [pending, setPending] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState<FormState>({
    playerTag: "",
    email: "",
    discord: "",
    message: "",
    language: locale,
    consent: false,
    website: ""
  });

  const normalizedTag = useMemo(() => normalizeTagInput(form.playerTag), [form.playerTag]);

  const validate = () => {
    if (!normalizedTag) {
      return labels.validation.tagRequired;
    }

    const email = form.email.trim();
    const discord = form.discord.trim();

    if (!email && !discord) {
      return labels.validation.contactRequired;
    }

    if (email && !EMAIL_RE.test(email)) {
      return labels.validation.emailInvalid;
    }

    if (!form.consent) {
      return labels.validation.consentRequired;
    }

    return "";
  };

  const onSubmit = async (event: { preventDefault: () => void }) => {
    event.preventDefault();
    setError("");
    setSuccess(false);

    if (form.website.trim()) {
      setSuccess(true);
      return;
    }

    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    setPending(true);
    try {
      await submitProContact({
        player_tag: normalizedTag,
        email: form.email.trim() || undefined,
        discord: form.discord.trim() || undefined,
        message: form.message.trim() || undefined,
        language: form.language,
        consent_contact: form.consent,
        website: form.website.trim() || undefined
      });

      setSuccess(true);
      setForm((prev) => ({
        ...prev,
        message: "",
        website: ""
      }));
    } catch {
      setError(labels.errorTitle);
    } finally {
      setPending(false);
    }
  };

  return (
    <form onSubmit={onSubmit} className="glass-panel p-5 sm:p-6">
      <h2 className="font-display text-2xl font-bold text-white">{labels.formTitle}</h2>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="text-sm text-slate-200">
          <span className="mb-1 block">{labels.fields.playerTag}</span>
          <input
            type="text"
            value={form.playerTag}
            onChange={(event) => setForm((prev) => ({ ...prev, playerTag: event.target.value }))}
            placeholder={labels.placeholders.playerTag}
            className="h-11 w-full rounded-xl border border-white/15 bg-black/35 px-3 text-white outline-none transition focus:border-cyan-300/50 focus:ring-2 focus:ring-cyan-300/20"
            autoComplete="off"
            required
          />
        </label>

        <label className="text-sm text-slate-200">
          <span className="mb-1 block">{labels.fields.email}</span>
          <input
            type="email"
            value={form.email}
            onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
            placeholder={labels.placeholders.email}
            className="h-11 w-full rounded-xl border border-white/15 bg-black/35 px-3 text-white outline-none transition focus:border-cyan-300/50 focus:ring-2 focus:ring-cyan-300/20"
            autoComplete="email"
          />
        </label>

        <label className="text-sm text-slate-200">
          <span className="mb-1 block">{labels.fields.discord}</span>
          <input
            type="text"
            value={form.discord}
            onChange={(event) => setForm((prev) => ({ ...prev, discord: event.target.value }))}
            placeholder={labels.placeholders.discord}
            className="h-11 w-full rounded-xl border border-white/15 bg-black/35 px-3 text-white outline-none transition focus:border-cyan-300/50 focus:ring-2 focus:ring-cyan-300/20"
            autoComplete="off"
          />
        </label>

        <label className="text-sm text-slate-200">
          <span className="mb-1 block">{labels.fields.language}</span>
          <select
            value={form.language}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, language: event.target.value as Locale }))
            }
            className="h-11 w-full rounded-xl border border-white/15 bg-black/35 px-3 text-white outline-none transition focus:border-cyan-300/50 focus:ring-2 focus:ring-cyan-300/20"
          >
            <option value="fr">Français</option>
            <option value="en">English</option>
          </select>
        </label>
      </div>

      <label className="mt-3 block text-sm text-slate-200">
        <span className="mb-1 block">{labels.fields.message}</span>
        <textarea
          value={form.message}
          onChange={(event) => setForm((prev) => ({ ...prev, message: event.target.value }))}
          placeholder={labels.placeholders.message}
          className="min-h-[120px] w-full rounded-xl border border-white/15 bg-black/35 px-3 py-3 text-white outline-none transition focus:border-cyan-300/50 focus:ring-2 focus:ring-cyan-300/20"
          maxLength={1200}
        />
      </label>

      <div className="sr-only">
        <label>
          Website
          <input
            type="text"
            name="website"
            value={form.website}
            onChange={(event) => setForm((prev) => ({ ...prev, website: event.target.value }))}
            autoComplete="off"
            tabIndex={-1}
          />
        </label>
      </div>

      <label className="mt-4 flex items-start gap-2 text-sm text-slate-200">
        <input
          type="checkbox"
          checked={form.consent}
          onChange={(event) => setForm((prev) => ({ ...prev, consent: event.target.checked }))}
          className="mt-1 h-4 w-4 rounded border-white/30 bg-black/40 text-cyan-300"
        />
        <span>{labels.fields.consent}</span>
      </label>

      {error ? (
        <p className="mt-3 rounded-lg border border-rose-300/30 bg-rose-300/10 px-3 py-2 text-sm text-rose-100">
          {error}
        </p>
      ) : null}

      {success ? (
        <div className="mt-3 rounded-lg border border-cyan-300/35 bg-cyan-300/10 px-3 py-3">
          <p className="font-semibold text-cyan-100">{labels.successTitle}</p>
          <p className="mt-1 text-sm text-cyan-100/90">{labels.successText}</p>
        </div>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="mt-4 inline-flex h-11 min-w-[44px] items-center justify-center rounded-xl bg-gradient-to-r from-cyan-400 via-cyan-300 to-violet-400 px-5 font-semibold text-slate-950 transition hover:scale-[1.01] hover:shadow-glow disabled:cursor-not-allowed disabled:opacity-70"
      >
        {pending ? labels.submitting : labels.submit}
      </button>
    </form>
  );
}
