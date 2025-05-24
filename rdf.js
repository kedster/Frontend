/**
 * rdf.js
 * Handles RDF generation using rdflib.js and SPARQL endpoint interactions.
 */

// Global State (inherited from utils.js, assuming utils.js is loaded first)
// window.allCsvData (Map<string, Object>)
// window.appState.selectedOntology (Object)
// window.appState.relationMappings (Array<Object>)
// window.appState.sparqlConfig (Object)

/**
 * Generates RDF triples based on uploaded CSV data, selected ontology, and relation mappings.
 * @param {string} format - 'Turtle' or 'JSON-LD'.
 * @returns {Promise<string>} A promise that resolves with the generated RDF string.
 */
async function generateRDF(format) {
    const store = window.S.graph(); // Initialize rdflib.js graph store
    const { selectedOntology, relationMappings } = window.appState;

    if (!selectedOntology || !selectedOntology.prefixes || !selectedOntology.base) {
        displayMessage('Please select a valid ontology with prefixes and a base IRI.', 'warning');
        return '';
    }

    // Define prefixes
    for (const prefix in selectedOntology.prefixes) {
        store.setPrefix(prefix, window.S.Namespace(selectedOntology.prefixes[prefix]));
    }
    const baseIRI = selectedOntology.base;

    // Helper to resolve CURIEs (e.g., schema:Person -> http://schema.org/Person)
    const resolveCurie = (curie) => {
        if (!curie || typeof curie !== 'string') return null;
        const parts = curie.split(':');
        if (parts.length === 2 && selectedOntology.prefixes[parts[0]]) {
            return selectedOntology.prefixes[parts[0]] + parts[1];
        }
        return curie; // Assume it's a full URI or an invalid CURIE
    };

    // Process each CSV file
    for (const [filename, csvData] of window.allCsvData.entries()) {
        const uuidColName = csvData.uuidColumnName;

        csvData.parsedData.forEach((row, rowIndex) => {
            const subjectId = row[uuidColName];
            if (!subjectId) {
                console.warn(`Row ${rowIndex} in ${filename} is missing UUID. Skipping.`);
                return;
            }

            // Create a unique URI for each row/subject
            const subjectURI = window.S.sym(`${baseIRI}${filename.replace(/\.csv$/, '')}/${subjectId}`);
            const RDFS = window.S.Namespace("http://www.w3.org/2000/01/rdf-schema#");

            // Add rdf:type based on filename (simple heuristic, can be improved with config)
            const defaultTypeName = filename.split('.')[0]; // e.g., 'customers' -> 'Customer'
            const suggestedClassName = defaultTypeName.charAt(0).toUpperCase() + defaultTypeName.slice(1).replace(/s$/, ''); // Remove trailing 's'
            const classDef = selectedOntology.classes.find(cls => cls.name === suggestedClassName);
            if (classDef) {
                const classURI = window.S.sym(resolveCurie(classDef.uri));
                store.add(subjectURI, window.S.rdf.type, classURI);
            } else {
                // If no specific class found, can assign a general one or skip type
                // store.add(subjectURI, window.S.rdf.type, RDFS.Resource); // Example: just make it an rdfs:Resource
                // Or try to infer from data if desired
                // For simplicity, we just won't add an rdf:type if not matched explicitly.
            }

            // Add properties for each column in the CSV row
            for (const header of csvData.headers) {
                if (header === uuidColName) continue; // Skip the UUID column itself
                const value = row[header];
                if (value === undefined || value === null || value === '') {
                    continue; // Skip empty cells
                }

                // Try to find a matching predicate in the ontology
                // Simple mapping: header 'name' -> 'schemaName', 'age' -> 'schemaAge', etc.
                const predicateDef = selectedOntology.predicates.find(p => p.name.toLowerCase() === `schema${header.toLowerCase()}` || p.name.toLowerCase() === header.toLowerCase());

                let predicateURI;
                if (predicateDef) {
                    predicateURI = window.S.sym(resolveCurie(predicateDef.uri));
                } else {
                    // Fallback: create predicate based on base IRI and header name
                    // In a real app, this should be configurable or warn the user for unknown predicates.
                    predicateURI = window.S.sym(`${baseIRI}has${header.charAt(0).toUpperCase() + header.slice(1)}`);
                    displayMessage(`Warning: No specific predicate found for column '${header}'. Using generated URI: ${predicateURI.value}`, 'warning');
                }

                // Add literal triple
                store.add(subjectURI, predicateURI, window.S.literal(value));
            }
        });
    }

    // Process relation mappings
    relationMappings.forEach(mapping => {
        const sourceCsvData = window.allCsvData.get(mapping.sourceCsv);
        const targetCsvData = window.allCsvData.get(mapping.targetCsv);

        if (!sourceCsvData || !targetCsvData) {
            displayMessage(`Warning: Mapping involves missing CSV file(s): ${mapping.sourceCsv} or ${mapping.targetCsv}. Skipping.`, 'warning');
            return;
        }
        if (!mapping.sourceCol || !mapping.targetCol || !mapping.predicate) {
            displayMessage(`Warning: Incomplete mapping found. Skipping: ${JSON.stringify(mapping)}`, 'warning');
            return;
        }

        // Resolve predicate URI
        const predicateURI = window.S.sym(resolveCurie(mapping.predicate) || mapping.predicate); // Try to resolve CURIE, else use as is

        // Build a map for quick lookup of target UUIDs by their linking column value
        const targetLookupMap = new Map(); // Map<targetColValue, targetUUID>
        targetCsvData.parsedData.forEach(row => {
            const targetColValue = row[mapping.targetCol];
            const targetUUID = row[targetCsvData.uuidColumnName];
            if (targetColValue && targetUUID) {
                targetLookupMap.set(targetColValue, targetUUID);
            }
        });

        // Add relation triples
        sourceCsvData.parsedData.forEach(sourceRow => {
            const sourceUUID = sourceRow[sourceCsvData.uuidColumnName];
            const sourceLinkingValue = sourceRow[mapping.sourceCol];

            if (sourceUUID && sourceLinkingValue) {
                const targetUUID = targetLookupMap.get(sourceLinkingValue);
                if (targetUUID) {
                    const subject = window.S.sym(`${baseIRI}${mapping.sourceCsv.replace(/\.csv$/, '')}/${sourceUUID}`);
                    const object = window.S.sym(`${baseIRI}${mapping.targetCsv.replace(/\.csv$/, '')}/${targetUUID}`);
                    store.add(subject, predicateURI, object);
                }
            }
        });
    });

    // Serialize the RDF graph
    return new Promise((resolve, reject) => {
        window.S.serialize(store, null, null, format, (err, str) => {
            if (err) {
                console.error("RDF Serialization Error:", err);
                displayMessage(`Failed to generate RDF: ${err.message}`, 'error');
                reject(err);
            } else {
                resolve(str);
            }
        });
    });
}

