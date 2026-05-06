/**
 * scheduler-app Calendar adapter.
 *
 *   - POST { action: 'mutations', upserts, deletes }     → applies to Calendar (Advanced API)
 *   - GET  ?action=events                                → returns Calendar events in window
 *   - GET  ?action=clear                                 → wipes app-tagged events
 *   - GET  ?action=clearbytitles&titles=A,B              → wipes app-tagged events whose title matches
 *
 * App-managed Calendar events embed DESCRIPTION_TAG in their description so we can
 * find them again across pushes and let pull-worker skip them (loop prevention).
 *
 * Mutations use Calendar Advanced API (Calendar.Events.*) which has a separate quota
 * from CalendarApp and supports per-instance edits without cascading to the recurring series.
 */

const CALENDAR_ID = 'primary';
const DESCRIPTION_TAG = 'schedule_mgr_id:';
const DESCRIPTION_REGEX = new RegExp(`${DESCRIPTION_TAG}([\\w-]+)`, 'i');

// Sync window: -1 month / +6 months
const PAST_MONTHS = 1;
const FUTURE_MONTHS = 6;

function getSyncWindow() {
  const start = new Date();
  start.setMonth(start.getMonth() - PAST_MONTHS, 1);
  start.setHours(0, 0, 0, 0);
  const end = new Date();
  end.setMonth(end.getMonth() + FUTURE_MONTHS + 1, 0);
  end.setHours(23, 59, 59, 999);
  return { start: start, end: end };
}

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return jsonResponse({ success: false, message: 'Empty payload.' });
    }
    const payload = JSON.parse(e.postData.contents);
    const action = (payload.action || '').toLowerCase();
    if (action === 'mutations') {
      return processMutations(payload);
    }
    return jsonResponse({ success: false, message: 'Unknown action.' });
  } catch (err) {
    console.error('doPost failed:', err);
    return jsonResponse({ success: false, message: err.message || 'Failed.' });
  }
}

function doGet(e) {
  try {
    const action = e && e.parameter ? (e.parameter.action || '') : '';
    if (action === 'events') return fetchEvents();
    if (action === 'clear') return clearTaggedEvents();
    if (action === 'clearbytitles') return clearByTitles(e.parameter.titles || '');
    return jsonResponse({ success: true, message: 'scheduler Calendar adapter is running.' });
  } catch (err) {
    console.error('doGet failed:', err);
    return jsonResponse({ success: false, message: err.message || 'Failed.' });
  }
}

function processMutations(payload) {
  const upserts = Array.isArray(payload.upserts) ? payload.upserts : [];
  const deletes = Array.isArray(payload.deletes) ? payload.deletes : [];
  const calId = payload.calendarId || CALENDAR_ID;

  let created = 0, updated = 0, deleted = 0, skipped = 0, recurringMasterRejected = 0;
  const results = [];
  const errors = [];

  upserts.forEach(function (item) {
    const id = (item.id || '').trim();
    const start = item.startDateTime ? new Date(item.startDateTime) : null;
    const end = item.endDateTime ? new Date(item.endDateTime) : null;
    if (!id || !start || !end || isNaN(start.getTime()) || isNaN(end.getTime())) {
      skipped += 1;
      return;
    }
    const title = (item.title || '').trim() || 'Untitled';
    const description = sanitize(item.description || '');
    const fullDesc = DESCRIPTION_TAG + id + (description ? '\n\n' + description : '');
    const location = (item.location || '').trim();
    const allDay = Boolean(item.allDay);
    const reminder = typeof item.reminderMinutes === 'number' ? item.reminderMinutes : null;
    const body = buildEventBody(title, fullDesc, location, start, end, allDay, reminder);

    const googleEventId = stripIdSuffix(item.googleEventId);
    let existing = null;
    if (googleEventId) {
      try { existing = Calendar.Events.get(calId, googleEventId); } catch (_) { existing = null; }
    }

    if (existing) {
      if (Array.isArray(existing.recurrence) && existing.recurrence.length > 0) {
        recurringMasterRejected += 1;
        errors.push({ id: id, reason: 'recurring_master', googleEventId: googleEventId });
        return;
      }
      try {
        const patched = Calendar.Events.patch(body, calId, existing.id);
        results.push({ id: id, googleEventId: patched.id });
        updated += 1;
      } catch (err) {
        skipped += 1;
        errors.push({ id: id, reason: 'patch_failed', message: errMessage(err) });
      }
    } else {
      try {
        const inserted = Calendar.Events.insert(body, calId);
        results.push({ id: id, googleEventId: inserted.id });
        created += 1;
      } catch (err) {
        skipped += 1;
        errors.push({ id: id, reason: 'insert_failed', message: errMessage(err) });
      }
    }
  });

  deletes.forEach(function (item) {
    const id = (item.id || '').trim();
    const googleEventId = stripIdSuffix(item.googleEventId);
    if (!googleEventId) { skipped += 1; return; }
    let existing = null;
    try { existing = Calendar.Events.get(calId, googleEventId); } catch (_) { existing = null; }
    if (!existing) { skipped += 1; return; }
    if (Array.isArray(existing.recurrence) && existing.recurrence.length > 0) {
      recurringMasterRejected += 1;
      errors.push({ id: id, reason: 'recurring_master', googleEventId: googleEventId });
      return;
    }
    try {
      Calendar.Events.remove(calId, existing.id);
      deleted += 1;
    } catch (err) {
      skipped += 1;
      errors.push({ id: id, reason: 'delete_failed', message: errMessage(err) });
    }
  });

  return jsonResponse({
    success: true,
    message: 'Mutations applied.',
    created: created,
    updated: updated,
    deleted: deleted,
    skipped: skipped,
    recurringMasterRejected: recurringMasterRejected,
    results: results,
    errors: errors,
  });
}

