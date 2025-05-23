document.addEventListener('DOMContentLoaded', () => {
    // --- Global State Variables ---
    let csvData = [];
    let csvHeaders = [];
    let rdfStore = null; // rdflib.js store
    let graphData = { nodes: [], links: [] };
    let d3Simulation = null;
    let d3Svg = null;
    let d3G = null;
    let d3Link = null;
    let d3Node = null;
    let d3LinkLabel = null;

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
        tabContents.forEach(content => {
            content.classList.remove('active');
        });
        navButtons.forEach(button => {
            button.classList.remove('active');
        });

        document.getElementById(tabId).classList.add('active');
        document.querySelector(`.nav-button[data-tab="${tabId}"]`).classList.add('active');

        // If switching to RDF Output, sync mapping and generate RDF
        if (tabId === 'output') {
            syncMappingFromUI();
            generateRDF();
        }

        // Re-render graph if switching to its tab
        if (tabId === 'graph-visualization' && graphData.nodes.length > 0) {
            renderGraph(rdfStore);
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
        d3Simulation = null;
        d3Svg = null;
        d3G = null;

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
        const predicateMappingType = document.getElementById('map-predicate').value.startsWith('static:') ? 'static' : 'column';
        const predicateColOrStaticValue = predicateMappingType === 'static' ? document.getElementById('static-predicate-value').value : document.getElementById('map-predicate').value;
        const objectCol = document.getElementById('map-object').value;
        const objectType = document.querySelector('input[name="object-type"]:checked').value;

        const baseURI = baseUriInput.value.endsWith('/') ? baseUriInput.value : baseUriInput.value + '/';
        const prefixMap = getPrefixMap();

        rdfStore = $rdf.graph();
        rdfStore.setNamespace($rdf.Namespace(baseURI)); // Set default namespace for convenience

        // Add prefixes to rdflib store
        for (const name in prefixMap) {
            rdfStore.setPrefix(name, $rdf.Namespace(prefixMap[name]));
        }

        csvData.forEach(row => {
            const subjectValue = row[subjectCol];
            const objectValue = row[objectCol];

            if (!subjectValue || !objectValue) {
                console.warn(`Skipping row due to missing subject or object value: ${JSON.stringify(row)}`);
                return;
            }

            let subjectNode;
            try {
                // Try to create a valid URI for the subject
                subjectNode = $rdf.sym(baseURI + encodeURIComponent(subjectValue.replace(/\s+/g, '_')));
            } catch (e) {
                console.error(`Invalid subject URI for value: ${subjectValue}`, e);
                return; // Skip this triple if subject is invalid
            }

            let predicateNode;
            if (predicateMappingType === 'static') {
                try {
                    predicateNode = $rdf.sym(predicateColOrStaticValue);
                } catch (e) {
                    console.error(`Invalid static predicate URI: ${predicateColOrStaticValue}`, e);
                    return; // Skip this triple
                }
            } else {
                const predicateColValue = row[predicateColOrStaticValue];
                if (!predicateColValue) {
                    console.warn(`Skipping row due to missing predicate column value: ${JSON.stringify(row)}`);
                    return;
                }
                try {
                    // Attempt to resolve predicate using prefixes or use as-is
                    const resolvedPredicateUri = resolveUri(predicateColValue, prefixMap);
                    predicateNode = $rdf.sym(resolvedPredicateUri);
                } catch (e) {
                    console.error(`Invalid predicate URI for value: ${predicateColValue}`, e);
                    return; // Skip this triple
                }
            }

            let objectNode;
            if (objectType === 'uri') {
                try {
                    const resolvedObjectUri = resolveUri(objectValue, prefixMap);
                    objectNode = $rdf.sym(resolvedObjectUri);
                } catch (e) {
                    console.error(`Invalid object URI for value: ${objectValue}`, e);
                    return; // Skip this triple
                }
            } else { // literal
                objectNode = $rdf.lit(objectValue);
            }

            rdfStore.add(subjectNode, predicateNode, objectNode);
        });

        // Serialize to Turtle
        const serializer = new $rdf.Serializer(rdfStore);
        serializer.setPrefixForUri('ex', baseURI); // Ensure base URI is always prefixed if desired
        serializer.setPrefixForUri('rdf', 'http://www.w3.org/1999/02/22-rdf-syntax-ns#');
        serializer.setPrefixForUri('rdfs', 'http://www.w3.org/2000/01/rdf-schema#');
        serializer.setPrefixForUri('owl', 'http://www.w3.org/2002/07/owl#');
        for (const name in prefixMap) {
            serializer.setPrefixForUri(name, prefixMap[name]);
        }

        const rdfString = serializer.statementsToN3(rdfStore.statements);
        rdfOutputEditor.value = rdfString;

        // Prepare graph data
        graphData = convertRdfToD3Format(rdfStore);
        renderGraph(rdfStore); // Re-render graph with new data

        showTab('output');
        alert('RDF generated successfully!');
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

    function convertRdfToD3Format(store) {
        const nodes = [];
        const links = [];
        const nodeMap = new Map(); // Map URI/Literal to node object
        let nodeIdCounter = 0;

        store.statements.forEach(st => {
            const subjectUri = st.subject.value;
            const predicateUri = st.predicate.value;
            const objectValue = st.object.value;
            const isObjectLiteral = st.object.termType === 'Literal';

            // Add subject node
            if (!nodeMap.has(subjectUri)) {
                nodeMap.set(subjectUri, { id: nodeIdCounter++, label: st.subject.uri.split('/').pop().split('#').pop() || subjectUri, uri: subjectUri, type: 'subject' });
                nodes.push(nodeMap.get(subjectUri));
            }

            // Add object node
            const objectKey = isObjectLiteral ? `LITERAL:${objectValue}` : objectValue;
            if (!nodeMap.has(objectKey)) {
                nodeMap.set(objectKey, { id: nodeIdCounter++, label: isObjectLiteral ? objectValue : (st.object.uri.split('/').pop().split('#').pop() || objectValue), uri: isObjectLiteral ? null : objectValue, type: isObjectLiteral ? 'literal' : 'object' });
                nodes.push(nodeMap.get(objectKey));
            }

            // Add link
            links.push({
                source: nodeMap.get(subjectUri).id,
                target: nodeMap.get(objectKey).id,
                label: predicateUri.split('/').pop().split('#').pop() || predicateUri,
                uri: predicateUri
            });
        });

        // Deduplicate nodes based on ID
        const uniqueNodes = Array.from(new Map(nodes.map(node => [node.id, node])).values());

        return { nodes: uniqueNodes, links: links };
    }

    function renderGraph(store) {
        if (!store || store.statements.length === 0) {
            graphContainer.innerHTML = '<p>Upload CSV, configure mapping, and generate RDF to see the graph.</p><svg id="rdf-graph"></svg>';
            return;
        }

        const data = convertRdfToD3Format(store);
        const width = graphContainer.clientWidth;
        const height = graphContainer.clientHeight;

        // Clear existing SVG content
        d3.select("#rdf-graph").selectAll("*").remove();

        d3Svg = d3.select("#rdf-graph")
            .attr("viewBox", [0, 0, width, height]);

        // Add a group for the graph elements that will be transformed by zoom/pan
        d3G = d3Svg.append("g");

        d3Simulation = d3.forceSimulation(data.nodes)
            .force("link", d3.forceLink(data.links).id(d => d.id).distance(100))
            .force("charge", d3.forceManyBody().strength(-300))
            .force("center", d3.forceCenter(width / 2, height / 2))
            .force("x", d3.forceX())
            .force("y", d3.forceY());

        d3Link = d3G.append("g")
            .attr("stroke", "#999")
            .attr("stroke-opacity", 0.6)
            .selectAll("line")
            .data(data.links)
            .join("line")
            .attr("stroke-width", d => Math.sqrt(d.value || 1));

        d3LinkLabel = d3G.append("g")
            .attr("class", "link-labels")
            .selectAll("text")
            .data(data.links)
            .join("text")
            .attr("font-size", 9)
            .attr("fill", "#555")
            .attr("text-anchor", "middle")
            .text(d => d.label);

        d3Node = d3G.append("g")
            .attr("stroke", "#fff")
            .attr("stroke-width", 1.5)
            .selectAll("g")
            .data(data.nodes)
            .join("g")
            .attr("class", "node")
            .call(d3.drag()
                .on("start", dragstarted)
                .on("drag", dragged)
                .on("end", dragended));

        d3Node.append("circle")
            .attr("r", 10)
            .attr("fill", d => d.type === 'subject' ? '#4CAF50' : (d.type === 'literal' ? '#FFC107' : '#2196F3'));

        d3Node.append("text")
            .attr("x", 0)
            .attr("y", "0.31em")
            .attr("dy", "1.5em") // Position text below circle
            .text(d => d.label)
            .clone(true).lower()
            .attr("fill", "none")
            .attr("stroke", "white")
            .attr("stroke-width", 3);

        d3Simulation.on("tick", () => {
            d3Link
                .attr("x1", d => d.source.x)
                .attr("y1", d => d.source.y)
                .attr("x2", d => d.target.x)
                .attr("y2", d => d.target.y);

            d3LinkLabel
                .attr("x", d => (d.source.x + d.target.x) / 2)
                .attr("y", d => (d.source.y + d.target.y) / 2);

            d3Node
                .attr("transform", d => `translate(${d.x},${d.y})`);
        });

        // Add zoom and pan functionality
        const zoom = d3.zoom()
            .scaleExtent([0.1, 8])
            .on("zoom", (event) => {
                d3G.attr("transform", event.transform);
            });
        d3Svg.call(zoom);


        // Click highlighting
        d3Node.on("click", (event, d) => {
            // Clear previous highlights
            d3Node.classed("highlighted", false);
            d3Link.classed("highlighted", false);
            d3LinkLabel.classed("highlighted", false);

            // Highlight clicked node
            d3.select(event.currentTarget).classed("highlighted", true);

            // Highlight connected links and nodes
            d3Link.filter(l => l.source.id === d.id || l.target.id === d.id)
                .classed("highlighted", true);
            d3LinkLabel.filter(l => l.source.id === d.id || l.target.id === d.id)
                .classed("highlighted", true);

            d3Node.filter(n => {
                return data.links.some(l =>
                    (l.source.id === d.id && l.target.id === n.id) ||
                    (l.target.id === d.id && l.source.id === n.id)
                );
            }).classed("highlighted", true);
        });

        d3Svg.on("click", (event) => {
            // If click is on SVG itself (not a node/link), clear highlights
            if (event.target === d3Svg.node() || event.target === d3G.node()) {
                d3Node.classed("highlighted", false);
                d3Link.classed("highlighted", false);
                d3LinkLabel.classed("highlighted", false);
            }
        });

        function dragstarted(event, d) {
            if (!event.active) d3Simulation.alphaTarget(0.3).restart();
            d.fx = d.x;
            d.fy = d.y;
        }

        function dragged(event, d) {
            d.fx = event.x;
            d.fy = event.y;
        }

        function dragended(event, d) {
            if (!event.active) d3Simulation.alphaTarget(0);
            d.fx = null;
            d.fy = null;
        }
    }

    function exportGraphAsSvg() {
        if (!d3Svg) {
            alert('No graph to export.');
            return;
        }
        const svgString = new XMLSerializer().serializeToString(d3Svg.node());
        const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
        saveAs(blob, 'rdf_graph.svg');
    }

    // --- SPARQL Tester ---

    async function executeSPARQL() {
        if (!rdfStore || rdfStore.statements.length === 0) {
            alert('No RDF graph loaded. Please generate RDF first.');
            showTab('output');
            return;
        }

        const query = sparqlQueryInput.value;
        if (!query.trim()) {
            alert('Please enter a SPARQL query.');
            return;
        }

        try {
            const queryEngine = $rdf.SPARQL.query(query, rdfStore);
            const results = [];
            await new Promise((resolve, reject) => {
                queryEngine.each((solution) => {
                    const row = {};
                    solution.variables.forEach(v => {
                        row[v.value] = solution[v].value;
                    });
                    results.push(row);
                }, undefined, () => resolve(), (err) => reject(err));
            });

            displaySparqlResults(results);

        } catch (e) {
            console.error("SPARQL Query Error:", e);
            sparqlResultsDiv.innerHTML = `<p style="color:red;">Error executing query: ${e.message || e}</p>`;
        }
    }

    function displaySparqlResults(results) {
        if (results.length === 0) {
            sparqlResultsDiv.innerHTML = '<p>No results found.</p>';
            return;
        }

        const variables = Object.keys(results[0]);
        let tableHtml = '<table><thead><tr>';
        variables.forEach(v => tableHtml += `<th>?${v}</th>`);
        tableHtml += '</tr></thead><tbody>';

        results.forEach(row => {
            tableHtml += '<tr>';
            variables.forEach(v => tableHtml += `<td>${row[v] || ''}</td>`);
            tableHtml += '</tr>';
        });
        tableHtml += '</tbody></table>';
        sparqlResultsDiv.innerHTML = tableHtml;
    }

    function syncMappingFromUI() {
        const subjectSelect = document.getElementById('map-subject');
        const predicateSelect = document.getElementById('map-predicate');
        const objectSelect = document.getElementById('map-object');
        const staticPredicateInput = document.getElementById('static-predicate-value');
        const objectTypeUriRadio = document.getElementById('object-type-uri');

        if (subjectSelect && predicateSelect && objectSelect && staticPredicateInput && objectTypeUriRadio) {
            appSettings.mapping.subject.value = subjectSelect.value;
            appSettings.mapping.predicate.type = predicateSelect.value.startsWith('static:') ? 'static' : 'column';
            appSettings.mapping.predicate.value = predicateSelect.value.startsWith('static:') ? staticPredicateInput.value : predicateSelect.value;
            appSettings.mapping.object.value = objectSelect.value;
            appSettings.mapping.object.objectType = objectTypeUriRadio.checked ? 'uri' : 'literal';
            saveSettings();
        }
    }

    // --- Event Listeners ---

    // Navigation
    navButtons.forEach(button => {
        button.addEventListener('click', () => {
            const tabId = button.dataset.tab;
            showTab(tabId);
        });
    });

    // Input Tab
    dropArea.addEventListener('dragover', (event) => {
        event.preventDefault();
        dropArea.classList.add('highlight');
    });
    dropArea.addEventListener('dragleave', () => {
        dropArea.classList.remove('highlight');
    });
    dropArea.addEventListener('drop', (event) => {
        event.preventDefault();
        dropArea.classList.remove('highlight');
        const files = event.dataTransfer.files;
        if (files.length > 0) {
            parseCSV(files[0]);
        }
    });
    csvFileInput.addEventListener('change', (event) => {
        if (event.target.files.length > 0) {
            parseCSV(event.target.files[0]);
        }
    });
    parsePasteButton.addEventListener('click', () => {
        const csvString = csvPasteInput.value.trim();
        if (csvString) {
            parseCSV(csvString);
        } else {
            alert('Please paste CSV data into the text area.');
        }
    });

    // Configure Tab
    baseUriInput.addEventListener('change', saveSettings);
    addPrefixButton.addEventListener('click', () => {
        addPrefixEntry();
        saveSettings();
    });
    generateRdfButton.addEventListener('click', () => showTab('output'));

    // Output Tab
    copyRdfButton.addEventListener('click', copyRDF);
    downloadRdfButton.addEventListener('click', downloadRDF);

    // SPARQL Tester Tab
    executeSparqlButton.addEventListener('click', executeSPARQL);

    // Settings Tab
    csvPreviewRowsInput.addEventListener('change', () => {
        appSettings.csvPreviewRows = parseInt(csvPreviewRowsInput.value, 10);
        if (csvData.length > 0) {
            displayCSVPreview(csvData, appSettings.csvPreviewRows);
        }
        saveSettings();
    });

    // Bottom Bar Actions
    downloadAllRdfButton.addEventListener('click', downloadRDF); // Re-use existing function
    exportGraphButton.addEventListener('click', exportGraphAsSvg);
    resetAppButton.addEventListener('click', resetAll);

    // --- Initialization ---
    loadSettings();
    showTab('instructions'); // Show instructions tab by default
});