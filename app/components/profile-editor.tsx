"use client";

import { useState } from "react";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { Label } from "@/app/components/ui/label";
import { useUserPreferences } from "@/app/components/user-preferences";
import { browserTimeZone, formatDateTime, validTimeZone } from "@/lib/date-time";
import { parseProfileInput, type Profile } from "@/lib/profile";
import { saveProfile } from "@/app/profile/actions";

export function ProfileEditor() {
  const preferences = useUserPreferences();
  if (!preferences || preferences.loading) return <p role="status">Loading your profile…</p>;
  if (preferences.error || !preferences.profile) return <div role="alert" className="space-y-3"><p>{preferences.error || "Your profile is unavailable. Please sign in again."}</p><Button variant="outline" onClick={preferences.refresh}>Try again</Button></div>;
  return <ProfileForm key={preferences.profile.id} profile={preferences.profile} onSaved={preferences.update} />;
}

function ProfileForm({ profile, onSaved }: { profile: Profile; onSaved: (profile: Profile) => void }) {
  const [firstName, setFirstName] = useState(profile.first_name);
  const [lastName, setLastName] = useState(profile.last_name);
  const [timezone, setTimezone] = useState(profile.timezone ?? browserTimeZone());
  const [zones] = useState(() => [...new Set(["UTC", browserTimeZone(), ...(profile.timezone ? [profile.timezone] : []), ...Intl.supportedValuesOf("timeZone")])].sort());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  return <form className="space-y-5" onChange={() => setSaved(false)} onSubmit={async event => {
    event.preventDefault(); setError(""); setSaved(false);
    try {
      const input = parseProfileInput({ first_name: firstName, last_name: lastName, timezone });
      setBusy(true);
      const result = await saveProfile(input);
      if (result.error) throw new Error(result.error);
      if (!result.profile) throw new Error("Profile was not saved.");
      setFirstName(result.profile.first_name); setLastName(result.profile.last_name); setTimezone(result.profile.timezone!);
      onSaved(result.profile); setSaved(true);
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Your profile could not be saved."); }
    finally { setBusy(false); }
  }}>
    <div className="grid gap-5 sm:grid-cols-2">
      <div className="space-y-2"><Label htmlFor="first-name">First name</Label><Input id="first-name" name="given-name" autoComplete="given-name" maxLength={100} value={firstName} disabled={busy} onChange={event => setFirstName(event.target.value)} /></div>
      <div className="space-y-2"><Label htmlFor="last-name">Last name</Label><Input id="last-name" name="family-name" autoComplete="family-name" maxLength={100} value={lastName} disabled={busy} onChange={event => setLastName(event.target.value)} /></div>
    </div>
    <div className="space-y-2"><Label htmlFor="timezone">Time zone</Label><Input id="timezone" name="timezone" list="timezones" autoComplete="off" aria-describedby="timezone-help" required maxLength={100} value={timezone} disabled={busy} onChange={event => setTimezone(event.target.value)} /><datalist id="timezones">{zones.map(zone => <option key={zone} value={zone} />)}</datalist><p id="timezone-help" className="text-sm text-muted-foreground">Search for a city or region, such as America/New_York. Displayed dates follow this preference, including daylight saving time. Until you save a preference, your browser’s time zone is used.</p></div>
    {validTimeZone(timezone) ? <p className="text-sm text-muted-foreground">Example: {formatDateTime("2026-10-23T18:00:00Z", timezone)}</p> : null}
    {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
    {saved ? <p role="status" className="text-sm text-primary">Profile saved.</p> : null}
    <Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save profile"}</Button>
  </form>;
}