function buildEventBody(title, description, location, start, end, allDay, reminder) {
  const body = { summary: title, description: description, location: location };
  if (allDay) {
    const s = new Date(start); s.setHours(0, 0, 0, 0);
    const e = new Date(end); e.setHours(0, 0, 0, 0); e.setDate(e.getDate() + 1);
    if (e <= s) e.setDate(s.getDate() + 1);
    const tz = Session.getScriptTimeZone();
    body.start = { date: Utilities.formatDate(s, tz, 'yyyy-MM-dd') };
    body.end = { date: Utilities.formatDate(e, tz, 'yyyy-MM-dd') };
  } else {
    body.start = { dateTime: start.toISOString() };
    body.end = { dateTime: end.toISOString() };
  }
  body.reminders = reminder !== null && reminder !== undefined
    ? { useDefault: false, overrides: [{ method: 'popup', minutes: reminder }] }
    : { useDefault: false, overrides: [] };
  return body;
}

function fetchEvents() {
  const calendar = CalendarApp.getCalendarById(CALENDAR_ID);
  if (!calendar) throw new Error('Calendar not found');
  const win = getSyncWindow();
  const events = calendar.getEvents(win.start, win.end);

  const items = events.map(function (event) {
    const rawDesc = sanitize(event.getDescription() || '');
    const m = rawDesc.match(DESCRIPTION_REGEX);
    const scheduleMgrId = m && m[1] ? m[1] : null;
    return {
      scheduleMgrId: scheduleMgrId,
      googleEventId: event.getId(),
      title: event.getTitle() || '',
      description: removeTag(rawDesc),
      location: event.getLocation() || '',
      allDay: event.isAllDayEvent(),
      startDateTime: toIso(event.isAllDayEvent() ? event.getAllDayStartDate() : event.getStartTime()),
      endDateTime: toIso(event.isAllDayEvent() ? event.getAllDayEndDate() : event.getEndTime()),
      lastUpdated: toIso(event.getLastUpdated()),
      reminderMinutes: primaryReminderMinutes(event),
    };
  });

  return jsonResponse({
    success: true,
    fetchedAt: toIso(new Date()),
    range: { start: toIso(win.start), end: toIso(win.end) },
    events: items,
  });
}

