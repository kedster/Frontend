/**
 * utils.js
 * Contains utility functions for DOM manipulation, CSV parsing, and data handling.
 */

// Global State (shared with main.js)
// Using a Map to store CSV data: Map<filename, {headers: [], data: [[]], uuidColumnName: string, elementTab: HTMLElement, elementTablePreview: HTMLElement}>
window.allCsvData = new Map();
window.appState = {
    selectedOntology: null,
    relationMappings: [], // [{ sourceCsv, sourceCol, predicate, targetCsv, targetCol }]
    sparqlConfig: {
        url: 'http://localhost:3030/ds/update',
        method: 'POST',
        headers: '{}',
        namedGraph: ''
    }
};

/**
 * Displays a message in the designated message area.
 * @param {string} message - The message to display.
 * @param {string} type - 'info', 'warning', 'error', 'success'.
 */
function displayMessage(message, type = 'info') {
    const messageArea = document.getElementById('messageArea');
    messageArea.textContent = message;
    messageArea.className = `message-area ${type}`;
    messageArea.style.display = 'block';

    // Auto-hide info/success messages after a few seconds
    if (type === 'info' || type === 'success') {
        setTimeout(() => {
            messageArea.style.display = 'none';
        }, 5000);
    }
}

/**
 * Hides the message area.
 */
function hideMessage() {
    document.getElementById('messageArea').style.display = 'none';
}


/**
 * Parses a CSV file using PapaParse.
 * Appends a UUID column to each row.
 * @param {File} file - The CSV file to parse.
 * @returns {Promise<Object>} A promise that resolves with parsed CSV data, headers, and UUID column name.
 */
function parseCSV(file) {
    return new Promise((resolve, reject) => {
        PapaParse.parse(file, {
            header: true,
            skipEmptyLines: true,
            complete: (results) => {
                if (results.errors.length) {
                    console.error("PapaParse errors:", results.errors);
                    displayMessage(`Error parsing ${file.name}: ${results.errors[0].message}`, 'error');
                    return reject(results.errors[0]);
                }

                if (!results.data.length) {
                    displayMessage(`Warning: ${file.name} is empty or contains no valid data rows.`, 'warning');
                    return reject(new Error('Empty CSV file'));
                }

                const originalHeaders = results.meta.fields;
                if (!originalHeaders || originalHeaders.length === 0) {
                    displayMessage(`Error: ${file.name} appears to have no headers.`, 'error');
                    return reject(new Error('No headers found in CSV'));
                }

                // Add UUID column
                const uuidColumnName = '_uuid_';
                // Check if a column named '_uuid_' already exists or conflicts.
                // For simplicity, we assume conflicts are rare or users are fine with it.
                // A robust solution might rename it to '_uuid_1', '_uuid_2', etc.
                results.data.forEach(row => {
                    row[uuidColumnName] = crypto.randomUUID();
                });

                const allHeaders = [uuidColumnName, ...originalHeaders];

                // Ensure all rows have all headers for consistent table rendering
                // PapaParse with header:true should handle this but belt-and-braces
                const processedData = results.data.map(row => {
                    const newRow = {};
                    allHeaders.forEach(header => {
                        newRow[header] = row[header] || ''; // Ensure all headers are present, even if data is missing
                    });
                    return newRow;
                });

                resolve({
                    originalData: results.data, // Data without the UUID column (useful for specific processing)
                    parsedData: processedData, // Data with UUID column
                    headers: allHeaders,
                    uuidColumnName: uuidColumnName
                });
            },
            error: (err) => {
                displayMessage(`Failed to parse ${file.name}: ${err.message}`, 'error');
                reject(err);
            }
        });
    });
}

/**
 * Renders the tabbed interface for CSV files.
 * @param {Map<string, Object>} allCsvData - Map of all parsed CSV data.
 * @param {Function} onTabClick - Callback for tab click.
 * @param {Function} onTabClose - Callback for tab close.
 */
function renderTabs(allCsvData, onTabClick, onTabClose) {
    const tabsContainer = document.getElementById('csvTabsContainer');
    tabsContainer.innerHTML = '';
    let first = true;

    allCsvData.forEach((data, filename) => {
        const tab = document.createElement('div');
        tab.className = `tab ${first ? 'active' : ''}`;
        tab.dataset.filename = filename;
        tab.innerHTML = `<span>${filename}</span><span class="close-tab" data-filename="${filename}">&times;</span>`;
        tabsContainer.appendChild(tab);

        tab.addEventListener('click', (e) => {
            if (!e.target.classList.contains('close-tab')) {
                onTabClick(filename);
            }
        });
        tab.querySelector('.close-tab').addEventListener('click', (e) => {
            e.stopPropagation(); // Prevent tab click when closing
            onTabClose(filename);
        });

        // Store reference to the tab element
        data.elementTab = tab;
        first = false;
    });

    if (allCsvData.size > 0) {
        // Activate the first tab if not already active
        const firstFilename = allCsvData.keys().next().value;
        if (firstFilename && allCsvData.get(firstFilename).elementTab && !allCsvData.get(firstFilename).elementTab.classList.contains('active')) {
            onTabClick(firstFilename);
        }
    }
}

