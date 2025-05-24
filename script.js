let db;
let uploadedCSVData;
let uploadedCSVCols;

initSqlJs({ locateFile: filename => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.6.2/${filename}` })
  .then(SQL => db = new SQL.Database());

function loadCSV() {
  const file = document.getElementById('csvFile').files[0];
  if (!file) {
    alert("Please upload a CSV file first.");
    return;
  }

  Papa.parse(file, {
    header: true,
    skipEmptyLines: true,
    complete: function (results) {
      const data = results.data;
      const cols = results.meta.fields;

      if (!data.length || !cols.length) {
        alert('CSV contains no data!');
        return;
      }

      uploadedCSVData = data;
      uploadedCSVCols = cols;

      const colDefs = cols.map(c => `"${c}" TEXT`).join(", ");
      db.run("DROP TABLE IF EXISTS my_table;");
      db.run(`CREATE TABLE my_table (${colDefs});`);

      const stmt = db.prepare(
        `INSERT INTO my_table (${cols.map(c => `"${c}"`).join(", ")}) VALUES (${cols.map(() => "?").join(", ")});`
      );

      db.run("BEGIN TRANSACTION;");
      data.forEach(row => stmt.run(cols.map(c => row[c])));
      db.run("COMMIT;");
      stmt.free();

      displayTable(data, cols);
    }
  });
}

function displayTable(data, cols) {
  let html = '<table><thead><tr>';
  html += cols.map(col => `<th>${col}</th>`).join('');
  html += '</tr></thead><tbody>';
  data.forEach(row => {
    html += '<tr>' + cols.map(c => `<td>${row[c]}</td>`).join('') + '</tr>';
  });
  html += '</tbody></table>';
  document.getElementById('results').innerHTML = html;
}

function runQuery() {
  const sql = document.getElementById('sqlQuery').value;
  let html = '';

  try {
    const res = db.exec(sql);
    if (!res.length) {
      html = '<p>No results or empty query.</p>';
    } else {
      res.forEach(table => {
        html += '<table><thead><tr>' + table.columns.map(col => `<th>${col}</th>`).join('') + '</tr></thead><tbody>';
        table.values.forEach(row => {
          html += '<tr>' + row.map(cell => `<td>${cell}</td>`).join('') + '</tr>';
        });
        html += '</tbody></table>';
      });
    }
  } catch (err) {
    html = `<p class="error">SQL Error: ${err.message}</p>`;
  }

  document.getElementById('results').innerHTML = html;
}
