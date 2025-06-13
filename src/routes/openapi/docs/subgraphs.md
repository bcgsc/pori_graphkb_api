# Subgraphs

Traverse an ontology graph and returns a subgraph of all traversed nodes and edges. All subgraphs use the [subgraphs/{ontology}](#tag/General/paths/~1subgraphs~1%7Bontology%7D/post) POST endpoint.

It's worth noting that, since the original graph is not guaranteed to be acyclic (and usually isn’t), the returned subgraph can contain cycles as well. The same goes with disconnected graphs (more than one connected component).

## Request body

All available properties are listed [here](#tag/General/paths/~1subgraphs~1%7Bontology%7D/post), where a dropdown choice of usage examples is also given under the Request samples section.

### Base

All subgraph types but one (see the *complete* subgraphType exception below) use a base of record RIDs to start the graph traversal from.

The **base** property must be an array of one or more node RIDs from the traversed ontology. If more than one RID is given, then the returned subgraph can be disconnected (more than one connected component) regardless of the ontology graph to be fully connected or not.


### Subgraph Types

Here are all the subgraph types to choose from. If ommitted, the **subgraphType** property is defaulted to ***complete***.

A *de facto* 'disambiguation' is performed at every level by traversing similarity Edges (edges) from every Nodes that has been reached following hierarchy Edges (treeEdges).

- **similarTo**

    Given some base records, traverse similarity Edges (edges) in both directions.

- **children**

   Given some base records, traverse similarity Edges (edges) in both directions and hierarchy Edges (treeEdges) in a 'descending/parent-to-child' direction for 1 generation.

- **descendants**

    Given some base records, traverse similarity Edges (edges) in both directions and hierarchy Edges (treeEdges) in a 'descending/parent-to-child' direction for all generations.

- **parents**

   Given some base records, traverse similarity Edges (edges) in both directions and hierarchy Edges (treeEdges) in a 'ascending/child-to-parent' direction for 1 generation.

- **ancestors**

    Given some base records, traverse similarity Edges (edges) in both directions and hierarchy Edges (treeEdges) in a 'ascending/child-to-parent' direction for all generations.

- **tree**

    Given some base records, combines a descendants subgraph and a ancestors subgraph into one jointed subgraph.

    The returned subgraph is a directed tree, with the important exception that it is not guaranteed to be acyclic, which violates the tree defenition. In order to guarantee an acyclic subgraph, the original graph needs to be acyclic with regard to the Edges considered in the traversal.

    If more than one base RID is given, then, as with all other subgraph types, the returned subgraph can be disconnected, leading to a 'forest' instead of a 'tree'.

- **complete**

    This subgraph type is queried without a base and no traversal is performed per se. Instead, the whole ontology graph is returned as a merge of individual successive select queries on each involved record class. Use with special care since it is compute and data intensive.


### Maximum Traversal Depth

A maximum traversal depth is set in order to prevent potential overflow scenarios. The *maxDepth* property is defaulted to MAX_DEPTH but can be overridden.


### Real Subgraph vs Virtualization

The **subgraph** property can be set to ***real*** (default), ***virtual*** or ***both***.

- **real**

    The subgraph is returned as a normal graph (***g***) where nodes and edges are sent *as-is* from the traversal.

- **virtual**

    The subgraph is returned as a simplified virtual graph (***v***) where each group of similar nodes (nodes linked together by similarity edges) has been collapsed into singular virtual nodes, and hierarchical edges (treeEdges) has been collapsed into virtual edges and redirected from and to the corresponding virtual nodes.

- **both**

    Both real (***g***) and virtual (***v***) subgraphs are returned.

## Response

Real and virtual subgraphs are returned seperatly, with their corresponding **nodes**, **edges**, sysmetric **adjacency** list and array of connected **components**.

Virtual subgraphs are returned with additional mappings from nodes to virtual nodes (**g_to_v**), and from virtual nodes to nodes (**v_to_g**).

```Bash
{ result: {
    g: {
        nodes: { <Nodes> },
        edges: { <Edges> },
        adjacency: { <RID>: [<RIDs>] },
        components: [[<RIDs>]],
    },
    v: {
        nodes: { <vNodes> },
        edges: { <vEdges> },
        adjacency: { <ID>: [<IDs>] },
        components: [[<IDs>]],
        g_to_v: { <RID>: <ID> },
        v_to_g: { <ID>: <RID> },
    },
} }
```
