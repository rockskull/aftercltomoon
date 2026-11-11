/**
 * AFTER CL TO MOON — optional 15-minute notification trigger.
 *
 * Add this as a second script file (Apps Script editor → + → 스크립트 → "Tick")
 * only after Code.gs is working. It adds two permissions the main script does not
 * need: connecting to an external service (UrlFetchApp) and running while you are
 * away (ScriptApp triggers). If Google blocks authorizing them, delete this file —
 * Vercel Cron still runs the scheduler once a day.
 *
 * Script Properties used: SITE_URL, CRON_SECRET (same value as Vercel's CRON_SECRET).
 */

/** Calls the website's notification scheduler. Installed by installTick(). */
function tick() {
  var props = PropertiesService.getScriptProperties();
  var site = props.getProperty('SITE_URL');
  var secret = props.getProperty('CRON_SECRET');
  if (!site || !secret) return;
  var res = UrlFetchApp.fetch(site.replace(/\/$/, '') + '/api/cron/notifications', {
    headers: { Authorization: 'Bearer ' + secret },
    muteHttpExceptions: true,
  });
  if (res.getResponseCode() !== 200) console.warn('tick ' + res.getResponseCode() + ' ' + res.getContentText().slice(0, 300));
}

/** Runs tick() every 15 minutes. Safe to run again (replaces the old trigger). */
function installTick() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'tick') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('tick').timeBased().everyMinutes(15).create();
}