/**
 * Renders the CSV table preview for a given file.
 * @param {string} filename - The name of the file to preview.
 * @param {Object} csvData - Parsed data for the CSV file.
 */
function renderTablePreview(filename, csvData) {
    const previewArea = document.getElementById('csvPreviewArea');
    previewArea.innerHTML = ''; // Clear previous preview

    if (!csvData) {
        displayMessage('No CSV data selected for preview.', 'warning');
        return;
    }

    const table = document.createElement('table');
    table.className = 'csv-preview-table';
    table.dataset.filename = filename; // For direct lookup if needed

    const thead = table.createTHead();
    const headerRow = thead.insertRow();
    csvData.headers.forEach(header => {
        const th = document.createElement('th');
        th.textContent = header;
        headerRow.appendChild(th);
    });

    const tbody = table.createTBody();
    csvData.parsedData.slice(0, 100).forEach(rowData => { // Limit to first 100 rows for preview performance
        const tr = tbody.insertRow();
        csvData.headers.forEach(header => {
            const td = tr.insertCell();
            const value = rowData[header] !== undefined ? rowData[header] : '';
            td.textContent = value;
        });
    });

    previewArea.appendChild(table);

    // Store reference to the table element
    csvData.elementTablePreview = table;
}

/**
 * Renders the relation mapping dropdowns.
 * @param {Map<string, Object>} allCsvData - Map of all parsed CSV data.
 * @param {Array<Object>} relationMappings - Array of existing mappings.
 * @param {Function} onMappingChange - Callback for mapping change.
 * @param {Function} onRemoveMapping - Callback for removing a mapping.
 */
function renderRelationMappingDropdowns(allCsvData, relationMappings, onMappingChange, onRemoveMapping) {
    const container = document.getElementById('relationMappingContainer');
    container.innerHTML = ''; // Clear existing mappings

    if (allCsvData.size === 0) {
        container.innerHTML = '<p>Upload CSVs to define relations.</p>';
        document.getElementById('addMappingBtn').disabled = true;
        return;
    }
    document.getElementById('addMappingBtn').disabled = false;


    const populateDropdown = (selectElement, includeAll = false) => {
        selectElement.innerHTML = '';
        if (includeAll) {
            const optGroupAll = document.createElement('optgroup');
            optGroupAll.label = 'All Files';
            // Option for selecting "any column from any file" for a general subject/object
            // For now, let's stick to explicit file-column selection.
            // A more complex ontology might allow "a Person" (without specific file)
        }

        allCsvData.forEach((data, filename) => {
            const optGroup = document.createElement('optgroup');
            optGroup.label = filename;
            data.headers.forEach(header => {
                const option = document.createElement('option');
                option.value = `${filename}:${header}`;
                option.textContent = header;
                optGroup.appendChild(option);
            });
            selectElement.appendChild(optGroup);
        });
    };

    if (relationMappings.length === 0) {
        // Add a default empty mapping if none exist
        addMappingRow(onMappingChange, onRemoveMapping, allCsvData);
    } else {
        relationMappings.forEach((mapping, index) => {
            const mappingRow = createMappingRow(index, mapping, onMappingChange, onRemoveMapping, allCsvData);
            container.appendChild(mappingRow);
        });
    }

    // After populating, ensure previous selections are restored
    relationMappings.forEach((mapping, index) => {
        const rowElement = container.querySelector(`.mapping-row[data-index="${index}"]`);
        if (rowElement) {
            const sourceSelect = rowElement.querySelector('.source-col-select');
            const targetSelect = rowElement.querySelector('.target-col-select');
            const predicateInput = rowElement.querySelector('.predicate-input');

            // Set values and trigger change to confirm validity.
            if (sourceSelect) sourceSelect.value = `${mapping.sourceCsv}:${mapping.sourceCol}`;
            if (targetSelect) targetSelect.value = `${mapping.targetCsv}:${mapping.targetCol}`;
            if (predicateInput) predicateInput.value = mapping.predicate;
        }
    });

    if (relationMappings.length > 0) {
        container.querySelector('p')?.remove(); // Remove 'Upload CSVs' message if mappings exist
    }
}

/**
 * Creates and appends a single mapping row to the relation mapping container.
 * @param {number} index - The index of the mapping.
 * @param {Object} mapping - The mapping object to pre-fill.
 * @param {Function} onMappingChange - Callback for mapping change.
 * @param {Function} onRemoveMapping - Callback for removing a mapping.
 * @param {Map<string, Object>} allCsvData - Map of all parsed CSV data.
 */
