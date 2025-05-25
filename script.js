// script.js

let db = null;
const filesData = new Map(); // key: inputId, value: {name, content}

const fileInputs = [
  document.getElementById('fileInput1'),
  document.getElementById('fileInput2'),
  document.getElementById('fileInput3'),
  document.getElementById('fileInput4'),
  document.getElementById('fileInput5'),
];

const createDbBtn = document.getElementById('createDbBtn');
const runQueryBtn = document.getElementById('runQueryBtn');
const sqlTextarea = document.getElementById('sqlTextarea');
const resultsDiv = document.getElementById('results');
const tablesDisplay = document.getElementById('tablesDisplay');

// Initialize
runQueryBtn.disabled = true;
createDbBtn.disabled = false; // always enabled

// Helper to escape SQL identifiers like table/column names
function escapeSqlId(id) {
  return `"${id.replace(/"/g, '""')}"`;
}

// Helper to generate table name from filename
function generateTableName(filename) {
  return filename.replace(/\.csv$/i, '').replace(/[^\w]/g, '_');
}

// Parse CSV string to {columns:[], rows:[[]]}
function parseCSV(text) {
  // Simple CSV parse: split lines, split on commas, trim spaces, no quoted values support
  const lines = text.trim().split(/\r?\n/).filter(l => l.trim() !== '');
  if (lines.length === 0) return { columns: [], rows: [] };
  const columns = lines[0].split(',').map(c => c.trim());
  const rows = lines.slice(1).map(line =>
    line.split(',').map(cell => cell.trim())
  );
  return { columns, rows };
}

// Render table preview below with table name as header
function renderTablePreview(tableName, columns, rows) {
  const container = document.createElement('div');
  container.className = 'table-container';

  const title = document.createElement('h3');
  title.textContent = `Table: ${tableName}`;
  container.appendChild(title);

  const table = document.createElement('table');

  // Header
  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');
  for (const col of columns) {
    const th = document.createElement('th');
    th.textContent = col;
    headerRow.appendChild(th);
  }
  thead.appendChild(headerRow);
  table.appendChild(thead);

  // Body - show max 20 rows
  const tbody = document.createElement('tbody');
  const previewRows = rows.slice(0, 20);
  for (const row of previewRows) {
    const tr = document.createElement('tr');
    for (let i = 0; i < columns.length; i++) {
      const td = document.createElement('td');
      td.textContent = row[i] || '';
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);

  container.appendChild(table);
  tablesDisplay.appendChild(container);
}

// Update run query button enabled state
function updateRunQueryButtonState(enabled) {
  runQueryBtn.disabled = !enabled;
}

// Handle file input changes
fileInputs.forEach((input) => {
  input.addEventListener('change', () => {
    const file = input.files[0];
    const statusId = input.id + '-status';
    let statusElem = document.getElementById(statusId);

    if (!statusElem) {
      // Create status element next to input
      statusElem = document.createElement('div');
      statusElem.id = statusId;
      statusElem.style.marginTop = '4px';
      input.parentNode.insertBefore(statusElem, input.nextSibling);
    }

    if (!file) {
      statusElem.textContent = '';
      filesData.delete(input.id);
      return;
    }

    const reader = new FileReader();
    reader.onload = function(e) {
      const text = e.target.result;
      filesData.set(input.id, { name: file.name, content: text });
      statusElem.textContent = 'Upload successful';
      statusElem.style.color = 'green';
    };
    reader.onerror = function() {
      statusElem.textContent = 'Upload failed';
      statusElem.style.color = 'red';
      filesData.delete(input.id);
    };
    reader.readAsText(file);
  });
});

// Create DB and preview tables button click
createDbBtn.addEventListener('click', () => {
  if (db) {
    try {
      db.close();
    } catch {}
    db = null;
  }

  tablesDisplay.innerHTML = '<h2>Loaded Tables</h2>';
  resultsDiv.textContent = '';
  sqlTextarea.value = '';

  if (filesData.size === 0) {
    alert('No CSV files loaded.');
    updateRunQueryButtonState(false);
    return;
  }

  // Create new in-memory DB
  db = new SQL.Database();

  for (const [inputId, fileObj] of filesData.entries()) {
    try {
      const { name, content } = fileObj;
      const tableName = generateTableName(name);
      const { columns, rows } = parseCSV(content);

      if (columns.length === 0) {
        throw new Error(`File "${name}" has no columns or is empty.`);
      }

      // Create table with all TEXT columns
      const createTableSQL = `CREATE TABLE ${escapeSqlId(tableName)} (${columns.map(c => escapeSqlId(c) + ' TEXT').join(', ')})`;
      db.run(createTableSQL);

      // Insert data rows
      const placeholders = columns.map(() => '?').join(', ');
      const insertSQL = `INSERT INTO ${escapeSqlId(tableName)} VALUES (${placeholders})`;
      const stmt = db.prepare(insertSQL);

      for (const row of rows) {
        // Pad or truncate row to match column count
        const paddedRow = row.slice(0, columns.length);
        while (paddedRow.length < columns.length) paddedRow.push('');
        stmt.run(paddedRow);
      }
      stmt.free();

      renderTablePreview(tableName, columns, rows);
    } catch (e) {
      alert(`Error processing file ${fileObj.name}: ${e.message}`);
    }
  }

  updateRunQueryButtonState(true);
});

// Run Query button click
runQueryBtn.addEventListener('click', () => {
  if (!db) {
    alert('Database not created yet.');
    return;
  }

  const query = sqlTextarea.value.trim();
  if (!query) {
    alert('Please enter a SQL query.');
    return;
  }

  try {
    const res = db.exec(query);
    if (res.length === 0) {
      resultsDiv.textContent = 'Query executed successfully, no results to show.';
      return;
    }

    // Show results of first statement
    const { columns, values } = res[0];

    // Build HTML table for results
    const table = document.createElement('table');

    // Header
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    for (const col of columns) {
      const th = document.createElement('th');
      th.textContent = col;
      headerRow.appendChild(th);
    }
    thead.appendChild(headerRow);
    table.appendChild(thead);

    // Body
    const tbody = document.createElement('tbody');
    for (const row of values) {
      const tr = document.createElement('tr');
      for (const cell of row) {
        const td = document.createElement('td');
        td.textContent = cell === null ? 'NULL' : cell;
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);

    // Show table in results div
    resultsDiv.innerHTML = '';
    resultsDiv.appendChild(table);

  } catch (e) {
    resultsDiv.innerHTML = `<div class="error">SQL Error: ${e.message}</div>`;
  }
});
