const { DatabaseSync } = require('node:sqlite');
const path = require('path');

const db = new DatabaseSync(path.join(__dirname, 'database.db'));
const tables = [
  'users',
  'settings',
  'subjects',
  'timetables',
  'notices',
  'daily_lectures',
  'attendance_sessions',
  'attendance_records',
  'courses',
  'assignments',
  'study_materials',
  'marks_registry'
];

console.log("=== SQLITE SOURCE DATABASE REPORT ===");
tables.forEach(tableName => {
  try {
    const count = db.prepare(`SELECT count(*) as count FROM ${tableName}`).get().count;
    console.log(`- Table ${tableName}: ${count} rows`);
  } catch (e) {
    console.log(`- Table ${tableName}: does not exist or failed (${e.message})`);
  }
});
console.log("=====================================\n");
console.log("To verify MySQL migration, run this query in your MySQL console after importing mysql_data_dump.sql:");
console.log(tables.map(t => `SELECT '${t}' as \`table\`, count(*) as \`count\` FROM \`${t}\``).join("\nUNION ALL\n") + ";");
