/**
 * Glossary content model (M5 architecture §1) — the single, typed, build-validated
 * home for the site's A–Z vocabulary.
 *
 * Each term names the lesson that INTRODUCES it (spec §6). Those `lessonSlug`s are
 * cross-checked against the published lessons collection in `glossary.astro`, so a
 * renamed/removed lesson fails the build rather than shipping a dead cross-link.
 * Definitions are hand-authored (spec §15 — no lorem) at one or two sentences.
 */

/** One glossary entry: a term, its definition, and the lesson that introduces it. */
export interface GlossaryTerm {
  /** Display term in canonical casing, e.g. "Big-O notation". */
  term: string;
  /** Plain-text definition, one or two sentences (spec §8). */
  definition: string;
  /** Slug of the lesson that first introduces the term (validated at build time). */
  lessonSlug: string;
  /**
   * Optional alternate spellings/abbreviations. Not rendered in v1 — reserved for a
   * future client search so adding it now avoids a later data migration (arch §1.2).
   */
  aliases?: string[];
}

/**
 * The curated glossary, in authoring order. `glossary.astro` sorts A–Z and groups
 * by first letter at build time, so order here is irrelevant to output.
 */
export const glossary: GlossaryTerm[] = [
  // ---- Complexity & Big-O (complexity-big-o) ----
  {
    term: 'Big-O notation',
    definition:
      'A shorthand for how an algorithm’s running time or memory grows as its input gets larger, ignoring constant factors and lower-order terms. It describes the worst-case upper bound, so O(n) means "grows in proportion to the input size".',
    lessonSlug: 'complexity-big-o',
    aliases: ['big o', 'asymptotic notation'],
  },
  {
    term: 'Time complexity',
    definition:
      'A measure of how the number of steps an algorithm takes scales with the size of its input, expressed in Big-O notation. It lets you compare algorithms without running them on a specific machine.',
    lessonSlug: 'complexity-big-o',
  },
  {
    term: 'Space complexity',
    definition:
      'A measure of how much extra memory an algorithm needs as its input grows, expressed in Big-O notation. It counts working storage beyond the input itself.',
    lessonSlug: 'complexity-big-o',
  },
  {
    term: 'Logarithmic time',
    definition:
      'A running time of O(log n), where the work grows very slowly because each step discards a large fraction of the remaining input. Halving the search space every step, as binary search does, is the classic example.',
    lessonSlug: 'complexity-big-o',
    aliases: ['O(log n)'],
  },

  // ---- Arrays (arrays) ----
  {
    term: 'Array',
    definition:
      'A contiguous block of memory holding a fixed-size sequence of elements, each reachable in constant time by its position. It is the most fundamental data structure and the basis for many others.',
    lessonSlug: 'arrays',
  },
  {
    term: 'Index',
    definition:
      'The integer position of an element within an array, conventionally starting at 0. Because elements sit at evenly spaced addresses, the computer can jump straight to any index in O(1).',
    lessonSlug: 'arrays',
    aliases: ['indices', 'subscript'],
  },
  {
    term: 'In-place',
    definition:
      'A description of an algorithm that transforms its input using only a small, constant amount of extra memory rather than allocating a separate copy. In-place sorts like insertion sort rearrange the original array directly.',
    lessonSlug: 'arrays',
    aliases: ['in place'],
  },

  // ---- Linked lists (linked-lists) ----
  {
    term: 'Linked list',
    definition:
      'A linear data structure whose elements are separate nodes, each holding a value and a reference to the next node. Unlike an array it grows and shrinks without shifting elements, but it gives up constant-time indexed access.',
    lessonSlug: 'linked-lists',
  },
  {
    term: 'Node',
    definition:
      'A single unit of a linked structure that stores a value together with one or more references to other nodes. Nodes are the building blocks of linked lists, trees, and graphs.',
    lessonSlug: 'linked-lists',
  },
  {
    term: 'Pointer',
    definition:
      'A reference from one node to another that links the pieces of a data structure together. Following pointers is how you traverse a linked list, tree, or graph.',
    lessonSlug: 'linked-lists',
    aliases: ['reference', 'link'],
  },

  // ---- Stacks (stacks) ----
  {
    term: 'Stack',
    definition:
      'A collection where the last item added is the first one removed, offering push and pop operations at one end. Stacks model nested processes such as function calls and undo history.',
    lessonSlug: 'stacks',
  },
  {
    term: 'LIFO',
    definition:
      'Last-In, First-Out: the ordering rule of a stack, where the most recently added element is the next to be removed. It is the mirror image of a queue’s FIFO rule.',
    lessonSlug: 'stacks',
    aliases: ['last-in first-out'],
  },

  // ---- Queues (queues) ----
  {
    term: 'Queue',
    definition:
      'A collection where the first item added is the first one removed, offering enqueue at the back and dequeue at the front. Queues model fair, in-order processing such as task scheduling and breadth-first search.',
    lessonSlug: 'queues',
  },
  {
    term: 'FIFO',
    definition:
      'First-In, First-Out: the ordering rule of a queue, where elements leave in the same order they arrived. It contrasts with a stack’s LIFO rule.',
    lessonSlug: 'queues',
    aliases: ['first-in first-out'],
  },
  {
    term: 'Circular buffer',
    definition:
      'A fixed-size array used as a queue in which the front and back indices wrap around to the beginning when they reach the end. Reusing the freed slots avoids shifting elements on every dequeue.',
    lessonSlug: 'queues',
    aliases: ['ring buffer'],
  },

  // ---- Hash tables (hash-tables) ----
  {
    term: 'Hash function',
    definition:
      'A function that maps a key to an integer used to choose where the key’s value is stored. A good hash spreads keys evenly across the table so lookups stay close to constant time.',
    lessonSlug: 'hash-tables',
  },
  {
    term: 'Bucket',
    definition:
      'One slot of a hash table, identified by a hashed index, that holds the entries assigned to it. When several keys hash to the same bucket, they share it via a collision-handling scheme.',
    lessonSlug: 'hash-tables',
    aliases: ['slot'],
  },
  {
    term: 'Collision',
    definition:
      'The situation where two different keys hash to the same bucket in a hash table. Every hash table needs a strategy, such as chaining, to store both keys without losing either.',
    lessonSlug: 'hash-tables',
  },
  {
    term: 'Chaining',
    definition:
      'A collision-handling strategy where each bucket holds a small linked list (or other list) of all entries that hashed to it. Lookups scan only the short chain in the matching bucket.',
    lessonSlug: 'hash-tables',
    aliases: ['separate chaining'],
  },

  // ---- Trees & BSTs (trees-bst) ----
  {
    term: 'Tree',
    definition:
      'A hierarchical data structure of nodes connected by edges, with one root at the top and no cycles. Each node branches into child nodes, forming subtrees.',
    lessonSlug: 'trees-bst',
  },
  {
    term: 'Binary search tree',
    definition:
      'A binary tree that keeps every node’s left subtree smaller than the node and every right subtree larger. That ordering makes search, insertion, and deletion run in O(log n) time when the tree stays balanced.',
    lessonSlug: 'trees-bst',
    aliases: ['BST'],
  },
  {
    term: 'Leaf',
    definition:
      'A tree node with no children, sitting at the outer edge of the structure. Leaves mark where a branch of the tree ends.',
    lessonSlug: 'trees-bst',
  },

  // ---- Heaps (heaps) ----
  {
    term: 'Heap',
    definition:
      'A complete binary tree in which every parent is ordered relative to its children — smaller in a min-heap, larger in a max-heap — so the extreme value is always at the root. Heaps back priority queues and heap sort.',
    lessonSlug: 'heaps',
  },
  {
    term: 'Heapify',
    definition:
      'The operation that restores the heap ordering after an insertion or removal by moving an element up or down until it sits in a valid spot. Each heapify runs in O(log n) time.',
    lessonSlug: 'heaps',
    aliases: ['sift', 'bubble up', 'sift down'],
  },

  // ---- Graphs (graphs) ----
  {
    term: 'Graph',
    definition:
      'A collection of vertices connected by edges, used to model networks such as roads, social connections, or dependencies. Edges may be directed or undirected and may carry weights.',
    lessonSlug: 'graphs',
    aliases: ['vertex', 'edge'],
  },
  {
    term: 'Adjacency list',
    definition:
      'A graph representation that stores, for each vertex, a list of the vertices it connects to. It is memory-efficient for sparse graphs, where most vertices have few edges.',
    lessonSlug: 'graphs',
  },
  {
    term: 'Adjacency matrix',
    definition:
      'A graph representation using a grid whose cell (i, j) records whether an edge runs from vertex i to vertex j. It answers "are these two connected?" in constant time at the cost of O(V²) space.',
    lessonSlug: 'graphs',
  },

  // ---- Recursion (recursion) ----
  {
    term: 'Recursion',
    definition:
      'A technique where a function solves a problem by calling itself on smaller versions of the same problem until it reaches a case simple enough to answer directly. It expresses naturally self-similar problems concisely.',
    lessonSlug: 'recursion',
    aliases: ['recursive'],
  },
  {
    term: 'Base case',
    definition:
      'The condition in a recursive function that can be answered without further recursion, stopping the chain of calls. Without a reachable base case the recursion never terminates.',
    lessonSlug: 'recursion',
  },
  {
    term: 'Call stack',
    definition:
      'The stack the program uses to track active function calls, pushing a frame on each call and popping it on return. Recursion depth is limited by how many frames the call stack can hold.',
    lessonSlug: 'recursion',
  },

  // ---- Searching (binary-search) ----
  {
    term: 'Binary search',
    definition:
      'A search algorithm for sorted data that repeatedly halves the remaining range by comparing the target to the middle element. It finds an item in O(log n) time instead of scanning everything.',
    lessonSlug: 'binary-search',
  },
  {
    term: 'Linear search',
    definition:
      'A search algorithm that checks each element in order until it finds the target or reaches the end. It works on any data but takes O(n) time in the worst case.',
    lessonSlug: 'binary-search',
    aliases: ['sequential search'],
  },

  // ---- Basic sorts (sorting-basics) ----
  {
    term: 'Bubble sort',
    definition:
      'A simple sorting algorithm that repeatedly steps through the list, swapping adjacent out-of-order pairs, so large values "bubble" to the end. It is easy to understand but runs in O(n²) time.',
    lessonSlug: 'sorting-basics',
  },
  {
    term: 'Selection sort',
    definition:
      'A sorting algorithm that repeatedly finds the smallest remaining element and moves it to the front of the unsorted region. It always performs O(n²) comparisons but makes at most n swaps.',
    lessonSlug: 'sorting-basics',
  },
  {
    term: 'Insertion sort',
    definition:
      'A sorting algorithm that builds the sorted list one element at a time by inserting each new value into its correct place among the already-sorted elements. It is fast on small or nearly-sorted inputs.',
    lessonSlug: 'sorting-basics',
  },

  // ---- Efficient sorts (sorting-efficient) ----
  {
    term: 'Merge sort',
    definition:
      'A divide-and-conquer sort that splits the list in half, sorts each half recursively, and merges the two sorted halves back together. It guarantees O(n log n) time but needs extra space for the merge.',
    lessonSlug: 'sorting-efficient',
  },
  {
    term: 'Quick sort',
    definition:
      'A divide-and-conquer sort that partitions the list around a chosen pivot, then sorts the two sides recursively. It averages O(n log n) time and sorts in place, though a poor pivot degrades it to O(n²).',
    lessonSlug: 'sorting-efficient',
    aliases: ['quicksort'],
  },
  {
    term: 'Partition',
    definition:
      'The step in quick sort that rearranges a range so every element less than the pivot comes before it and every greater element comes after. After partitioning, the pivot sits in its final sorted position.',
    lessonSlug: 'sorting-efficient',
  },
  {
    term: 'Divide and conquer',
    definition:
      'A problem-solving strategy that breaks a problem into smaller independent subproblems, solves each recursively, and combines their results. Merge sort and quick sort are classic examples.',
    lessonSlug: 'sorting-efficient',
  },

  // ---- Graph traversal (graph-traversal) ----
  {
    term: 'Breadth-first search',
    definition:
      'A graph traversal that explores all neighbours at the current distance before moving farther out, using a queue to track what to visit next. It finds the shortest path in an unweighted graph.',
    lessonSlug: 'graph-traversal',
    aliases: ['BFS'],
  },
  {
    term: 'Depth-first search',
    definition:
      'A graph traversal that follows one path as far as it can before backtracking to explore alternatives, using a stack or recursion. It is well suited to cycle detection and topological ordering.',
    lessonSlug: 'graph-traversal',
    aliases: ['DFS'],
  },

  // ---- Dynamic programming (dynamic-programming) ----
  {
    term: 'Dynamic programming',
    definition:
      'A technique that solves a problem by breaking it into overlapping subproblems, solving each one only once, and reusing the stored results. It turns exponential recursion into efficient, reusable work.',
    lessonSlug: 'dynamic-programming',
    aliases: ['DP'],
  },
  {
    term: 'Memoization',
    definition:
      'Top-down dynamic programming: run the natural recursion but cache each subproblem’s answer the first time it is computed, so it is looked up rather than recomputed on later calls.',
    lessonSlug: 'dynamic-programming',
  },
  {
    term: 'Tabulation',
    definition:
      'Bottom-up dynamic programming: fill a table of subproblem answers in dependency order, smallest first, so every value a cell needs is already present when you reach it.',
    lessonSlug: 'dynamic-programming',
  },
  {
    term: 'Overlapping subproblems',
    definition:
      'The property that a recursive solution keeps solving the same smaller problem again and again. It is the signal that caching those answers — dynamic programming — will pay off.',
    lessonSlug: 'dynamic-programming',
  },
  {
    term: 'Optimal substructure',
    definition:
      'The property that an optimal answer to a problem is built directly from optimal answers to its subproblems. It is what lets dynamic programming combine smaller results into the full solution.',
    lessonSlug: 'dynamic-programming',
  },
];
