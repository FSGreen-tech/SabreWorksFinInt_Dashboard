/**
 * SabreFlexx dashboard — Google Sheet read endpoint.
 *
 * Kept in version control so the endpoint is reviewable; paste into the Apps
 * Script editor bound to the spreadsheet (Extensions → Apps Script).
 *
 * ─── Deploy ────────────────────────────────────────────────────────────────
 *   1. Set SHEET_ID and TOKEN below (generate a token: `openssl rand -hex 24`).
 *   2. Deploy → New deployment → Web app
 *        Execute as:  Me
 *        Who has access: Anyone
 *   3. Copy the /exec URL into the app's .env as VITE_SHEET_ENDPOINT,
 *      and the token as VITE_SHEET_TOKEN.
 *
 *   "Anyone" here means anyone who has the URL can call THIS SCRIPT — it does
 *   not make the spreadsheet itself public. The sheet stays private; the
 *   script reads it on your behalf and returns only the tabs listed in TABS.
 *
 * ─── Security note ─────────────────────────────────────────────────────────
 *   The token travels in the query string, so it lands in browser history and
 *   Google's request logs. It is a speed bump against URL discovery, not real
 *   authentication. Treat the deployed URL as a password: keep it out of
 *   commits, and redeploy with a fresh token if it leaks.
 *
 *   This is the right trade for an internal dashboard on a private sheet. If
 *   the audience ever widens, the fix is to put this behind something that
 *   authenticates people rather than URLs — the client contract does not
 *   change, only VITE_SHEET_ENDPOINT.
 *
 * ─── CORS ──────────────────────────────────────────────────────────────────
 *   /exec 302-redirects to googleusercontent.com, which returns
 *   Access-Control-Allow-Origin: *. fetch() follows this automatically, but
 *   ONLY for a simple request — the client must send a plain GET with no
 *   custom headers. Adding Content-Type triggers a preflight OPTIONS that
 *   Apps Script cannot answer. This is why the token is a query param.
 */

var SHEET_ID = 'PASTE_SPREADSHEET_ID_HERE';
var TOKEN = 'PASTE_A_LONG_RANDOM_TOKEN_HERE';

/**
 * Tabs read into the payload. Anything else in the workbook stays private.
 *
 * A tab that does not exist yet reads as an empty array rather than an error,
 * so this list can name `sales` before anyone has created it — the dashboard
 * simply omits the section until the tab appears.
 */
var TABS = ['investments', 'cash', 'projects', 'sales'];

/**
 * Write-back master switch. OFF by default, and you should think hard before
 * turning it on.
 *
 * Reads and writes share one credential — the token in the query string. With
 * writes enabled, a leaked URL stops being a data-exposure problem and becomes
 * "anyone can rewrite the sheet". The blast radius is limited to the projects
 * tab (WRITABLE_TABS below); investments and cash are never writable by this
 * script at any setting.
 *
 * Leave this off unless someone actually needs to edit budgets from the
 * dashboard. Reading is the job; writing is a convenience.
 */
var ALLOW_WRITES = false;

/** The only tab doPost may touch. Deliberately not configurable per request. */
var WRITABLE_TABS = ['projects'];

/** Refuse absurd payloads rather than clearing a tab on a malformed request. */
var MAX_WRITE_ROWS = 200;

function doGet(e) {
  try {
    var params = (e && e.parameter) || {};

    if (TOKEN && params.token !== TOKEN) {
      return json({ error: 'unauthorized' });
    }

    var ss = SpreadsheetApp.openById(SHEET_ID);
    var payload = {
      fetched_at: new Date().toISOString(),
      meta: readMeta(ss),
    };

    TABS.forEach(function (tab) {
      payload[tab] = readTab(ss, tab);
    });

    return json(payload);
  } catch (err) {
    // Surface the reason rather than letting Apps Script return an HTML
    // stack trace the client cannot parse.
    return json({ error: String(err && err.message ? err.message : err) });
  }
}