function createMappingRow(index, mapping, onMappingChange, onRemoveMapping, allCsvData) {
    const mappingRow = document.createElement('div');
    mappingRow.className = 'mapping-row';
    mappingRow.dataset.index = index;

    const sourceSelect = document.createElement('select');
    sourceSelect.className = 'source-col-select';
    sourceSelect.name = 'sourceColumn';
    populateFileColumnDropdown(sourceSelect, allCsvData);
    sourceSelect.value = mapping ? `${mapping.sourceCsv}:${mapping.sourceCol}` : '';

    const predicateInput = document.createElement('input');
    predicateInput.type = 'text';
    predicateInput.className = 'predicate-input';
    predicateInput.placeholder = 'Predicate (e.g., ex:hasOrder)';
    predicateInput.value = mapping ? mapping.predicate : '';

    const targetSelect = document.createElement('select');
    targetSelect.className = 'target-col-select';
    targetSelect.name = 'targetColumn';
    populateFileColumnDropdown(targetSelect, allCsvData);
    targetSelect.value = mapping ? `${mapping.targetCsv}:${mapping.targetCol}` : '';

    const removeBtn = document.createElement('button');
    removeBtn.className = 'remove-mapping-btn';
    removeBtn.textContent = 'X';
    removeBtn.title = 'Remove mapping';
    removeBtn.addEventListener('click', () => {
        onRemoveMapping(index);
    });

    // Add event listeners for dynamic updates
    const updateMapping = () => {
        const sourceVal = sourceSelect.value.split(':');
        const targetVal = targetSelect.value.split(':');
        const newMapping = {
            sourceCsv: sourceVal[0] || '',
            sourceCol: sourceVal[1] || '',
            predicate: predicateInput.value.trim(),
            targetCsv: targetVal[0] || '',
            targetCol: targetVal[1] || ''
        };
        onMappingChange(index, newMapping);
    };

    sourceSelect.addEventListener('change', updateMapping);
    predicateInput.addEventListener('input', updateMapping);
    targetSelect.addEventListener('change', updateMapping);

    mappingRow.appendChild(sourceSelect);
    mappingRow.appendChild(predicateInput);
    mappingRow.appendChild(targetSelect);
    mappingRow.appendChild(removeBtn);

    return mappingRow;
}

/**
 * Helper to populate a file-column dropdown.
 * @param {HTMLSelectElement} selectElement
 * @param {Map<string, Object>} allCsvData
 */
function populateFileColumnDropdown(selectElement, allCsvData) {
    selectElement.innerHTML = '<option value="">-- Select --</option>'; // Default empty option
    allCsvData.forEach((data, filename) => {
        const optGroup = document.createElement('optgroup');
        optGroup.label = filename;
        data.headers.forEach(header => {
            const option = document.createElement('option');
            option.value = `${filename}:${header}`; // Format: filename:header
            option.textContent = header;
            optGroup.appendChild(option);
        });
        selectElement.appendChild(optGroup);
    });
}

/**
 * Adds a new mapping row to the UI and updates the global relationMappings.
 * @param {Function} onMappingChange - Callback for mapping change.
 * @param {Function} onRemoveMapping - Callback for removing a mapping.
 * @param {Map<string, Object>} allCsvData - Map of all parsed CSV data.
 */
function addMappingRow(onMappingChange, onRemoveMapping, allCsvData) {
    const container = document.getElementById('relationMappingContainer');
    const existingMappingsCount = window.appState.relationMappings.length;
    const newIndex = existingMappingsCount;

    // Add a placeholder/empty mapping to the global state first
    const newMapping = { sourceCsv: '', sourceCol: '', predicate: '', targetCsv: '', targetCol: '' };
    window.appState.relationMappings.push(newMapping);

    // Render the new row
    container.querySelector('p')?.remove(); // Remove "Upload CSVs" message if present
    const mappingRowElement = createMappingRow(newIndex, newMapping, onMappingChange, onRemoveMapping, allCsvData);
    container.appendChild(mappingRowElement);
}

/**
 * Opens a modal.
 * @param {HTMLElement} modalElement - The modal DOM element.
 */
function openModal(modalElement) {
    modalElement.classList.add('visible');
}

/**
 * Closes a modal.
 * @param {HTMLElement} modalElement - The modal DOM element.
 */
function closeModal(modalElement) {
    modalElement.classList.remove('visible');
}

/**
 * Saves SPARQL config to local storage.
 */
