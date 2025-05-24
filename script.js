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
            tab.classList.remove('active');
        });
        
        // Remove active class from all nav buttons
        document.querySelectorAll('.nav-button').forEach(button => {
            button.classList.remove('active');
        });
        
        // Show the selected tab content
        const selectedTab = document.getElementById(tabId);
        if (selectedTab) {
            selectedTab.classList.add('active');
        }
        
        // Add active class to the corresponding nav button
        const activeButton = document.querySelector(`.nav-button[data-tab="${tabId}"]`);
        if (activeButton) {
            activeButton.classList.add('active');
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

    function parseCSV(fileOrString) {
        if (typeof fileOrString === 'string') {
            // Parse CSV string directly
            Papa.parse(fileOrString, {
                header: true,
                skipEmptyLines: true,
                complete: function(results) {
                    if (results.errors.length) {
                        console.error("CSV Parsing errors:", results.errors);
                        alert("Error parsing CSV: " + results.errors[0].message);
                        return;
                    }
                    csvData = results.data;
                    csvHeaders = results.meta.fields;
                    displayCSVPreview(csvData, appSettings.csvPreviewRows);
                    renderMappingInterface(csvHeaders);
                    saveSettings();
                }
            });
        } else if (fileOrString instanceof File) {
            // Read file as text, then parse
            const reader = new FileReader();
            reader.onload = function(e) {
                Papa.parse(e.target.result, {
                    header: true,
                    skipEmptyLines: true,
                    complete: function(results) {
                        if (results.errors.length) {
                            console.error("CSV Parsing errors:", results.errors);
                            alert("Error parsing CSV: " + results.errors[0].message);
                            return;
                        }
                        csvData = results.data;
                        csvHeaders = results.meta.fields;
                        displayCSVPreview(csvData, appSettings.csvPreviewRows);
                        renderMappingInterface(csvHeaders);
                        saveSettings();
                    }
                });
            };
            reader.readAsText(fileOrString);
        }
    }

    function displayCSVPreview(data, numRows) {
        if (data.length === 0) {
            csvPreview.innerHTML = '<p>No CSV data loaded.</p>';
            return;
        }

        let tableHtml = '<table><thead><tr>';
        csvHeaders.forEach(header => {
            tableHtml += `<th>${header}</th>`;
        });
        tableHtml += '</tr></thead><tbody>';

        data.slice(0, numRows).forEach(row => {
            tableHtml += '<tr>';
            csvHeaders.forEach(header => {
                tableHtml += `<td>${row[header] || ''}</td>`;
            });
            tableHtml += '</tr>';
        });
        tableHtml += '</tbody></table>';
        csvPreview.innerHTML = tableHtml;
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
        if (headers.length === 0) {
            columnMappingContainer.innerHTML = '';
            mappingPlaceholder.style.display = 'block';
            return;
        }
        mappingPlaceholder.style.display = 'none';

        const currentMapping = appSettings.mapping;

        // Helper to get a valid value or fallback to first header
        const getValidOrFirst = (val) => (headers.includes(val) ? val : headers[0]);

        columnMappingContainer.innerHTML = `
            <div class="column-mapping-row">
                <div>
                    <label for="map-subject">Subject Column:</label>
                    <select id="map-subject">
                        ${headers.map(h => `<option value="${h}">${h}</option>`).join('')}
                    </select>
                </div>
                <div>
                    <label for="map-predicate">Predicate Column / Static:</label>
                    <select id="map-predicate">
                        ${headers.map(h => `<option value="${h}">${h}</option>`).join('')}
                        <option value="static:predicate">Static Predicate</option>
                    </select>
                    <input type="text" id="static-predicate-value" class="static-predicate-input" placeholder="Static Predicate URI" value="${currentMapping.predicate.type === 'static' ? currentMapping.predicate.value : ''}">
                </div>
                <div>
                    <label for="map-object">Object Column:</label>
                    <select id="map-object">
                        ${headers.map(h => `<option value="${h}">${h}</option>`).join('')}
                    </select>
                    <div class="radio-group">
                        <label><input type="radio" name="object-type" id="object-type-uri" value="uri" ${currentMapping.object.objectType === 'uri' ? 'checked' : ''}> URI</label>
                        <label><input type="radio" name="object-type" id="object-type-literal" value="literal" ${currentMapping.object.objectType === 'literal' ? 'checked' : ''}> Literal</label>
                    </div>
                </div>
            </div>
        `;

        // Set selects to valid or default values
        const subjectSelect = document.getElementById('map-subject');
        const predicateSelect = document.getElementById('map-predicate');
        const objectSelect = document.getElementById('map-object');
        const staticPredicateInput = document.getElementById('static-predicate-value');
        const objectTypeUriRadio = document.getElementById('object-type-uri');
        const objectTypeLiteralRadio = document.getElementById('object-type-literal');

        subjectSelect.value = getValidOrFirst(currentMapping.subject.value);
        objectSelect.value = getValidOrFirst(currentMapping.object.value);

        if (currentMapping.predicate.type === 'static') {
            predicateSelect.value = 'static:predicate';
            staticPredicateInput.style.display = 'block';
        } else {
            predicateSelect.value = getValidOrFirst(currentMapping.predicate.value);
            staticPredicateInput.style.display = 'none';
        }

        // Event listeners for mapping changes
        subjectSelect.addEventListener('change', saveSettings);
        objectSelect.addEventListener('change', saveSettings);
        objectTypeUriRadio.addEventListener('change', saveSettings);
        objectTypeLiteralRadio.addEventListener('change', saveSettings);

        predicateSelect.addEventListener('change', () => {
            if (predicateSelect.value === 'static:predicate') {
                staticPredicateInput.style.display = 'block';
            } else {
                staticPredicateInput.style.display = 'none';
            }
            saveSettings();
        });
        staticPredicateInput.addEventListener('change', saveSettings);
    }

    // --- RDF Conversion ---

    function getPrefixMap() {
        const prefixes = {};
        prefixesContainer.querySelectorAll('.prefix-entry').forEach(entry => {
            const name = entry.querySelector('.prefix-name').value.trim();
            const uri = entry.querySelector('.prefix-uri').value.trim();
            if (name && uri) {
                prefixes[name] = uri;
            }
        });
        return prefixes;
    }

    function generateRDF() {
        if (csvData.length === 0) {
            alert('Please upload CSV data first.');
            showTab('input');
            return;
        }

        const subjectCol = document.getElementById('map-subject').value;
        const predicateCol = document.getElementById('map-predicate').value;
        const objectCol = document.getElementById('map-object').value;
        const objectType = document.querySelector('input[name="object-type"]:checked').value;

        const baseURI = baseUriInput.value.endsWith('/') ? baseUriInput.value : baseUriInput.value + '/';
        const prefixMap = getPrefixMap();

        rdfStore = $rdf.graph();

        csvData.forEach(row => {
            const subjectValue = row[subjectCol];
            const predicateValue = row[predicateCol];
            const objectValue = row[objectCol];

            if (!subjectValue || !predicateValue || !objectValue) return;

            const subjectNode = $rdf.sym(baseURI + encodeURIComponent(subjectValue.trim().replace(/\s+/g, '_')));
            const predicateNode = $rdf.sym(resolveUri(predicateValue.trim(), prefixMap));

            let objectNode;
            if (objectType === 'uri') {
                objectNode = $rdf.sym(resolveUri(objectValue.trim(), prefixMap));
            } else {
                objectNode = $rdf.literal(objectValue.trim());
            }

            rdfStore.add(subjectNode, predicateNode, objectNode);
        });

        // Serialize to Turtle
        const namespaces = {
            ex: baseURI,
            rdf: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
            rdfs: 'http://www.w3.org/2000/01/rdf-schema#',
            owl: 'http://www.w3.org/2002/07/owl#',
            ...prefixMap
        };
        const serializer = new $rdf.Serializer(rdfStore, { namespaces });
        const rdfString = serializer.statementsToN3(rdfStore.statements);
        rdfOutputEditor.value = rdfString;

        // Update graph visualization using GraphService
        graphData = graphService.convertRdfToD3Format(rdfStore);
        graphService.renderChart(graphData, 'forceDirected');
        updatePredicateOptions(); // Update filter options after loading new data
    }


    function resolveUri(uriStr, prefixMap) {
        for (const prefixName in prefixMap) {
            if (uriStr.startsWith(`${prefixName}:`)) {
                return uriStr.replace(`${prefixName}:`, prefixMap[prefixName]);
            }
        }
        // If no prefix matches and it's not a full URI, prepend base URI
        if (!uriStr.match(/^[a-zA-Z]+:\/\//)) { // Check if it's already a full URI
            return baseUriInput.value + encodeURIComponent(uriStr.replace(/\s+/g, '_'));
        }
        return uriStr; // Return as is if it's already a full URI
    }

    // --- RDF Output Actions ---

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