/**
 * Replace the rows of a writable tab. Used by the dashboard's "Save to sheet"
 * button for project budgets.
 *
 * The client posts Content-Type: text/plain deliberately — it is one of the
 * three CORS-safelisted types, so the request stays "simple" and never
 * triggers a preflight OPTIONS that Apps Script cannot answer. The body is
 * still JSON; only the declared type differs.
 */
function doPost(e) {
  try {
    if (!ALLOW_WRITES) {
      return json({ error: 'writes are disabled on this deployment' });
    }

    var params = (e && e.parameter) || {};
    if (TOKEN && params.token !== TOKEN) {
      return json({ error: 'unauthorized' });
    }

    var body = JSON.parse((e.postData && e.postData.contents) || '{}');

    if (WRITABLE_TABS.indexOf(body.tab) === -1) {
      return json({ error: 'tab "' + body.tab + '" is not writable' });
    }
    if (!Array.isArray(body.rows)) {
      return json({ error: 'rows must be an array' });
    }
    if (body.rows.length > MAX_WRITE_ROWS) {
      return json({ error: 'too many rows (max ' + MAX_WRITE_ROWS + ')' });
    }

    // Two people hitting Save at once would otherwise interleave a clear with
    // a write and leave the tab half-empty.
    var lock = LockService.getScriptLock();
    if (!lock.tryLock(10000)) {
      return json({ error: 'sheet is busy, try again' });
    }

    try {
      var ss = SpreadsheetApp.openById(SHEET_ID);
      var sheet = ss.getSheetByName(body.tab);
      if (!sheet) return json({ error: 'tab "' + body.tab + '" not found' });

      var lastColumn = sheet.getLastColumn();
      var keys = sheet
        .getRange(1, 1, 1, lastColumn)
        .getValues()[0]
        .map(normalizeHeader);

      var rows = body.rows.map(function (row) {
        return keys.map(function (key) {
          return row[key] === undefined || row[key] === null ? '' : row[key];
        });
      });

      // Clear the old rows but never the header.
      if (sheet.getLastRow() > 1) {
        sheet.getRange(2, 1, sheet.getLastRow() - 1, lastColumn).clearContent();
      }
      if (rows.length) {
        sheet.getRange(2, 1, rows.length, keys.length).setValues(rows);
      }

      SpreadsheetApp.flush();
      return json({ ok: true, tab: body.tab, written: rows.length });
    } finally {
      lock.releaseLock();
    }
  } catch (err) {
    return json({ error: String(err && err.message ? err.message : err) });
  }
}

/**
 * Read a tab into an array of objects keyed by its header row.
 * Headers are lowercased and snake_cased, so "At Maturity" → at_maturity.
 */
function readTab(ss, name) {
  var sheet = ss.getSheetByName(name);
  if (!sheet) return [];

  var values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];

  var keys = values[0].map(normalizeHeader);

  return values
    .slice(1)
    .filter(isNotBlank)
    .map(function (row) {
      var obj = {};
      keys.forEach(function (key, i) {
        if (key) obj[key] = cell(row[i]);
      });
      return obj;
    });
}

/** The `meta` tab is a single row of run-level context. */
function readMeta(ss) {
  var rows = readTab(ss, 'meta');
  return rows.length ? rows[0] : {};
}

function normalizeHeader(header) {
  return String(header).trim().toLowerCase().replace(/\s+/g, '_');
}

function isNotBlank(row) {
  return row.some(function (c) {
    return c !== '' && c !== null && c !== undefined;
  });
}

/**
 * Dates become ISO `YYYY-MM-DD`; everything else passes through untouched so
 * the client's normalizer stays the single place that coerces types.
 */
function cell(value) {
  if (value instanceof Date) {
    return Utilities.formatDate(value, 'UTC', 'yyyy-MM-dd');
  }
  return value;
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON
  );
}
