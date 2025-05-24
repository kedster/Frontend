/**
 * ontology.js
 *
 * This file defines a set of pre-approved ontology schemas
 * that can be used for RDF generation. In a real-world scenario,
 * these might be fetched from a server or a dedicated configuration file.
 */

const predefinedOntologies = [
    {
        id: "schema_org",
        name: "Schema.org (Basic)",
        prefixes: {
            "schema": "http://schema.org/",
            "ex": "http://example.org/data/"
        },
        baseIRI: "http://example.org/data/",
        classes: [
            { id: "Thing", uri: "schema:Thing" },
            { id: "Person", uri: "schema:Person" },
            { id: "Organization", uri: "schema:Organization" },
            { id: "Product", uri: "schema:Product" },
            { id: "Order", uri: "schema:Order" },
            { id: "CreativeWork", uri: "schema:CreativeWork" }
        ],
        predicates: [
            { id: "name", uri: "schema:name" },
            { id: "description", uri: "schema:description" },
            { id: "identifier", uri: "schema:identifier" },
            { id: "address", uri: "schema:address" },
            { id: "email", uri: "schema:email" },
            { id: "telephone", uri: "schema:telephone" },
            { id: "hasPart", uri: "schema:hasPart" }, // for relations
            { id: "item", uri: "schema:item" }, // for relations
            { id: "customer", uri: "schema:customer" }, // for relations
        ]
    },
    {
        id: "foaf_and_ex",
        name: "FOAF & Custom Example",
        prefixes: {
            "foaf": "http://xmlns.com/foaf/0.1/",
            "ex": "http://example.com/vocab/",
            "dc": "http://purl.org/dc/elements/1.1/"
        },
        baseIRI: "http://example.com/people/",
        classes: [
            { id: "Agent", uri: "foaf:Agent" },
            { id: "Person", uri: "foaf:Person" },
            { id: "Document", uri: "foaf:Document" },
            { id: "Project", uri: "ex:Project" },
        ],
        predicates: [
            { id: "name", uri: "foaf:name" },
            { id: "mbox", uri: "foaf:mbox" }, // email
            { id: "knows", uri: "foaf:knows" }, // for relations
            { id: "primaryTopic", uri: "foaf:primaryTopic" },
            { id: "title", uri: "dc:title" },
            { id: "hasMember", uri: "ex:hasMember" }, // for relations
            { id: "involvedIn", uri: "ex:involvedIn" }, // for relations
        ]
    },
    {
        id: "blank_ontology",
        name: "Blank Ontology (Manual Definition)",
        prefixes: {},
        baseIRI: "http://example.org/undefined/",
        classes: [],
        predicates: []
    }
];

// Exporting it so `app.js` can access it
// (In a browser environment, this variable would be globally available,
// but it's good practice to encapsulate if using modules eventually)
window.predefinedOntologies = predefinedOntologies;