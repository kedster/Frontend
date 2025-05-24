/**
 * main.js
 * Main application logic, UI interaction, and orchestration.
 */

// Global rdflib.js namespace (window.S for easier access as per rdflib.js common usage)
window.S = window.rdf;

document.addEventListener('DOMContentLoaded', () => {
    const csvFileInput = document.getElementById('csvFileInput');
    const fileDropZone = document.getElementById('fileDropZone');
    const csvTabsContainer = document.getElementById('csvTabsContainer');
    const ontologySelector = document.getElementById('ontologySelector');
    const configureOntologyBtn = document.getElementById('configureOntologyBtn');
    const configureSparqlBtn = document.getElementById('configureSparqlBtn');
    const sparqlConfigModal = document.getElementById('sparqlConfigModal');
    const ontologyConfigModal = document.getElementById('ontologyConfigModal');
    const addMappingBtn = document.getElementById('addMappingBtn');
    const generateRdfBtn = document.getElementById('generateRdfBtn');
    const rdfFormatSelector = document.getElementById('rdfFormatSelector');
    const rdfOutputPreview = document.getElementById('rdfOutputPreview');
    const downloadRdfBtn = document.getElementById('downloadRdfBtn');
    const sendToSparqlBtn = document.getElementById('sendToSparqlBtn');

    // Load initial configs
    loadSparqlConfig();
    loadOntologies();
    updateGenerateButtonState();

    // Event Listeners
    csvFileInput.addEventListener('change', handleFileUpload);
    fileDropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        fileDropZone.classList.add('hover');
    });
    fileDropZone.addEventListener('dragleave', (e) => {
        e.preventDefault();
        fileDropZone.classList.remove('hover');
    });
    fileDropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        fileDropZone.classList.remove('hover');
        handleFileUpload({ target: { files: e.dataTransfer.files } });
    });

    ontologySelector.addEventListener('change', () => {
        updateSelectedOntology();
        updateGenerateButtonState();
    });

    configureOntologyBtn.addEventListener('click', () => {
        openModal(ontologyConfigModal);
        // Pre-fill custom ontology input with current selected if it's a known custom one
        const currentOnto = window.appState.selectedOntology;
        if (currentOnto && !['example', 'blank'].includes(currentOnto.id)) {
             document.getElementById('customOntologyInput').value = JSON.stringify(currentOnto, null, 2);
        } else {
            document.getElementById('customOntologyInput').value = '';
        }
    });
    configureSparqlBtn.addEventListener('click', () => openModal(sparqlConfigModal));

    document.getElementById('sparqlConfigForm').addEventListener('submit', (e) => {
        e.preventDefault();
        if (saveSparqlConfig()) {
            closeModal(sparqlConfigModal);
        }
    });

    document.getElementById('saveCustomOntologyBtn').addEventListener('click', () => {
        const customInput = document.getElementById('customOntologyInput').value;
        try {
            const newOnto = JSON.parse(customInput);
            if (!newOnto.id || !newOnto.name || !newOnto.prefixes || !newOnto.base) {
                throw new Error('Ontology must have id, name, prefixes, and base IRI.');
            }
            // Ensure unique ID for custom ontologies
            if (window.allOntologies.some(o => o.id === newOnto.id && !['example', 'blank'].includes(newOnto.id))) {
                // If it's a known custom ID, update; otherwise, warn.
                if (window.appState.selectedOntology && window.appState.selectedOntology.id === newOnto.id) {
                    // Update current ontology in allOntologies array
                    const index = window.allOntologies.findIndex(o => o.id === newOnto.id);
                    if (index > -1) window.allOntologies[index] = newOnto;
                } else {
                    displayMessage('Ontology with this ID already exists. Please use a unique ID.', 'error');
                    return;
                }
            } else {
                 if(['example','blank'].includes(newOnto.id)){
                    displayMessage(`Cannot use reserved ID: ${newOnto.id}. Please choose another.`, 'error');
                    return;
                 }
                window.allOntologies.push(newOnto);
            }
            localStorage.setItem('customOntologies', JSON.stringify(window.allOntologies.filter(o => !['example', 'blank'].includes(o.id))));
            loadOntologies(); // Re-populate selector and update selected
            ontologySelector.value = newOnto.id; // Select the newly added/updated one
            updateSelectedOntology(); // Set global state
            displayMessage('Custom ontology saved and selected.', 'success');
            closeModal(ontologyConfigModal);
            updateGenerateButtonState();
        } catch (e) {
            displayMessage(`Invalid JSON or missing fields for custom ontology: ${e.message}`, 'error');
        }
    });

    document.getElementById('resetOntologiesBtn').addEventListener('click', () => {
        localStorage.removeItem('customOntologies');
        localStorage.removeItem('selectedOntologyId');
        loadOntologies();
        displayMessage('Ontologies reset to default.', 'info');
        updateGenerateButtonState();
    });

    document.querySelectorAll('.close-button').forEach(button => {
        button.addEventListener('click', (e) => {
            const modalId = e.target.dataset.modal;
            closeModal(document.getElementById(modalId));
        });
    });

    // Close modals when clicking outside
    window.addEventListener('click', (event) => {
        if (event.target === sparqlConfigModal) {
            closeModal(sparqlConfigModal);
        }
        if (event.target === ontologyConfigModal) {
            closeModal(ontologyConfigModal);
        }
    });

    addMappingBtn.addEventListener('click', () => {
        addMappingRow(onMappingChange, onRemoveMapping, window.allCsvData);
        updateGenerateButtonState();
    });

    generateRdfBtn.addEventListener('click', async () => {
        hideMessage();
        if (!window.appState.selectedOntology) {
            displayMessage('Please select an ontology before generating RDF.', 'warning');
            return;
        }
        if (window.allCsvData.size === 0) {
            displayMessage('Please upload at least one CSV file.', 'warning');
            return;
        }

        displayMessage('Generating RDF...', 'info');
        try {
            const format = rdfFormatSelector.value;
            const rdfString = await generateRDF(format);
            rdfOutputPreview.textContent = rdfString;
            downloadRdfBtn.disabled = false;
            sendToSparqlBtn.disabled = false;
            displayMessage('RDF generated successfully!', 'success');
        } catch (error) {
            rdfOutputPreview.textContent = `Error generating RDF: ${error.message}`;
            downloadRdfBtn.disabled = true;
            sendToSparqlBtn.disabled = true;
            displayMessage(`Error generating RDF: ${error.message}`, 'error');
            console.error('RDF Generation Error:', error);
        }
    });

    downloadRdfBtn.addEventListener('click', () => {
        const rdfContent = rdfOutputPreview.textContent;
        if (!rdfContent || rdfContent.includes('Error generating RDF')) {
            displayMessage('Nothing to download or an error occurred during generation.', 'warning');
            return;
        }
        const format = rdfFormatSelector.value;
        const filename = `output.${format === 'Turtle' ? 'ttl' : 'jsonld'}`;
        const blob = new Blob([rdfContent], { type: format === 'Turtle' ? 'text/turtle' : 'application/ld+json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    });

    sendToSparqlBtn.addEventListener('click', () => {
        const rdfContent = rdfOutputPreview.textContent;
        if (!rdfContent || rdfContent.includes('Generated RDF will appear here') || rdfContent.includes('Error generating RDF')) {
            displayMessage('Generate RDF first before sending.', 'warning');
            return;
        }
        const format = rdfFormatSelector.value;
        sendToSPARQL(rdfContent, format);
    });

    // Helper to update button states based on application readiness
    function updateGenerateButtonState() {
        const isReady = window.allCsvData.size > 0 && window.appState.selectedOntology !== null;
        generateRdfBtn.disabled = !isReady;
        // Download and Send depend on RDF being generated
        downloadRdfBtn.disabled = true;
        sendToSparqlBtn.disabled = true;
        addMappingBtn.disabled = window.allCsvData.size === 0;
    }

    // Handlers for CSV processing
    async function handleFileUpload(event) {
        hideMessage();
        const files = event.target.files;
        if (files.length === 0) return;

        displayMessage(`Processing ${files.length} file(s)...`, 'info');
        let processedCount = 0;

        for (const file of files) {
            if (window.allCsvData.has(file.name)) {
                displayMessage(`File "${file.name}" already uploaded. Skipping.`, 'warning');
                processedCount++;
                continue;
            }
            try {
                const { parsedData, headers, uuidColumnName } = await parseCSV(file);
                window.allCsvData.set(file.name, {
                    parsedData,
                    headers,
                    uuidColumnName,
                    elementTab: null, // Will be filled by renderTabs
                    elementTablePreview: null // Will be filled by renderTablePreview
                });
                processedCount++;
                displayMessage(`Successfully parsed "${file.name}".`, 'info');
            } catch (error) {
                console.error(`Error processing ${file.name}:`, error);
                displayMessage(`Error processing "${file.name}": ${error.message}`, 'error');
            }
        }

        if (allCsvData.size > 0) {
            renderTabs(window.allCsvData, onTabClick, onTabClose);
            // Activate the first tab and render its preview
            const firstFilename = window.allCsvData.keys().next().value;
            if (firstFilename) {
                onTabClick(firstFilename);
            }
            renderRelationMappingDropdowns(window.allCsvData, window.appState.relationMappings, onMappingChange, onRemoveMapping);
            updateGenerateButtonState();
        } else {
            // No files successfully processed, reset UI
            csvTabsContainer.innerHTML = '';
            document.getElementById('csvPreviewArea').innerHTML = '';
            document.getElementById('relationMappingContainer').innerHTML = '<p>Upload CSVs to define relations.</p>';
            window.appState.relationMappings = []; // Clear mappings if no files are loaded
            updateGenerateButtonState();
        }
        if (processedCount === files.length) {
            displayMessage('All selected files processed.', 'success');
        } else {
            displayMessage('Some files could not be processed. Check console for details.', 'warning');
        }
    }

    function onTabClick(filename) {
        // Deactivate all
        document.querySelectorAll('.tab').forEach(tab => tab.classList.remove('active'));
        // Activate selected
        const selectedTab = window.allCsvData.get(filename)?.elementTab;
        if (selectedTab) {
            selectedTab.classList.add('active');
        }
        // Render preview
        renderTablePreview(filename, window.allCsvData.get(filename));
    }

    function onTabClose(filename) {
        hideMessage();
        if (confirm(`Are you sure you want to remove "${filename}" and its associated data?`)) {
            window.allCsvData.delete(filename);

            // Remove any relation mappings involving this file
            window.appState.relationMappings = window.appState.relationMappings.filter(mapping =>
                mapping.sourceCsv !== filename && mapping.targetCsv !== filename
            );

            // Re-render tabs and relation mappings
            renderTabs(window.allCsvData, onTabClick, onTabClose);
            renderRelationMappingDropdowns(window.allCsvData, window.appState.relationMappings, onMappingChange, onRemoveMapping);

            if (window.allCsvData.size > 0) {
                // Activate the first remaining tab
                const firstFilename = window.allCsvData.keys().next().value;
                onTabClick(firstFilename);
            } else {
                // No files left
                document.getElementById('csvPreviewArea').innerHTML = '';
                document.getElementById('addMappingBtn').disabled = true;
                rdfOutputPreview.textContent = 'Generated RDF will appear here.';
            }

            updateGenerateButtonState();
            displayMessage(`"${filename}" removed.`, 'info');
        }
    }

    function onMappingChange(index, newMapping) {
        window.appState.relationMappings[index] = newMapping;
        updateGenerateButtonState(); // Mappings might influence generation validity
    }

    function onRemoveMapping(index) {
        window.appState.relationMappings.splice(index, 1);
        renderRelationMappingDropdowns(window.allCsvData, window.appState.relationMappings, onMappingChange, onRemoveMapping);
        updateGenerateButtonState();
    }
});