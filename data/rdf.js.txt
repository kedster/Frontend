let db, SQL;

async function loadDbFromStorage() {
  const dbBase64 = localStorage.getItem("sqljs_db_gz");
  if (!dbBase64) return null;

  // Decode and decompress
  const binaryString = atob(dbBase64);
  const compressedBytes = Uint8Array.from(binaryString, c => c.charCodeAt(0));
  const dbBytes = pako.inflate(compressedBytes);

  SQL = await initSqlJs({ locateFile: file => `https://sql.js.org/dist/${file}` });
  return new SQL.Database(dbBytes);
}

function getTableNames(db) {
  const stmt = db.prepare("SELECT name FROM sqlite_master WHERE type='table'");
  const tables = [];
  while (stmt.step()) {
    tables.push(stmt.get()[0]);
  }
  stmt.free();
  return tables;
}

function sanitize(header) {
  return header.trim().replace(/[^\w]/g, "_");
}

function getFullOntologyUri() {
  const baseUriInput = document.getElementById('baseUri');
  const ontologySelect = document.getElementById('ontologySelect');

  if (!baseUriInput || !ontologySelect) return "http://example.org/";

  let baseUri = baseUriInput.value.trim();
  const suffix = ontologySelect.value.trim();

  if (!baseUri.endsWith('/') && !baseUri.endsWith('#')) {
    baseUri += '/';
  }

  return baseUri + suffix + '#';
}

function renderTablePreview(tableName, columns, values) {
  const container = document.getElementById('results');
  const section = document.createElement('section');
  section.innerHTML = `<h3>${tableName}</h3>`;
  
  const table = document.createElement('table');
  const thead = document.createElement('thead');
  const headRow = document.createElement('tr');
  columns.forEach(col => {
    const th = document.createElement('th');
    th.textContent = col;
    headRow.appendChild(th);
  });
  thead.appendChild(headRow);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  values.forEach(row => {
    const tr = document.createElement('tr');
    row.forEach(val => {
      const td = document.createElement('td');
      td.textContent = val;
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  section.appendChild(table);
  container.appendChild(section);
}

async function initRDF() {
  db = await loadDbFromStorage();
  const outputField = document.getElementById("rdfOutput");

  if (!db) {
    console.log("No database found. Load CSV in index.html first.");
    if (outputField) outputField.value = "# No database loaded.\n";
    return;
  }

  console.log("DB loaded from storage.");
  updateRunQueryButtonState(true);

  const tables = getTableNames(db);
  const fullOntologyUri = getFullOntologyUri();
  let turtle = `@prefix ex: <${fullOntologyUri}> .\n@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .\n\n`;

  tables.forEach(table => {
    const res = db.exec(`SELECT * FROM "${table}"`);
    if (res.length === 0) return;

    const { columns, values } = res[0];
    renderTablePreview(table, columns, values);

    values.forEach((row, i) => {
      const subject = `ex:${table}_${i + 1}`;
      columns.forEach((col, idx) => {
        const predicate = `ex:${sanitize(col)}`;
        const object = `"${row[idx]}"`;
        turtle += `${subject} ${predicate} ${object} .\n`;
      });
      turtle += "\n";
    });
  });

  outputField.value = turtle;
}

function updateRunQueryButtonState(enabled) {
  const btn = document.getElementById("generateTriplesBtn");
  if (btn) btn.disabled = !enabled;
}

function downloadRDF() {
  const rdf = document.getElementById("rdfOutput").value;
  const blob = new Blob([rdf], { type: "text/turtle" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "output.ttl";
  a.click();
  URL.revokeObjectURL(url);
}

function copyToClipboard() {
  const rdf = document.getElementById("rdfOutput").value;
  navigator.clipboard.writeText(rdf).then(() => {
    alert("RDF copied to clipboard!");
  }).catch(() => {
    alert("Failed to copy RDF.");
  });
}

// Bind buttons once DOM is ready
window.addEventListener("DOMContentLoaded", async () => {
  const generateBtn = document.getElementById('generateTriplesBtn');
  const downloadBtn = document.getElementById('downloadBtn');
  const copyBtn = document.getElementById('copyBtn');

  if (generateBtn) generateBtn.onclick = initRDF;
  if (downloadBtn) downloadBtn.onclick = downloadRDF;
  if (copyBtn) copyBtn.onclick = copyToClipboard;

  // Optional preload
  const hasDB = localStorage.getItem("sqljs_db_gz");
  if (!hasDB) {
    console.warn("No compressed database found. Use index.html to load CSV first.");
    updateRunQueryButtonState(false);
  }
});
