# Queries

All queries use the [query](#tag/General/paths/~1query/post) endpoint.

## Building a Query: Patterns

Queries are build with 4 repeating patterns

- SubQuery
- Clause
- Comparison
- Fixed SubQuery

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
which take a series of custom inputs where the `queryType` is set to one of the following

- similarTo
- keyword
- displayName
- neighborhood
- ancestors
- descendants

## Operators

These are similar to the operators for [OrientDB](http://orientdb.com/docs/3.0.x/sql/SQL-Where.html#operators) (Since this is the backend DB used).

However they are
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

Examples of the request body for the [query](#tag/General/paths/~1query/post) endpoint are given
under request samples in its [route documentation](#tag/General/paths/~1query/post). Further
documentation examples can be found in the [python adaptor documentation](https://bcgsc.github.io/pori_graphkb_python/).

## Schema Basics

There are 3 main types of vertex/node classes/models in GraphKB: Statments, Variants, and Ontology
terms. The most important parts of each of these are discussed below.

### Statements

Statements make up the interpretive content in GraphKB and are used to link variants, diseases, and
drugs to one another. The basic structure of a statement consists of four main elements: relevance,
subject, conditions, and evidence.

![Statement Schema](https://graphkb-api.bcgsc.ca/public/pori-statement-schema.svg)

### Variants

There are two types of variants in GraphKB: positional and category. Positional variants can
be describe by some coordinate system relative to one or two sequence/reference features. Most
often these reference features are genes or chromosomes.

![Variant Schema](https://graphkb-api.bcgsc.ca/public/pori-positional-variant-schema.svg)

### Ontology Terms

Ontology terms are input with respect to the source of the ontology. For example terms from the
disease ontology (DO) would have `sourceId` values that match their unique indentifiers in the DO.

![Ontology Schema](https://graphkb-api.bcgsc.ca/public/pori-ontology-schema.svg)

### Inheritance

Most vertex models inherit properties from other more general (and/or abstract) models.

![Ontology Schema](https://graphkb-api.bcgsc.ca/public/pori-schema-overview.svg)

## Return Properties

The return properties which can be requested depend on the target model being requested. So for
example if the target of the query is the `Disease` model then the `returnProperties` should be
properties which belong to that model. Some properties are links (foreign keys) which point to
another sepearate record. The properties on the linked object can be accessed via the nested
properties operation.

```text
<property name>.<linked property name>
```

For example, using the `Disease` model. The Disease class has a property `source` which points to
a `Source` model. The `Source` model has a property `name`. If we wish to return the name of the
source for a given Disease record then we add the following return property to our query

```json
{
  "target": "Disease",
  "returnProperties": ["source.name"]
}
```

If the linked property is requested without the linked property, the linked record ID (`@rid`) will
be returned

```json
{
  "target": "Disease",
  "returnProperties": ["source"]
}
```

There are some properties common to all vertex/node models. These are primarily for tracking
changes to records

- `@rid`: the record ID
- `@class`: the model/class this record belongs to
- **createdBy** (*LINK* to `User`)
- **createdAt**
- **updatedBy** (*LINK* to `User`)
- **updatedAt**
- **comment**
- **uuid**

A full list of the models and their properties (excluding the above) is given below.

MODEL_PROPERTY_LIST_INSERT