function saveSparqlConfig() {
    const url = document.getElementById('sparqlUrl').value;
    const method = document.getElementById('sparqlMethod').value;
    const headers = document.getElementById('sparqlHeaders').value;
    const namedGraph = document.getElementById('sparqlNamedGraph').value;

    try {
        JSON.parse(headers); // Validate JSON format
    } catch (e) {
        displayMessage('Error: SPARQL Headers must be valid JSON.', 'error');
        return false;
    }

    Object.assign(window.appState.sparqlConfig, { url, method, headers, namedGraph });
    localStorage.setItem('sparqlConfig', JSON.stringify(window.appState.sparqlConfig));
    displayMessage('SPARQL configuration saved successfully.', 'success');
    return true;
}

/**
 * Loads SPARQL config from local storage and populates form.
 */
function loadSparqlConfig() {
    const savedConfig = localStorage.getItem('sparqlConfig');
    if (savedConfig) {
        try {
            const config = JSON.parse(savedConfig);
            Object.assign(window.appState.sparqlConfig, config); // Update global state
            document.getElementById('sparqlUrl').value = config.url || '';
            document.getElementById('sparqlMethod').value = config.method || 'POST';
            document.getElementById('sparqlHeaders').value = config.headers || '{}';
            document.getElementById('sparqlNamedGraph').value = config.namedGraph || '';
        } catch (e) {
            console.error("Failed to parse saved SPARQL config:", e);
            localStorage.removeItem('sparqlConfig'); // Clear corrupt data
            displayMessage('Corrupted SPARQL config found, reset to defaults.', 'warning');
        }
    }
}

/**
 * Loads Ontologies from local storage or default and populates dropdown/modal.
 */
function loadOntologies() {
    const defaultOntologies = [
        {
            id: 'example',
            name: 'Example Ontology',
            prefixes: {
                ex: 'http://example.org/ns#',
                schema: 'http://schema.org/',
                rdf: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
                rdfs: 'http://www.w3.org/2000/01/rdf-schema#'
            },
            base: 'http://example.org/',
            classes: [
                { name: 'Person', uri: 'schema:Person' },
                { name: 'Product', uri: 'schema:Product' },
                { name: 'Order', uri: 'ex:Order' }
            ],
            predicates: [
                { name: 'schemaName', uri: 'schema:name' },
                { name: 'schemaAge', uri: 'schema:age' },
                { name: 'schemaCity', uri: 'schema:addressLocality' },
                { name: 'exHasOrder', uri: 'ex:hasOrder' },
                { name: 'exCustomer', uri: 'ex:customer' },
                { name: 'exOrderedProduct', uri: 'ex:orderedProduct' },
                { name: 'id', uri: 'ex:id' } // For _uuid_
            ]
        },
        {
            id: 'blank',
            name: 'Blank Ontology (Manual Definition)',
            prefixes: { },
            base: 'http://example.org/base/',
            classes: [],
            predicates: []
        }
    ];

    const savedOntologies = localStorage.getItem('customOntologies');
    try {
        const customOntologies = savedOntologies ? JSON.parse(savedOntologies) : [];
        window.allOntologies = [...defaultOntologies, ...customOntologies.filter(o => o.id !== 'example' && o.id !== 'blank')];
    } catch (e) {
        console.error("Failed to parse custom ontologies, reverting to default.", e);
        displayMessage('Corrupted custom ontologies found, reset to defaults.', 'warning');
        window.allOntologies = defaultOntologies;
        localStorage.removeItem('customOntologies');
    }

    const ontologySelector = document.getElementById('ontologySelector');
    ontologySelector.innerHTML = '';
    window.allOntologies.forEach(onto => {
        const option = document.createElement('option');
        option.value = onto.id;
        option.textContent = onto.name;
        ontologySelector.appendChild(option);
    });

    // Select the first one by default or a previously selected one
    const prevSelectedId = localStorage.getItem('selectedOntologyId');
    if (prevSelectedId && window.allOntologies.some(o => o.id === prevSelectedId)) {
        ontologySelector.value = prevSelectedId;
    } else {
        ontologySelector.value = defaultOntologies[0].id; // Select default
    }
    updateSelectedOntology(); // Trigger update for UI and global state
}

/**
 * Updates window.appState.selectedOntology based on the dropdown selection.
 */
function updateSelectedOntology() {
    const ontologySelector = document.getElementById('ontologySelector');
    const selectedId = ontologySelector.value;
    const selectedOnto = window.allOntologies.find(o => o.id === selectedId);

    if (selectedOnto) {
        window.appState.selectedOntology = selectedOnto;
        localStorage.setItem('selectedOntologyId', selectedId);
        // Update ontology config modal preview
        document.getElementById('currentOntologyName').textContent = selectedOnto.name;
        document.getElementById('currentOntologyContent').textContent = JSON.stringify(selectedOnto, null, 2);
    } else {
        console.warn('Selected ontology not found:', selectedId);
        window.appState.selectedOntology = null;
        document.getElementById('currentOntologyName').textContent = 'None Selected';
        document.getElementById('currentOntologyContent').textContent = 'Select an ontology or add a custom one.';
    }
}