import { GraphService } from './rdfservice.js';

document.addEventListener('DOMContentLoaded', () => {
    // --- Global State Variables ---
    let csvData = [];
    let csvHeaders = [];
    let rdfStore = null; // rdflib.js store
    let graphData = { nodes: [], links: [] };

    // --- DOM Elements ---
    const navButtons = document.querySelectorAll('.nav-button');
    const tabContents = document.querySelectorAll('.tab-content');

    // Input Tab
    const dropArea = document.getElementById('drop-area');
    const csvFileInput = document.getElementById('csv-file-input');
    const csvPasteInput = document.getElementById('csv-paste-input');
    const parsePasteButton = document.getElementById('parse-paste-button');
    const csvPreview = document.getElementById('csv-preview');

    // Configure Tab
    const baseUriInput = document.getElementById('base-uri');
    const prefixesContainer = document.getElementById('prefixes-container');
    const addPrefixButton = document.getElementById('add-prefix-button');
    const columnMappingContainer = document.getElementById('column-mapping-container');
    const mappingPlaceholder = document.getElementById('mapping-placeholder');
    const generateRdfButton = document.getElementById('generate-rdf-button');

    // Output Tab
    const rdfOutputEditor = document.getElementById('rdf-output-editor');
    const copyRdfButton = document.getElementById('copy-rdf-button');
    const downloadRdfButton = document.getElementById('download-rdf-button');

    // Graph Visualization Tab
    const graphContainer = document.getElementById('graph-container');
    const rdfGraphSvg = document.getElementById('rdf-graph');

    // SPARQL Tester Tab
    const sparqlQueryInput = document.getElementById('sparql-query-input');
    const executeSparqlButton = document.getElementById('execute-sparql-button');
    const sparqlResultsDiv = document.getElementById('sparql-results');

    // Settings Tab
    const csvPreviewRowsInput = document.getElementById('csv-preview-rows');

    // Bottom Bar
    const downloadAllRdfButton = document.getElementById('download-all-rdf-button');
    const exportGraphButton = document.getElementById('export-graph-button');
    const resetAppButton = document.getElementById('reset-app-button');

    // --- Persistent Settings (localStorage) ---
    const SETTINGS_KEY = 'rdf_converter_settings';
    let appSettings = {
        baseURI: 'http://example.org/data/',
        prefixes: [{ name: 'ex', uri: 'http://example.org/ontology/' }],
        mapping: {
            subject: { type: 'column', value: '' },
            predicate: { type: 'column', value: '' },
            object: { type: 'column', value: '', objectType: 'uri' } // 'uri' or 'literal'
        },
        csvPreviewRows: 5
    };

    // --- Utility Functions ---

    function showTab(tabId) {
        // Hide all tab contents
        document.querySelectorAll('.tab-content').forEach(tab => {
            tab.style.display = 'none';
            tab.classList.remove('active');
        });
        
        // Deactivate all buttons
        navButtons.forEach(btn => btn.classList.remove('active'));
        
        // Show the selected tab content
        const selectedTab = document.getElementById(tabId);
        if (selectedTab) {
            selectedTab.style.display = 'block';
            selectedTab.classList.add('active');
        }
        
        // Activate selected button
        const selectedButton = document.querySelector(`[data-tab="${tabId}"]`);
        if (selectedButton) {
            selectedButton.classList.add('active');
        }
    }

    function saveSettings() {
        appSettings.baseURI = baseUriInput.value;
        appSettings.prefixes = Array.from(prefixesContainer.querySelectorAll('.prefix-entry')).map(entry => ({
            name: entry.querySelector('.prefix-name').value,
            uri: entry.querySelector('.prefix-uri').value
        }));
        appSettings.csvPreviewRows = parseInt(csvPreviewRowsInput.value, 10);

        // Save mapping only if headers exist
        if (csvHeaders.length > 0) {
            const subjectSelect = document.getElementById('map-subject');
            const predicateSelect = document.getElementById('map-predicate');
            const objectSelect = document.getElementById('map-object');
            const staticPredicateInput = document.getElementById('static-predicate-value');
            const objectTypeUriRadio = document.getElementById('object-type-uri');

            if (subjectSelect && predicateSelect && objectSelect) {
                appSettings.mapping.subject.value = subjectSelect.value;
                appSettings.mapping.predicate.type = predicateSelect.value.startsWith('static:') ? 'static' : 'column';
                appSettings.mapping.predicate.value = predicateSelect.value.startsWith('static:') ? staticPredicateInput.value : predicateSelect.value;
                appSettings.mapping.object.value = objectSelect.value;
                appSettings.mapping.object.objectType = objectTypeUriRadio.checked ? 'uri' : 'literal';
            }
        }
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(appSettings));
    }

    function loadSettings() {
        const savedSettings = localStorage.getItem(SETTINGS_KEY);
        if (savedSettings) {
            appSettings = { ...appSettings, ...JSON.parse(savedSettings) };
        }

        baseUriInput.value = appSettings.baseURI;
        csvPreviewRowsInput.value = appSettings.csvPreviewRows;

        // Populate prefixes
        prefixesContainer.innerHTML = '<h4>Prefixes:</h4>'; // Clear existing
        appSettings.prefixes.forEach(prefix => addPrefixEntry(prefix.name, prefix.uri));
        if (appSettings.prefixes.length === 0) { // Ensure at least one empty entry if none saved
            addPrefixEntry();
        }
    }

    function resetAll() {
        if (!confirm('Are you sure you want to reset all data and settings? This cannot be undone.')) {
            return;
        }

        localStorage.removeItem(SETTINGS_KEY);
        csvData = [];
        csvHeaders = [];
        rdfStore = null;
        graphData = { nodes: [], links: [] };

        // Reset UI elements
        csvPreview.innerHTML = '<p>No CSV data loaded.</p>';
        csvFileInput.value = '';
        csvPasteInput.value = '';
        rdfOutputEditor.value = '';
        sparqlQueryInput.value = 'PREFIX ex: <http://example.org/ontology/>\nSELECT ?s ?p ?o WHERE { ?s ?p ?o . }\nLIMIT 10';
        sparqlResultsDiv.innerHTML = '<p>No query executed yet.</p>';
        graphContainer.innerHTML = '<p>Upload CSV, configure mapping, and generate RDF to see the graph.</p><svg id="rdf-graph"></svg>'; // Re-add SVG
        columnMappingContainer.innerHTML = '';
        mappingPlaceholder.style.display = 'block';

        // Reload default settings
        appSettings = {
            baseURI: 'http://example.org/data/',
            prefixes: [{ name: 'ex', uri: 'http://example.org/ontology/' }],
            mapping: {
                subject: { type: 'column', value: '' },
                predicate: { type: 'column', value: '' },
                object: { type: 'column', value: '', objectType: 'uri' }
            },
            csvPreviewRows: 5
        };
        loadSettings(); // Apply default settings to UI
        showTab('instructions'); // Go back to instructions
        alert('Application reset successfully!');
    }

    // --- CSV Handling ---

    function handleFileUpload(file) {
        if (!file.name.endsWith('.csv') && file.type !== 'text/csv') {
            alert('Please upload a CSV file');
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                parseCSV(e.target.result);
            } catch (error) {
                console.error('Error reading CSV:', error);
                alert('Error reading CSV file. Please check the file format.');
            }
        };
        reader.onerror = (error) => {
            console.error('FileReader error:', error);
            alert('Error reading file. Please try again.');
        };
        reader.readAsText(file);
    }

    function parseCSV(csvText) {
        Papa.parse(csvText, {
            header: true,
            skipEmptyLines: true,
            complete: function(results) {
                if (results.errors.length > 0) {
                    console.error('CSV parsing errors:', results.errors);
                    alert('Error parsing CSV: ' + results.errors[0].message);
                    return;
                }
                
                if (!results.data || results.data.length === 0) {
                    alert('No valid data found in CSV');
                    return;
                }

                csvData = results.data;
                csvHeaders = results.meta.fields;
                updateCSVPreview();
                renderMappingInterface(csvHeaders); // Update mapping interface with new headers
                showTab('input');
            },
            error: function(error) {
                console.error('PapaParse error:', error);
                alert('Error parsing CSV data. Please check the format.');
            }
        });
    }

    function updateCSVPreview() {
        const previewDiv = document.getElementById('csv-preview');
        const previewRows = parseInt(document.getElementById('csv-preview-rows').value) || 5;
        
        if (!csvData || csvData.length === 0) {
            previewDiv.innerHTML = '<p>No CSV data loaded.</p>';
            return;
        }

        // Create table
        let tableHTML = '<table class="preview-table"><thead><tr>';
        
        // Add headers
        csvHeaders.forEach(header => {
            tableHTML += `<th>${header}</th>`;
        });
        tableHTML += '</tr></thead><tbody>';

        // Add rows
        csvData.slice(0, previewRows).forEach(row => {
            tableHTML += '<tr>';
            csvHeaders.forEach(header => {
                tableHTML += `<td>${row[header] || ''}</td>`;
            });
            tableHTML += '</tr>';
        });

        tableHTML += '</tbody></table>';
        previewDiv.innerHTML = tableHTML;
    }

    // --- Configure Tab (Mapping & Prefixes) ---

    function addPrefixEntry(name = '', uri = '') {
        const div = document.createElement('div');
        div.classList.add('prefix-entry');
        div.innerHTML = `
            <input type="text" class="prefix-name" placeholder="Prefix (e.g., ex)" value="${name}">
            <input type="text" class="prefix-uri" placeholder="URI (e.g., http://example.org/ontology/)" value="${uri}">
            <button class="remove-prefix button-small">Remove</button>
        `;
        div.querySelector('.remove-prefix').addEventListener('click', () => {
            div.remove();
            saveSettings();
        });
        div.querySelectorAll('input').forEach(input => {
            input.addEventListener('change', saveSettings);
        });
        prefixesContainer.appendChild(div);
    }

    function renderMappingInterface(headers) {
        const container = document.getElementById('column-mapping-container');
        const placeholder = document.getElementById('mapping-placeholder');
        
        if (!headers || headers.length === 0) {
            placeholder.style.display = 'block';
            container.innerHTML = '';
            return;
        }

        placeholder.style.display = 'none';
        container.innerHTML = `
            <div class="mapping-group">
                <h4>Subject Mapping</h4>
                <select id="subject-column" class="mapping-select">
                    <option value="">Select column</option>
                    ${headers.map(h => `<option value="${h}">${h}</option>`).join('')}
                </select>
            </div>
            <div class="mapping-group">
                <h4>Predicate Mapping</h4>
                <select id="predicate-column" class="mapping-select">
                    <option value="">Select column</option>
                    ${headers.map(h => `<option value="${h}">${h}</option>`).join('')}
                </select>
            </div>
            <div class="mapping-group">
                <h4>Object Mapping</h4>
                <select id="object-column" class="mapping-select">
                    <option value="">Select column</option>
                    ${headers.map(h => `<option value="${h}">${h}</option>`).join('')}
                </select>
            </div>
        `;
    }

    // Add event listener for the generate RDF button
    document.getElementById('generate-rdf-button').addEventListener('click', () => {
        const subjectCol = document.getElementById('subject-column').value;
        const predicateCol = document.getElementById('predicate-column').value;
        const objectCol = document.getElementById('object-column').value;
        
        if (!subjectCol || !predicateCol || !objectCol) {
            alert('Please select columns for Subject, Predicate, and Object');
            return;
        }
        
        generateRDF(subjectCol, predicateCol, objectCol);
    });

    function generateRDF(subjectCol, predicateCol, objectCol) {
        const baseUri = document.getElementById('base-uri').value.trim() || 'http://example.org/data/';
        const rdf = convertToRDF(csvData, baseUri, subjectCol, predicateCol, objectCol);
        
        // Update RDF output
        const rdfOutput = document.getElementById('rdf-output-editor');
        rdfOutput.value = rdf;
        
        // Switch to output tab
        showTab('output');
    }

    function convertToRDF(data, baseUri, subjectCol, predicateCol, objectCol) {
        let rdf = '';
        const prefixes = getPrefixes();
        
        // Add prefixes
        Object.entries(prefixes).forEach(([prefix, uri]) => {
            rdf += `@prefix ${prefix}: <${uri}> .\n`;
        });
        rdf += '\n';
        
        // Convert data to RDF
        data.forEach(row => {
            const subject = `<${baseUri}${encodeURIComponent(row[subjectCol])}>`;
            const predicate = row[predicateCol];
            const object = row[objectCol];
            
            rdf += `${subject} ${predicate} "${object}" .\n`;
        });
        
        return rdf;
    }

    function getPrefixes() {
        const prefixes = {};
        document.querySelectorAll('.prefix-entry').forEach(entry => {
            const name = entry.querySelector('.prefix-name').value.trim();
            const uri = entry.querySelector('.prefix-uri').value.trim();
            if (name && uri) {
                prefixes[name] = uri;
            }
        });
        return prefixes;
    }

    // Update showTab function to properly handle tab switching
    function showTab(tabId) {
        // Hide all tabs
        document.querySelectorAll('.tab-content').forEach(tab => {
            tab.style.display = 'none';
            tab.classList.remove('active');
        });
        
        // Remove active class from all nav buttons
        document.querySelectorAll('.nav-button').forEach(button => {
            button.classList.remove('active');
        });
        
        // Show selected tab
        const selectedTab = document.getElementById(tabId);
        if (selectedTab) {
            selectedTab.style.display = 'block';
            selectedTab.classList.add('active');
        }
        
        // Add active class to selected nav button
        const activeButton = document.querySelector(`.nav-button[data-tab="${tabId}"]`);
        if (activeButton) {
            activeButton.classList.add('active');
        }
    }

    function copyRDF() {
        rdfOutputEditor.select();
        document.execCommand('copy');
        alert('RDF copied to clipboard!');
    }

    function downloadRDF() {
        const rdfContent = rdfOutputEditor.value;
        if (!rdfContent) {
            alert('No RDF content to download.');
            return;
        }
        const blob = new Blob([rdfContent], { type: 'text/turtle;charset=utf-8' });
        saveAs(blob, 'generated_rdf.ttl');
    }

    // --- Graph Visualization ---

    function initializeGraphControls() {
        const graphService = new GraphService(document.getElementById('graph-container'));
        const buttons = document.querySelectorAll('.chart-btn');
        const predicateFilterContainer = document.getElementById('predicateFilterContainer');
        const predicateFilter = document.getElementById('predicateFilter');

        // Get chart renderers from the service
        const chartRenderers = graphService.getChartRenderers();

        // Handle button clicks
        buttons.forEach(button => {
            button.addEventListener('click', function() {
                buttons.forEach(btn => btn.classList.remove('active'));
                this.classList.add('active');

                const chartType = this.dataset.chart;
                predicateFilterContainer.style.display = 
                    chartType === 'forceDirected' ? 'block' : 'none';

                if (chartRenderers[chartType]) {
                    chartRenderers[chartType]();
                }
            });
        });

        // Handle predicate filter changes
        predicateFilter.addEventListener('change', function() {
            graphService.updatePredicateFilter(this.value);
        });

        return graphService;
    }

    function initializeGraphVisualization() {
        const graphService = new GraphService(document.getElementById('graph-container'));
        const chartButtons = document.querySelectorAll('.chart-btn');
        const predicateFilter = document.getElementById('predicateFilter');
        
        // Get chart renderers from the service
        const chartRenderers = graphService.getChartRenderers();
        
        // Handle chart button clicks
        chartButtons.forEach(button => {
            button.addEventListener('click', () => {
                // Remove active class from all buttons
                chartButtons.forEach(btn => btn.classList.remove('active'));
                // Add active class to clicked button
                button.classList.add('active');
                
                const chartType = button.dataset.chart;
                
                // Show/hide predicate filter only for Force Directed Graph
                const filterContainer = document.getElementById('predicateFilterContainer');
                filterContainer.style.display = chartType === 'forceDirected' ? 'block' : 'none';
                
                // Render the selected chart
                if (chartRenderers[chartType]) {
                    try {
                        chartRenderers[chartType]();
                    } catch (error) {
                        console.error(`Error rendering ${chartType}:`, error);
                        document.getElementById('graph-message').textContent = 
                            'Error rendering chart. Please check console for details.';
                    }
                }
            });
        });
        
        // Handle predicate filter changes
        predicateFilter.addEventListener('change', () => {
            graphService.updatePredicateFilter(predicateFilter.value);
        });
        
        return graphService;
    }

    // Call this when RDF data is generated
    function updateGraphVisualization(rdfData) {
        const graphService = initializeGraphVisualization();
        graphService.renderChart(rdfData, 'forceDirected');
        
        // Update predicate filter options
        const predicates = graphService.getUniquePredicateLabels();
        const predicateFilter = document.getElementById('predicateFilter');
        predicateFilter.innerHTML = '<option value="">All Predicates</option>' +
            predicates.map(pred => `<option value="${pred}">${pred}</option>`).join('');
    }

    // --- Initialization ---
    loadSettings();
    showTab('instructions'); // Show instructions tab by default

    // Initialize graph service
    const graphService = initializeGraphControls();

    // Update export graph button to use GraphService
    exportGraphButton.addEventListener('click', () => graphService.exportGraphAsSvg());

    // Update predicate options helper function
    function updatePredicateOptions() {
        const predicates = graphService.getUniquePredicateLabels();
        const predicateFilter = document.getElementById('predicateFilter');
        if (predicateFilter) {
            predicateFilter.innerHTML = '<option value="">All Predicates</option>' +
                predicates.map(pred => 
                    `<option value="${pred}">${pred}</option>`
                ).join('');
        }
    }

    // Add click handlers to nav buttons
    navButtons.forEach(button => {
        button.addEventListener('click', () => {
            const tabId = button.getAttribute('data-tab');
            showTab(tabId);
        });
    });

    // Show initial tab
    showTab('instructions');

    // File Upload Event Listeners
    dropArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropArea.classList.add('dragover');
    });

    dropArea.addEventListener('dragleave', () => {
        dropArea.classList.remove('dragover');
    });

    dropArea.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropArea.classList.remove('dragover');
        const file = e.dataTransfer.files[0];
        if (file) handleFileUpload(file);
    });

    // File input change handler
    csvFileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) handleFileUpload(file);
    });

    // Parse pasted CSV data
    parsePasteButton.addEventListener('click', () => {
        const pastedData = csvPasteInput.value.trim();
        if (pastedData) {
            parseCSV(pastedData);
        } else {
            alert('Please paste some CSV data first');
        }
    });
});

async function executeComunicaSparql(query, turtleText) {
    const comunicaEngine = new Comunica.QueryEngine();
    const results = [];
    const bindingsStream = await comunicaEngine.queryBindings(query, {
        sources: [{ type: 'string', value: turtleText, mediaType: 'text/turtle' }]
    });
    const bindings = await bindingsStream.toArray();
    bindings.forEach(binding => {
        const row = {};
        for (const [key, value] of binding.entries()) {
            row[key] = value.value;
        }
        results.push(row);
    });
    return results;
}