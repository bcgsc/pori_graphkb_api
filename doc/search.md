# Complex Queries

- [Quick Search Examples](#Quick-Search-Examples)
  - [Search for statements implied by a vertex or a related vertex](#Search-for-statements-implied-by-a-vertex-or-a-related-vertex)
- [Query Builder Examples](#Query-Builder-Examples)
  - [Search by related vertices](#Search-by-related-vertices)
  - [Search by link in neighborhood](#Search-by-link-in-neighborhood)
  - [Tree Queries: search Ancestors or Descendants](#Tree-Queries-search-Ancestors-or-Descendants)

For simple queries, the GET routes and builtin search parameters should suffice. However, for more
complex queries the user may want to use the search endpoints instead. All exposed models will
have a search endpoint (POST) which follows the pattern

```text
/api/<CLASSNAME>/search
```

The body contains the search specification. There are two main ways to use the search endpoints. The
body may contain either a "search" or "where" property. The former will use the quick search method and
cannot be combined with complex queries. The latter will use the quer builder method.

## Quick Search Examples

### Search for statements implied by a vertex or a related vertex

```jsonc
// POST /api/statements/search
{
    "search": {
        "impliedBy": ["#44:0"]
    }
}
```

The above will return statements implied by the vertex 44:0 but also statements implied by vertices
related to the vertex 44:0. For example if 44:0 were a disease, this query would also return statements
implied by the deprecated disease name, or aliases of that disease name, etc.

## Query Builder Examples

### Search by related vertices

Find all statements which are implied by a variant on the gene KRAS

```jsonc
// POST /api/statements/search
{
    "where": [
        {
            "attr": "impliedBy.reference1.name",
            "value": "KRAS"
        }
    ]
}
```

The above example is fairly simple. Where the search endpoint showcases its utitlity is in the pre-boxed queries.

### Search by link in neighborhood

Here we are trying to find all statements that are implied by a variant on KRAS or any of the KRAS aliases, previous terms etc.
To do this we can use a neighborhood subsearch as follows

```jsonc
// POST /api/statements/search
{
    "where": {
        "attr": "impliedBy",
        "value": {
            "type": "neighborhood",
            "where": [{"attr": "name", "value": "KRAS"}],
            "class": "Feature",
            "depth": 3
        }
    }
}
```

Note that the class must be given for subqueries or it will be assumed to be the same as the starting
endpoint (in this case Statement).

### Tree Queries: search Ancestors or Descendants

Ancestors and descendants are also builtin queries. In the following example we are trying
to find a disease named 'ER-positive breast cancer' and retrieve it and all of the superclasses of it.

To do this we will be following the `SubClassOf` edges. This is the default edge type for
tree queries but can also be given explicitly

```jsonc
// POST /api/diseases/search
{
    "where": {"attr": "name", "value": "ER-positive breast cancer"},
    "type": "ancestors"
}
```

<p style="page-break-after: always;">&nbsp;</p>
