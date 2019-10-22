# Queries

All queries use the `/query` endpoint.

- [Patterns](#patterns)
  - [SubQuery](#subquery)
  - [Clause](#clause)
  - [Comparison](#comparison)
  - [Fixed SubQuery](#fixed-subquery)
- [Operators](#operators)
  - [Comparing two iterables](#comparing-two-iterables)
  - [Comparing a single record to an Iterable](#comparing-a-single-record-to-an-iterable)
- [Examples](#examples)
  - [Returning Specific Properties](#returning-specific-properties)
  - [Select a list of Records by ID](#select-a-list-of-records-by-id)
  - [Search Statements by Keyword](#search-statements-by-keyword)
  - [Get all descendants of some ontology Term](#get-all-descendants-of-some-ontology-term)
  - [Search Variants by Loose Gene match](#search-variants-by-loose-gene-match)

## Patterns

Queries are build with 4 repeating patterns

- [SubQuery](#subquery)
- [Clause](#clause)
- [Comparison](#comparison)
- [Fixed SubQuery](#fixed-subquery)

### SubQuery

A subquery is built with a target and filters. Where targets are the class being queried and filters represent the filtering conditions to be applied

### Clause

A clause is a group of conditions that must be applied such as AND or OR.

### Comparison

Comparisons are the actual filter conditions. These consist of an attribute to be compared against as well
as the value to compare to. More complicated examples may also include the operator used in the comparison


### Fixed SubQuery

While the above three patterns allow for a large amount of flexiblility, there may be additional things
the user wishes to query for. For this there are the fixed sub queries. These are pre-determined queries
which take a series of custom inputs


## Operators

These are similar to the operators for OrientDB (Since this is the backend DB used). However they are
also summarized below for ease of use

### Comparing two iterables

This is useful in particular for statements where they have two direct properties (evidence, conditions)
which are iterables. The following operators may be used here

| Operator    | Description                                                                        |
| ----------- | ---------------------------------------------------------------------------------- |
| CONTAINSANY | Check if some iterable property has records in common with a subquery/record list  |
| CONTAINSALL | Check if some iterable property contains all the records in a subquery/record list |
| =           | Check if the 2 iterables have exactly the same records                             |

### Comparing a single record to an Iterable

| Operator | Description                                         |
| -------- | --------------------------------------------------- |
| IN       | Check if this record is in the subquery/record list |


## Examples

### Returning Specific Properties

Most queries allow the user to specify the properites to be returned. Transitive properties can be specified
with the `.` separator. For example

```json
{
    "target": "Vocabulary",
    "filters": {"name": "deletion"},
    "returnProperties": ["@rid", "name", "source.name", "source.@rid"]
}
```

Would return

```json
{
    "result": [
        {
            "@rid": "#147:1",
            "name": "deletion",
            "source": {
                "name": "graphkb",
                "@rid": "#37:0"
            }
        }
    ]
}
```

### Select a list of Records by ID

```json
{
    "target": ["#3:4", "4:5"],
}
```

> **Warning**: `returnProperties` and `orderBy` cannot be used with this query type since they do not give a
    model to validate against

### Search Statements by Keyword

This is a type of fixed subquery which uses the custom argument `keyword`

```json
{
    "queryType": "keyword",
    "target": "Statement",
    "keyword": "kras"
}
```

### Get all descendants of some ontology Term

Given some ontology term record, find all its descendant records. For example a record `deletion`
might return records `indel` and `structural variant`. By default this follows the subclassof edge type.

```json
{
    "queryType": "ancestors",
    "target": "Vocabulary",
    "filters": {"name": "deletion"},
}
```


### Search Variants by Loose Gene match

Often there are multiple gene models and we want to collapse them and look for
all variants on any of the models. The `similarTo` query type allows us to achieve
this effect. This can either be done in two queries: first for the gene

```json
{
    "queryType": "similarTo",
    "target": {
        "target": "Feature",
        "filters": {
            "AND": [
                {"biotype": "gene"},
                {"OR": [{"name": "kras"}, {"sourceId": "kras"}]}
            ]
        }
    }
}
```

The above looks for genes with a name or sourceId of kras. It also follows any
edges which relate the result to putative equivalent records
(aliases, deprecated forms, etc.). This can then be used as input for searching Variants
(assume the result of the previous query is a list of record Ids: `["#3:4", "#4:5"]`)

```json
{
    "target": "Variant",
    "filters": {"OR": [
        {"reference1": ["#3:4", "#4:5"], "operator": "IN"},
        {"reference2": ["#3:4", "#4:5"], "operator": "IN"}
    ]}
}
```

The above two queries can also be written as a single query, though multiple queries is reccommended
to allow resuse of queries (you may only need to query genes once but make multiple queries for different
variants you are searching for).

```json
{
    "target": "Variant",
    "filters": {
        "OR": [
            {
                "reference1": {
                    "queryType": "similarTo",
                    "target": "Feature",
                    "filters": {
                        "AND": [
                            {
                                "biotype": "gene"
                            },
                            {
                                "OR": [
                                    {
                                        "name": "kras"
                                    },
                                    {
                                        "sourceId": "kras"
                                    }
                                ]
                            }
                        ]
                    }
                },
                "operator": "IN"
            },
            {
                "reference2": {
                    "queryType": "similarTo",
                    "target": "Feature",
                    "filters": {
                        "AND": [
                            {
                                "biotype": "gene"
                            },
                            {
                                "OR": [
                                    {
                                        "name": "kras"
                                    },
                                    {
                                        "sourceId": "kras"
                                    }
                                ]
                            }
                        ]
                    }
                },
                "operator": "IN"
            }
        ]
    }
}
```
