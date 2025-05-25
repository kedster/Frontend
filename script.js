        // Global state
        let db = null;
        let SQL = null;
        let filesData = new Map();
        let fileInputCounter = 0;

        // Initialize the app
        document.addEventListener('DOMContentLoaded', () => {
            initializeFileInputs();
            checkExistingDatabase();
        });

        function initializeFileInputs() {
            // Start with 3 file inputs
            for (let i = 0; i < 3; i++) {
                addFileInput();
            }
        }

        function addFileInput() {
            fileInputCounter++;
            const container = document.getElementById('file-inputs-container');
            
            const inputGroup = document.createElement('div');
            inputGroup.className = 'form-group';
            inputGroup.innerHTML = `
                <label>CSV File ${fileInputCounter}:</label>
                <input type="file" class="file-input" id="file-input-${fileInputCounter}" accept=".csv" onchange="handleFileUpload(this)">
                <div id="status-${fileInputCounter}" class="file-status" style="display: none;"></div>
            `;
            
            container.appendChild(inputGroup);
        }

        function handleFileUpload(input) {
            const file = input.files[0];
            const statusId = input.id.replace('file-input-', 'status-');
            const statusEl = document.getElementById(statusId);
            
            if (!file) {
                statusEl.style.display = 'none';
                filesData.delete(input.id);
                updateStats();
                return;
            }

            statusEl.style.display = 'block';
            statusEl.textContent = 'Reading file...';
            statusEl.className = 'file-status';

            const reader = new FileReader();
            reader.onload = function(e) {
                try {
                    const content = e.target.result;
                    filesData.set(input.id, { name: file.name, content: content });
                    
                    statusEl.textContent = `✅ ${file.name} loaded successfully`;
                    statusEl.className = 'file-status success';
                    updateStats();
                } catch (error) {
                    statusEl.textContent = `❌ Error reading ${file.name}`;
                    statusEl.className = 'file-status error';
                    filesData.delete(input.id);
                }
            };

            reader.onerror = function() {
                statusEl.textContent = `❌ Failed to read ${file.name}`;
                statusEl.className = 'file-status error';
                filesData.delete(input.id);
            };

            reader.readAsText(file);
        }

        function updateStats() {
            const filesCount = filesData.size;
            document.getElementById('files-count').textContent = filesCount;
            
            const statsContainer = document.getElementById('upload-stats');
            if (filesCount > 0) {
                statsContainer.style.display = 'flex';
            } else {
                statsContainer.style.display = 'none';
            }
        }

        async function createDatabase() {
            if (filesData.size === 0) {
                showAlert('Please upload at least one CSV file first.', 'error');
                return;
            }

            const createBtn = document.getElementById('create-db-btn');
            const originalText = createBtn.innerHTML;
            createBtn.innerHTML = '<span class="loading"></span>Creating Database...';
            createBtn.disabled = true;

            try {
                // Initialize SQL.js
                SQL = await initSqlJs({
                    locateFile: file => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.8.0/${file}`
                });

                db = new SQL.Database();
                let totalRows = 0;
                let tablesCreated = 0;

                // Clear previous displays
                document.getElementById('tables-display').innerHTML = '';
                
                for (const [inputId, fileObj] of filesData.entries()) {
                    try {
                        const { name, content } = fileObj;
                        const tableName = generateTableName(name);
                        const { columns, rows } = parseCSV(content);

                        if (columns.length === 0) {
                            throw new Error(`File "${name}" has no columns or is empty.`);
                        }

                        // Create table
                        const createTableSQL = `CREATE TABLE ${escapeSqlId(tableName)} (${columns.map(c => escapeSqlId(c) + ' TEXT').join(', ')})`;
                        db.run(createTableSQL);

                        // Insert data
                        const placeholders = columns.map(() => '?').join(', ');
                        const insertSQL = `INSERT INTO ${escapeSqlId(tableName)} VALUES (${placeholders})`;
                        const stmt = db.prepare(insertSQL);

                        for (const row of rows) {
                            const paddedRow = row.slice(0, columns.length);
                            while (paddedRow.length < columns.length) paddedRow.push('');
                            stmt.run(paddedRow);
                        }
                        stmt.free();

                        totalRows += rows.length;
                        tablesCreated++;

                        // Show table preview
                        renderTablePreview(tableName, columns, rows.slice(0, 5));

                    } catch (error) {
                        showAlert(`Error processing ${fileObj.name}: ${error.message}`, 'error');
                    }
                }

                // Update stats
                document.getElementById('tables-count').textContent = tablesCreated;
                document.getElementById('rows-count').textContent = totalRows;

                // Save to localStorage with compression
                saveCompressedDatabase();

                // Enable query functionality
                document.getElementById('run-query-btn').disabled = false;
                document.getElementById('generate-rdf-btn').disabled = false;

                // Show tables
                const tablesDisplay = document.getElementById('tables-display');
                tablesDisplay.style.display = 'block';

                showAlert(`Database created successfully! ${tablesCreated} tables with ${totalRows} total rows.`, 'success');

            } catch (error) {
                showAlert(`Error creating database: ${error.message}`, 'error');
            } finally {
                createBtn.innerHTML = originalText;
                createBtn.disabled = false;
            }
        }

        function saveCompressedDatabase() {
            if (!db) return;
            
            try {
                const binaryArray = db.export();
                const compressed = pako.gzip(binaryArray);
                const base64String = btoa(String.fromCharCode(...compressed));
                localStorage.setItem('sqljs_db_gz', base64String);
                console.log('Database saved with compression');
            } catch (error) {
                console.error('Error saving database:', error);
            }
        }

        async function loadCompressedDatabase() {
            try {
                const base64String = localStorage.getItem('sqljs_db_gz');
                if (!base64String) return null;

                const binaryString = atob(base64String);
                const compressedBytes = new Uint8Array(binaryString.length);
                for (let i = 0; i < binaryString.length; i++) {
                    compressedBytes[i] = binaryString.charCodeAt(i);
                }

                const decompressed = pako.ungzip(compressedBytes);

                if (!SQL) {
                    SQL = await initSqlJs({
                        locateFile: file => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.8.0/${file}`
                    });
                }

                return new SQL.Database(decompressed);
            } catch (error) {
                console.error('Error loading database:', error);
                return null;
            }
        }

        async function checkExistingDatabase() {
            db = await loadCompressedDatabase();
            if (db) {
                document.getElementById('run-query-btn').disabled = false;
                document.getElementById('generate-rdf-btn').disabled = false;
                showAlert('Previous database loaded from storage.', 'success');
            }
        }

        function runQuery() {
            if (!db) {
                showAlert('Please create a database first.', 'error');
                return;
            }

            const query = document.getElementById('sql-query').value.trim();
            if (!query) {
                showAlert('Please enter a SQL query.', 'error');
                return;
            }

            const runBtn = document.getElementById('run-query-btn');
            const originalText = runBtn.innerHTML;
            runBtn.innerHTML = '<span class="loading"></span>Running...';
            runBtn.disabled = true;

            try {
                const results = db.exec(query);
                displayQueryResults(results);
            } catch (error) {
                showAlert(`SQL Error: ${error.message}`, 'error');
            } finally {
                runBtn.innerHTML = originalText;
                runBtn.disabled = false;
            }
        }

        function displayQueryResults(results) {
            const container = document.getElementById('query-results');
            container.innerHTML = '';
            container.style.display = 'block';

            if (results.length === 0) {
                container.innerHTML = '<div class="alert alert-success">Query executed successfully, no results to display.</div>';
                return;
            }

            const { columns, values } = results[0];
            
            const table = document.createElement('table');
            
            // Header
            const thead = document.createElement('thead');
            const headerRow = document.createElement('tr');
            columns.forEach(col => {
                const th = document.createElement('th');
                th.textContent = col;
                headerRow.appendChild(th);
            });
            thead.appendChild(headerRow);
            table.appendChild(thead);

            // Body
            const tbody = document.createElement('tbody');
            values.forEach(row => {
                const tr = document.createElement('tr');
                row.forEach(cell => {
                    const td = document.createElement('td');
                    td.textContent = cell === null ? 'NULL' : cell;
                    tr.appendChild(td);
                });
                tbody.appendChild(tr);
            });
            table.appendChild(tbody);

            container.appendChild(table);
        }

        function renderTablePreview(tableName, columns, rows) {
            const container = document.getElementById('tables-display');
            
            const preview = document.createElement('div');
            preview.className = 'table-preview';
            
            const title = document.createElement('h3');
            title.textContent = `📊 Table: ${tableName}`;
            preview.appendChild(title);

            const table = document.createElement('table');
            
            // Header
            const thead = document.createElement('thead');
            const headerRow = document.createElement('tr');
            columns.forEach(col => {
                const th = document.createElement('th');
                th.textContent = col;
                headerRow.appendChild(th);
            });
            thead.appendChild(headerRow);
            table.appendChild(thead);

            // Body (preview only)
            const tbody = document.createElement('tbody');
            rows.forEach(row => {
                const tr = document.createElement('tr');
                columns.forEach((col, idx) => {
                    const td = document.createElement('td');
                    td.textContent = row[idx] || '';
                    tr.appendChild(td);
                });
                tbody.appendChild(tr);
            });
            table.appendChild(tbody);

            preview.appendChild(table);
            container.appendChild(preview);
        }

        async function generateRDF() {
            if (!db) {
                db = await loadCompressedDatabase();
                if (!db) {
                    showAlert('No database found. Please create a database first.', 'error');
                    return;
                }
            }

            const generateBtn = document.getElementById('generate-rdf-btn');
            const originalText = generateBtn.innerHTML;
            generateBtn.innerHTML = '<span class="loading"></span>Generating...';
            generateBtn.disabled = true;

            try {
                const baseUri = document.getElementById('base-uri').value.trim();
                const ontologySuffix = document.getElementById('ontology-select').value;
                const customPrefixes = document.getElementById('prefixes').value.trim();

                let fullOntologyUri = baseUri;
                if (!fullOntologyUri.endsWith('/') && !fullOntologyUri.endsWith('#')) {
                    fullOntologyUri += '/';
                }
                fullOntologyUri += ontologySuffix + '#';

                // Get table names
                const tableNames = getTableNames(db);
                
                // Build RDF
                let turtle = '';
                
                // Add default prefixes
                turtle += `@prefix ex: <${fullOntologyUri}> .\n`;
                turtle += `@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .\n`;
                turtle += `@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .\n\n`;
                
                // Add custom prefixes if provided
                if (customPrefixes) {
                    turtle += customPrefixes + '\n\n';
                }

                // Generate triples for each table
                tableNames.forEach(tableName => {
                    const results = db.exec(`SELECT * FROM "${tableName}"`);
                    if (results.length === 0) return;

                    const { columns, values } = results[0];
                    
                    values.forEach((row, index) => {
                        const subject = `ex:${tableName}_${index + 1}`;
                        
                        columns.forEach((col, colIndex) => {
                            const predicate = `ex:${sanitizeForRDF(col)}`;
                            const value = row[colIndex];
                            
                            if (value !== null && value !== '') {
                                // Try to detect data types
                                let object;
                                if (!isNaN(value) && !isNaN(parseFloat(value))) {
                                    object = `"${value}"^^xsd:decimal`;
                                } else {
                                    object = `"${escapeRDFLiteral(value)}"`;
                                }
                                
                                turtle += `${subject} ${predicate} ${object} .\n`;
                            }
                        });
                        turtle += '\n';
                    });
                });

                document.getElementById('rdf-output').value = turtle;
                showAlert('RDF triples generated successfully!', 'success');

            } catch (error) {
                showAlert(`Error generating RDF: ${error.message}`, 'error');
            } finally {
                generateBtn.innerHTML = originalText;
                generateBtn.disabled = false;
            }
        }

        function downloadRDF() {
            const rdf = document.getElementById('rdf-output').value;
            if (!rdf.trim()) {
                showAlert('No RDF content to download.', 'error');
                return;
            }

            const blob = new Blob([rdf], { type: 'text/turtle' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'output.ttl';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
            showAlert('RDF file downloaded successfully!', 'success');
        }

        function copyRDF() {
            const rdf = document.getElementById('rdf-output').value;
            if (!rdf.trim()) {
                showAlert('No RDF content to copy.', 'error');
                return;
            }

            navigator.clipboard.writeText(rdf).then(() => {
                showAlert('RDF copied to clipboard!', 'success');
            }).catch(() => {
                showAlert('Failed to copy RDF to clipboard.', 'error');
            });
        }

        // Utility functions
        function switchTab(tabName) {
            // Update tab buttons
            document.querySelectorAll('.nav-tab').forEach(tab => {
                tab.classList.remove('active');
            });
            event.target.classList.add('active');

            // Update tab content
            document.querySelectorAll('.tab-content').forEach(content => {
                content.classList.remove('active');
            });
            document.getElementById(tabName + '-tab').classList.add('active');
        }

        function showAlert(message, type) {
            // Remove existing alerts
            document.querySelectorAll('.alert').forEach(alert => {
                if (!alert.classList.contains('permanent')) {
                    alert.remove();
                }
            });

            // Create new alert
            const alert = document.createElement('div');
            alert.className = `alert alert-${type}`;
            alert.textContent = message;

            // Insert at the top of the active tab
            const activeTab = document.querySelector('.tab-content.active');
            activeTab.insertBefore(alert, activeTab.firstChild);

            // Auto-remove after 5 seconds
            setTimeout(() => {
                if (alert.parentNode) {
                    alert.remove();
                }
            }, 5000);
        }

        function escapeSqlId(id) {
            return `"${id.replace(/"/g, '""')}"`;
        }

        function generateTableName(filename) {
            return filename.replace(/\.csv$/i, '').replace(/[^\w]/g, '_');
        }

        function parseCSV(text) {
            const lines = text.trim().split(/\r?\n/).filter(l => l.trim() !== '');
            if (lines.length === 0) return { columns: [], rows: [] };
            
            // Simple CSV parsing - could be enhanced with a proper CSV library
            const columns = lines[0].split(',').map(c => c.trim().replace(/^["']|["']$/g, ''));
            const rows = lines.slice(1).map(line => {
                // Handle quoted fields
                const cells = [];
                let current = '';
                let inQuotes = false;
                
                for (let i = 0; i < line.length; i++) {
                    const char = line[i];
                    if (char === '"' && (i === 0 || line[i-1] === ',')) {
                        inQuotes = true;
                    } else if (char === '"' && inQuotes && (i === line.length - 1 || line[i+1] === ',')) {
                        inQuotes = false;
                    } else if (char === ',' && !inQuotes) {
                        cells.push(current.trim());
                        current = '';
                    } else {
                        current += char;
                    }
                }
                cells.push(current.trim());
                
                return cells.map(cell => cell.replace(/^["']|["']$/g, ''));
            });
            
            return { columns, rows };
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

        function sanitizeForRDF(header) {
            return header.trim().replace(/[^\w]/g, '_');
        }

        function escapeRDFLiteral(value) {
            return String(value)
                .replace(/\\/g, '\\\\')
                .replace(/"/g, '\\"')
                .replace(/\n/g, '\\n')
                .replace(/\r/g, '\\r')
                .replace(/\t/g, '\\t');
        }

        // Sample queries for demonstration
        function loadSampleQuery() {
            const queries = [
                "SELECT * FROM your_table LIMIT 10;",
                "SELECT COUNT(*) as total_records FROM your_table;",
                "SELECT column_name, COUNT(*) FROM your_table GROUP BY column_name;",
                "SELECT * FROM your_table WHERE column_name IS NOT NULL ORDER BY column_name;"
            ];
            
            const randomQuery = queries[Math.floor(Math.random() * queries.length)];
            document.getElementById('sql-query').value = randomQuery;
        }

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            // Ctrl/Cmd + Enter to run query
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                if (document.querySelector('#upload-tab').classList.contains('active')) {
                    runQuery();
                } else if (document.querySelector('#rdf-tab').classList.contains('active')) {
                    generateRDF();
                }
            }
            
            // Ctrl/Cmd + 1/2 to switch tabs
            if ((e.ctrlKey || e.metaKey) && e.key === '1') {
                switchTab('upload');
                document.querySelector('.nav-tab').click();
            }
            if ((e.ctrlKey || e.metaKey) && e.key === '2') {
                switchTab('rdf');
                document.querySelectorAll('.nav-tab')[1].click();
            }
        });

        // Add some helpful tooltips and examples
        document.getElementById('sql-query').addEventListener('focus', function() {
            if (!this.value.trim()) {
                loadSampleQuery();
            }
        });

        // Auto-resize textareas
        document.querySelectorAll('textarea').forEach(textarea => {
            textarea.addEventListener('input', function() {
                this.style.height = 'auto';
                this.style.height = Math.max(120, this.scrollHeight) + 'px';
            });
        });