function clearTaggedEvents() {
  const calendar = CalendarApp.getCalendarById(CALENDAR_ID);
  if (!calendar) throw new Error('Calendar not found');
  const past = new Date(); past.setFullYear(past.getFullYear() - 2);
  const future = new Date(); future.setFullYear(future.getFullYear() + 2);
  const events = calendar.getEvents(past, future, { search: DESCRIPTION_TAG });
  let deleted = 0;
  events.forEach(function (e) {
    try { e.deleteEvent(); deleted += 1; } catch (err) { console.error(err); }
  });
  return jsonResponse({ success: true, deleted: deleted });
}

/**
 * Delete app-tagged events whose title matches one of the provided titles.
 * Uses Advanced Calendar API (separate quota from CalendarApp).
 * Time-budget-safe: stops after MAX_RUNTIME_MS so the caller can re-invoke until deleted=0.
 */
function clearByTitles(titlesParam) {
  const titles = String(titlesParam || '')
    .split(',')
    .map(function (t) { return t.trim(); })
    .filter(Boolean);
  if (titles.length === 0) return jsonResponse({ success: false, message: 'No titles provided.' });
  const titleSet = {};
  titles.forEach(function (t) { titleSet[t] = true; });

  const win = getSyncWindow();
  const calId = CALENDAR_ID;
  const MAX_RUNTIME_MS = 4.5 * 60 * 1000;
  const startedAt = Date.now();

  let listed = 0, scanned = 0, deleted = 0, failed = 0, remaining = 0;
  let timedOut = false;
  const errorSamples = [];

  let pageToken = null;
  outer: do {
    const resp = Calendar.Events.list(calId, {
      timeMin: win.start.toISOString(),
      timeMax: win.end.toISOString(),
      singleEvents: true,
      maxResults: 2500,
      pageToken: pageToken || undefined,
      showDeleted: false,
    });
    const items = resp.items || [];
    listed += items.length;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const title = item.summary || '';
      if (!titleSet[title]) continue;
      const desc = item.description || '';
      if (desc.indexOf(DESCRIPTION_TAG) < 0) continue;
      scanned += 1;
      if (Date.now() - startedAt > MAX_RUNTIME_MS) {
        remaining += 1;
        timedOut = true;
        continue;
      }
      try {
        Calendar.Events.remove(calId, item.id);
        deleted += 1;
        Utilities.sleep(120);
      } catch (err) {
        failed += 1;
        if (errorSamples.length < 5) {
          errorSamples.push({ title: title, eventId: item.id, message: errMessage(err) });
        }
        const msg = errMessage(err);
        if (msg.indexOf('Rate Limit') >= 0 || msg.indexOf('quota') >= 0 || msg.indexOf('Quota') >= 0) {
          Utilities.sleep(2000);
        }
      }
    }
    pageToken = resp.nextPageToken || null;
    if (timedOut) break outer;
  } while (pageToken);

  return jsonResponse({
    success: true,
    titles: titles,
    listed: listed,
    scanned: scanned,
    deleted: deleted,
    failed: failed,
    remaining: remaining,
    timedOut: timedOut,
    elapsedMs: Date.now() - startedAt,
    errorSamples: errorSamples,
  });
}

function stripIdSuffix(rawId) {
  if (!rawId) return '';
  const s = String(rawId).trim();
  return s.indexOf('@') > 0 ? s.split('@')[0] : s;
}

function sanitize(text) {
  return typeof text === 'string' ? text.replace(/\r\n/g, '\n') : '';
}

function removeTag(description) {
  const re = new RegExp(`${DESCRIPTION_TAG}[\\w-]+(?:\\s*\\n\\n)?`, 'i');
  return (description || '').replace(re, '').trim();
}

function primaryReminderMinutes(event) {
  const reminders = event.getPopupReminders();
  if (!reminders || reminders.length === 0) return null;
  const m = reminders[0].minutes;
  return typeof m === 'number' ? m : null;
}

function toIso(date) {
  if (!(date instanceof Date) || isNaN(date.getTime())) return null;
  return Utilities.formatDate(date, 'UTC', "yyyy-MM-dd'T'HH:mm:ss'Z'");
}

function errMessage(err) {
  return err && err.message ? err.message : String(err);
}

function jsonResponse(payload) {
  const out = ContentService.createTextOutput(JSON.stringify(payload));
  out.setMimeType(ContentService.MimeType.JSON);
  return out;
}
