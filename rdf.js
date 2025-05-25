async function initRDF() {
  const dbBase64 = localStorage.getItem("sqljs_db");

  if (!dbBase64) {
    alert("No database found. Load CSV in index.html first.");
    return;
  }

  const binaryString = atob(dbBase64);
  const bytes = Uint8Array.from(binaryString, c => c.charCodeAt(0));

  const SQL = await initSqlJs({ locateFile: file => `https://sql.js.org/dist/${file}` });
  const db = new SQL.Database(bytes);

  const tables = getTableNames(db);

  // Get full ontology URI from inputs
  const fullOntologyUri = getFullOntologyUri();

  // Build prefixes dynamically
  const prefixes = `@prefix ex: <${fullOntologyUri}> .\n@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .\n\n`;

  let turtle = prefixes;

  for (const table of tables) {
    const stmt = db.prepare(`SELECT * FROM ${table}`);
    let rowIndex = 1;

    while (stmt.step()) {
      const row = stmt.getAsObject();
      const subject = `ex:${table}_${rowIndex++}`;

      for (const [key, value] of Object.entries(row)) {
        turtle += `${subject} ex:${sanitize(key)} "${value}" .\n`;
      }

      turtle += "\n";
    }

    stmt.free();
  }

  document.getElementById("rdfOutput").value = turtle;
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

// Returns the full ontology URI from baseUri input + dropdown select
function getFullOntologyUri() {
  const baseUriInput = document.getElementById('baseUri');
  const ontologySelect = document.getElementById('ontologySelect');

  if (!baseUriInput || !ontologySelect) return "http://example.org/"; // fallback

  let baseUri = baseUriInput.value.trim();
  const suffix = ontologySelect.value.trim();

  // Ensure baseUri ends with / or #
  if (!baseUri.endsWith('/') && !baseUri.endsWith('#')) {
    baseUri += '/';
  }

  return baseUri + suffix + '#';
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

// Hook buttons after DOM ready
window.onload = () => {
  const dbBase64 = localStorage.getItem("sqljs_db");
  if (!dbBase64) {
    alert("No database found. Load CSV in index.html first.");
  }

  const generateBtn = document.getElementById('generateTriplesBtn');
  if (generateBtn) {
    generateBtn.onclick = initRDF;
  }

  const downloadBtn = document.getElementById('downloadBtn');
  if (downloadBtn) {
    downloadBtn.onclick = downloadRDF;
  }

  const copyBtn = document.getElementById('copyBtn');
  if (copyBtn) {
    copyBtn.onclick = copyToClipboard;
  }
};
