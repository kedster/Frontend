let SQL;
let db = null;

// Map to hold uploaded files data keyed by file input id (file1..file5)
const filesData = new Map();

const createDbBtn = document.getElementById('createDbBtn');
const runQueryBtn = document.getElementById('runQueryBtn');
const tablesDisplay = document.getElementById('tablesDisplay');
const resultsDiv = document.getElementById('results');
const sqlTextarea = document.getElementById('sql');

async function initSqlJs() {
  SQL = await initSqlJs({
    locateFile: file => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.8.0/${file}`
  });
  // Enable upload button once SQL.js is ready
  updateCreateDbButtonState();
}

initSqlJs();

function updateCreateDbButtonState() {
  createDbBtn.disabled = filesData.size === 0;
}

function updateRunQueryButtonState(enabled) {
  runQueryBtn.disabled = !enabled;
}

// Attach change event listeners to the 5 file inputs
for (let i = 1; i <= 5; i++) {
  const input = document.getElementById(`file${i}`);
  const statusSpan = document.getElementById(`status${i}`);

  input.addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) {
      filesData.delete(input.id);
      statusSpan.textContent = '';
      statusSpan.className = 'file-status-text';
      updateCreateDbButtonState();
      return;
    }

    if (!file.name.toLowerCase().endsWith('.csv')) {
      statusSpan.textContent = 'Error: Not a CSV file';
      statusSpan.className = 'file-status-text error';
      filesData.delete(input.id);
      updateCreateDbButtonState();
      return;
    }

    const reader = new FileReader();
    reader.onload = event => {
      filesData.set(input.id, { name: file.name, content: event.target.result });
      statusSpan.textContent = 'Loaded Successfully';
      statusSpan.className = 'file-status-text success';
      updateCreateDbButtonState();
    };
    reader.onerror = () => {
      statusSpan.textContent = 'Error reading file';
      statusSpan.className = 'file-status-text error';
      filesData.delete(input.id);
      updateCreateDbButtonState();
    };
    reader.readAsText(file);
  });
}

// Simple CSV parser
function parseCSV(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim() !== '');
  if (lines.length === 0) return { columns: [], rows: [] };

  const rows = [];
  const columns = [];

  function splitCSVLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"' && (i === 0 || line[i-1] !== '\\')) {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim().replace(/^"|"$/g, ''));
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current.trim().replace(/^"|"$/g, ''));
    return result
