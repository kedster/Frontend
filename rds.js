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
  let turtle = `@prefix ex: <http://example.org/> .\n@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .\n\n`;

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

window.onload = initRDF;