/**
 * Sends the generated RDF to the configured SPARQL endpoint.
 * @param {string} rdfData - The RDF data as a string.
 * @param {string} format - The format of the RDF data (e.g., 'Turtle', 'JSON-LD').
 */
async function sendToSPARQL(rdfData, format) {
    const { sparqlConfig, selectedOntology } = window.appState;
    if (!sparqlConfig.url) {
        displayMessage('SPARQL Endpoint URL is not configured.', 'warning');
        return;
    }

    const contentTypeMap = {
        'Turtle': 'text/turtle',
        'JSON-LD': 'application/ld+json'
    };

    const payload = {
        format: format.toLowerCase(), // 'turtle' or 'json-ld'
        graph: sparqlConfig.namedGraph || undefined, // Optional named graph
        ontology: selectedOntology ? {
            prefixes: selectedOntology.prefixes,
            base: selectedOntology.base
        } : undefined,
        triples: rdfData
    };

    let headers = {
        'Content-Type': 'application/json' // Assuming the custom server expects JSON payload
    };

    try {
        const customHeaders = JSON.parse(sparqlConfig.headers);
        headers = { ...headers, ...customHeaders };
    } catch (e) {
        displayMessage('Invalid SPARQL headers JSON format.', 'error');
        return;
    }

    try {
        displayMessage('Sending RDF to SPARQL endpoint...', 'info');
        const response = await fetch(sparqlConfig.url, {
            method: sparqlConfig.method,
            headers: headers,
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
        }

        const responseText = await response.text();
        displayMessage(`RDF sent successfully! Response: ${responseText.substring(0, 200)}...`, 'success'); // Show a snippet
        console.log('SPARQL Endpoint Response:', responseText);

    } catch (error) {
        console.error('Error sending RDF to SPARQL endpoint:', error);
        displayMessage(`Failed to send RDF to SPARQL endpoint: ${error.message}`, 'error');
    }
}