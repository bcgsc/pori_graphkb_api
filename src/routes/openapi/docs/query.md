# Queries

All queries use the [query](#tag/General/paths/~1query/post) endpoint.

- [Building a Query: Patterns](#building-a-query-patterns)
  - [SubQuery](#subquery)
  - [Clause](#clause)
  - [Comparison](#comparison)
  - [Fixed SubQuery](#fixed-subquery)
- [Operators](#operators)
  - [Comparing two iterables](#comparing-two-iterables)
  - [Comparing a single record to an Iterable](#comparing-a-single-record-to-an-iterable)
- [Examples](#examples)

## Building a Query: Patterns

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
which take a series of custom inputs where the `queryType` is set to one of the following

- similarTo
- keyword
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
under request samples in its [route documentation](#tag/General/paths/~1query/post)
