import initSqlJs from "https://cdn.jsdelivr.net/npm/sql.js@1.8.0/dist/sql-wasm.js";

let db;

const dropZone = document.getElementById("dropZone");
const tablesDisplay = document.getElementById("tablesDisplay");
const results = document.getElementById("results");

initSqlJs({ locateFile: filename => `https://cdn.jsdelivr.net/npm/sql.js@1.8.0/dist/${filename}` }).then(SQL => {
  db = new SQL.Database();

  dropZone.addEventListener("dragover", e => {
    e.preventDefault();
    dropZone.style.borderColor = "blue";
  });

  dropZone.addEventListener("dragleave", e => {
    dropZone.style.borderColor = "#ccc";
  });

  dropZone.addEventListener("drop", async e => {
    e.preventDefault();
    dropZone.style.borderColor = "#ccc";
    const files = Array.from(e.dataTransfer.files).filter(f => f.name.endsWith(".csv"));

    for (const file of files) {
      const text = await file.text();
      const tableName = sanitizeTableName(file.name.replace(".csv", ""));
      const rows = parseCSV(text);

      if (rows.length === 0) continue;

      const columns = Object.keys(rows[0]);
      const createStmt = `CREATE TABLE "${tableName}" (${columns.map(c => `"${c}" TEXT`).join(", ")})`;
      db.run(createStmt);

      const insertStmt = db.prepare(`INSERT INTO "${tableName}" VALUES (${columns.map(() => '?').join(",")})`);
      rows.forEach(row => insertStmt.run(columns.map(col => row[col])));
      insertStmt.free();

      renderTable(tableName, rows);
    }
  });
});

function runQuery() {
  const sql = document.getElementById("sql").value;
  results.innerHTML = "";
  try {
    const res = db.exec(sql);
    if (res.length === 0) {
      results.innerHTML = "<p>No results.</p>";
      return;
    }

    const table = document.createElement("table");
    const thead = document.createElement("thead");
    const headerRow = document.createElement("tr");

    res[0].columns.forEach(col => {
      const th = document.createElement("th");
      th.textContent = col;
      headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);
    table.appendChild(thead);

    const tbody = document.createElement("tbody");
    res[0].values.forEach(row => {
      const tr = document.createElement("tr");
      row.forEach(val => {
        const td = document.createElement("td");
        td.textContent = val;
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    results.appendChild(table);
  } catch (err) {
    results.innerHTML = `<p class="error">${err.message}</p>`;
  }
}

function sanitizeTableName(name) {
  return name.replace(/[^a-zA-Z0-9_]/g, "_");
}

function parseCSV(csv) {
  const [headerLine, ...lines] = csv.trim().split("\n");
  const headers = headerLine.split(",").map(h => h.trim());

  return lines.map(line => {
    const values = line.split(",").map(v => v.trim());
    const obj = {};
    headers.forEach((h, i) => obj[h] = values[i]);
    return obj;
  });
}

function renderTable(tableName, data) {
  const tableWrapper = document.createElement("div");
  const h2 = document.createElement("h2");
  h2.textContent = `Table: ${tableName}`;
  tableWrapper.appendChild(h2);

  const table = document.createElement("table");
  const thead = document.createElement("thead");
  const headerRow = document.createElement("tr");

  Object.keys(data[0]).forEach(key => {
    const th = document.createElement("th");
    th.textContent = key;
    headerRow.appendChild(th);
  });
  thead.appendChild(headerRow);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  data.forEach(row => {
    const tr = document.createElement("tr");
    Object.values(row).forEach(val => {
      const td = document.createElement("td");
      td.textContent = val;
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);

  tableWrapper.appendChild(table);
  tablesDisplay.appendChild(tableWrapper);
}