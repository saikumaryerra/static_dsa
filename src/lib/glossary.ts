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
   * Optional genuine synonyms and alternate spellings a reader might arrive with,
   * in the casing the literature writes them ("BST", "ring buffer"). Since M7.2
   * this is DISPLAY COPY: `glossary.astro` renders it verbatim as an "Also called:
   * …" line under the definition — which is also what makes browser find-in-page
   * able to match a synonym, the thing a zero-JS glossary otherwise cannot do.
   *
   * The editorial bar is therefore the sentence a reader actually sees: every value
   * must complete "a Bucket is also called a slot" truthfully. Plurals ("indices"),
   * other parts of speech ("recursive"), hyphenation variants ("in place") and the
   * parts a thing is made of (a graph is not "a vertex") are not synonyms and do
   * not belong here — they read as errors on a beginner's reference. Terms whose
   * only alias would be one of those simply omit the field.
   */
  aliases?: string[];
}

/**
 * Stable, URL-safe fragment id for a term — "Big-O notation" → "big-o-notation".
 * Pure and deterministic so lesson prose can hard-link `/glossary/#binary-search`
 * and a reader can share a single definition. Collision-freedom across the whole
 * list is asserted at build time in `glossary.astro`: two terms slugifying alike
 * would make one of them permanently unreachable.
 */
export function termAnchor(term: string): string {
  return (
    term
      .toLowerCase()
      // Decompose accents, then drop the combining marks, so a future "Θ-notation"
      // or "naïve search" degrades to letters instead of collapsing into hyphens.
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
  );
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
    aliases: ['Big O notation', 'asymptotic notation'],
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
    aliases: ['subscript'],
  },
  {
    term: 'In-place',
    definition:
      'A description of an algorithm that transforms its input using only a small, constant amount of extra memory rather than allocating a separate copy. In-place sorts like insertion sort rearrange the original array directly.',
    lessonSlug: 'arrays',
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
  },

  // ---- Graphs (graphs) ----
  {
    term: 'Graph',
    definition:
      'A collection of vertices connected by edges, used to model networks such as roads, social connections, or dependencies. Edges may be directed or undirected and may carry weights.',
    lessonSlug: 'graphs',
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

  // ---- Kubernetes: foundations (k8s-what-kubernetes-is, k8s-desired-state) ----
  {
    term: 'Control plane',
    definition:
      'The components that hold a Kubernetes cluster’s intent and run the loops acting on it: the API server, etcd, the scheduler and the controller manager. Worker nodes run your containers; the control plane decides what should run and where.',
    lessonSlug: 'k8s-what-kubernetes-is',
  },
  {
    term: 'Desired state',
    definition:
      'The configuration you write down and hand to Kubernetes — three replicas of this image, reachable under this name — as distinct from the current state the cluster is actually in. Controllers exist to close the gap between the two.',
    lessonSlug: 'k8s-what-kubernetes-is',
  },
  {
    term: 'kubelet',
    definition:
      'The agent running on every worker node that watches the API server for Pods assigned to its node, tells the container runtime to start them, and reports back what is actually running. It is how the control plane’s decisions become running containers on a machine.',
    lessonSlug: 'k8s-what-kubernetes-is',
  },
  {
    term: 'Reconciliation',
    definition:
      'The loop a controller repeats forever: read the desired state, read the current state, and take one step to close the gap. Because every pass reads the world afresh rather than replaying instructions, a controller recovers from a crash, a dropped notification, or a situation nobody anticipated.',
    lessonSlug: 'k8s-desired-state',
    aliases: ['control loop', 'reconciliation loop'],
  },

  // ---- Kubernetes: workloads (k8s-pods … k8s-daemonsets-jobs-cronjobs) ----
  {
    term: 'Pod',
    definition:
      'The smallest unit Kubernetes schedules: one or more containers sharing an IP address, a hostname, a set of volumes and a single lifetime, always placed on the same node. A Pod is never moved — when its node is lost, a replacement Pod is created elsewhere with a new name and address.',
    lessonSlug: 'k8s-pods',
  },
  {
    term: 'Label selector',
    definition:
      'A query over labels that names a set of objects without naming any of them individually, such as the Pods a Service routes to. It is evaluated afresh every time, so a Pod created later with matching labels joins the set on its own.',
    lessonSlug: 'k8s-labels-and-selectors',
    aliases: ['selector'],
  },
  {
    term: 'ReplicaSet',
    definition:
      'The controller that keeps a stated number of Pods matching its selector alive, creating or deleting Pods until the count is right. It knows nothing about versions, which is why a Deployment sits above it and gives every distinct Pod template its own ReplicaSet.',
    lessonSlug: 'k8s-deployments',
  },
  {
    term: 'StatefulSet',
    definition:
      'A workload controller that gives its Pods stable numbered identities, each with a predictable DNS name and its own PersistentVolumeClaim that survives rescheduling. It supplies names, order and disks; replication, leader election and failover remain the application’s job.',
    lessonSlug: 'k8s-statefulsets',
  },
  {
    term: 'DaemonSet',
    definition:
      'A workload controller that runs one Pod on every node and adds one automatically when a node joins the cluster. It fits per-node agents such as log shippers and metrics collectors, where the node list decides the replica count rather than you.',
    lessonSlug: 'k8s-daemonsets-jobs-cronjobs',
  },

  // ---- Kubernetes: networking (k8s-network-policies) ----
  {
    term: 'NetworkPolicy',
    definition:
      'An object that restricts which traffic may reach or leave the Pods it selects. A Pod no policy selects is wide open; the moment any policy selects it for a direction, that direction defaults to deny and only explicitly allowed traffic still flows.',
    lessonSlug: 'k8s-network-policies',
  },

  // ---- Kubernetes: scheduling (k8s-taints-and-spread) ----
  {
    term: 'Taint',
    definition:
      'A mark on a node that makes it unsuitable by default, so the scheduler will not place a Pod there unless the Pod carries a matching toleration. It is the node repelling workloads, the mirror image of affinity, where a workload is drawn towards a node.',
    lessonSlug: 'k8s-taints-and-spread',
  },
  {
    term: 'Toleration',
    definition:
      'A field on a Pod that allows it to be scheduled onto a node carrying a matching taint. It is permission rather than attraction: tolerating a taint does not make a node more attractive, so dedicating hardware needs a selector or affinity as well.',
    lessonSlug: 'k8s-taints-and-spread',
  },

  // ---- Kubernetes: storage (k8s-persistent-volumes, k8s-storage-classes) ----
  {
    term: 'PersistentVolumeClaim',
    definition:
      'A request for storage that states how much space, which access mode and which class of disk a workload needs, without naming any particular device. Kubernetes binds it to a PersistentVolume, and the claim gives the data a name that outlives every Pod that mounts it.',
    lessonSlug: 'k8s-persistent-volumes',
    aliases: ['PVC'],
  },
  {
    term: 'StorageClass',
    definition:
      'A named kind of storage a cluster can create on demand, pairing a provisioner with parameters such as disk type, encryption or zone. Naming a class in a claim means "make me one of these, at my size" rather than "hand me one from the shelf".',
    lessonSlug: 'k8s-storage-classes',
  },

  // ---- Kubernetes: security (k8s-rbac, k8s-admission-control) ----
  {
    term: 'RBAC',
    definition:
      'Role-based access control: the authorizer nearly every cluster runs, deciding whether a requester may perform a given verb on a given resource, in a namespace or across the cluster. It is purely additive — a subject holds the union of every rule bound to them, and nothing in the API expresses a denial.',
    lessonSlug: 'k8s-rbac',
  },
  {
    term: 'ServiceAccount',
    definition:
      'A namespaced object that provides the identity a workload presents when it calls the API server, and that permission rules can be bound to. Human users are not Kubernetes objects at all; a ServiceAccount is an identity the cluster itself issues.',
    lessonSlug: 'k8s-rbac',
  },
  {
    term: 'Admission control',
    definition:
      'The stage between authorization and storage where plugins inspect a submitted object, change it, or refuse it before it is written to etcd. Every write to the API server passes through it, whoever sent it, which is where cluster-wide rules of your own belong.',
    lessonSlug: 'k8s-admission-control',
  },

  // ---- Kubernetes: extending the API (k8s-operators) ----
  {
    term: 'Operator',
    definition:
      'A controller that encodes what an experienced human operator would do for one piece of software — take the backup, promote the replica, run the upgrade in the order that does not lose data. It watches a custom resource kind added to the API and reconciles it like any built-in object.',
    lessonSlug: 'k8s-operators',
  },

  // ---- System design: latency (sd-latency-and-throughput) ----
  {
    term: 'p99 latency',
    definition:
      'The duration 99% of requests come in at or below over some window. Percentiles are reported rather than an average because latency is a distribution, and a page assembled from many calls meets the slow tail far more often than the tail’s share of requests suggests.',
    lessonSlug: 'sd-latency-and-throughput',
    aliases: ['99th-percentile latency'],
  },

  // ---- System design: reliability (sd-idempotency-and-backpressure) ----
  {
    term: 'Idempotency',
    definition:
      'The property that performing an operation more than once has the same effect as performing it once. It has to be designed in, usually with a key the client generates once per logical operation and resends on every retry of it.',
    lessonSlug: 'sd-idempotency-and-backpressure',
  },
  {
    term: 'Backpressure',
    definition:
      'A signal from an overloaded component that makes its callers slow down or stop, instead of letting work pile up out of sight. Its mechanism is the bounded queue: when the queue is full the producer is blocked or rejected, and that rejection is information the caller can act on.',
    lessonSlug: 'sd-idempotency-and-backpressure',
  },
  {
    term: 'Cache stampede',
    definition:
      'Many concurrent requests missing on the same hot key at once, so all of them go to the origin together and the load it was being spared arrives in one burst. It happens at the moment of a miss — a TTL expiring, or a cold cache tier — rather than because of the miss itself.',
    lessonSlug: 'sd-caching',
    aliases: ['thundering herd', 'dogpile'],
  },

  // ---- System design: consistency (sd-consistency-models) ----
  {
    term: 'Consistency model',
    definition:
      'The contract a storage system offers about which values a read is allowed to return, given the writes that have already happened. It becomes a real question the moment data lives on more than one machine, because "the current value" stops being a single well-defined thing.',
    lessonSlug: 'sd-consistency-models',
  },
  {
    term: 'Eventual consistency',
    definition:
      'A model in which replicas converge if writes stop, so a read may return a stale value and nothing bounds how stale it is. Answers are fast because each replica replies from its own copy without waiting for the others to agree.',
    lessonSlug: 'sd-consistency-models',
  },
  {
    term: 'Linearizability',
    definition:
      'The strictest consistency model for a single object: every read returns the most recently acknowledged write, and the system behaves as though one copy handled all operations in one order. It costs coordination, at least a round trip to a majority of replicas.',
    lessonSlug: 'sd-consistency-models',
  },
  {
    term: 'Quorum',
    definition:
      'The number of replicas that must answer before a read or a write counts as done. Choosing sizes whose sum exceeds the number of replicas makes every read set overlap every write set, so a read reaches at least one copy carrying the last completed write.',
    lessonSlug: 'sd-consistency-models',
  },

  // ---- System design: data distribution (sd-replication-and-sharding) ----
  {
    term: 'Replication',
    definition:
      'Copying the same data to more machines, so any copy can serve a read and another can take over when the primary fails. It buys read capacity, availability and durability, and no write capacity at all, because every replica applies every write.',
    lessonSlug: 'sd-replication-and-sharding',
  },
  {
    term: 'Sharding',
    definition:
      'Splitting different data across separate machines so each holds only a slice, which is the tool that raises the write ceiling. It charges for that: any query, join or transaction spanning shards becomes a distributed operation the application has to assemble itself.',
    lessonSlug: 'sd-replication-and-sharding',
  },
  {
    term: 'Shard key',
    definition:
      'The field whose value decides which shard a record lives on. It settles which queries are one hop and which must ask every shard, and it is close to permanent, because changing it means moving rows.',
    lessonSlug: 'sd-replication-and-sharding',
    aliases: ['partition key'],
  },

  // ---- System design: asynchronous work (sd-message-queues, sd-event-streams) ----
  {
    term: 'Dead-letter queue',
    definition:
      'A separate queue a broker moves a message to once it has failed too many times, so one bad message neither blocks the consumers nor disappears. Nothing drains it automatically, which makes it an ongoing commitment rather than a setting.',
    lessonSlug: 'sd-message-queues',
    aliases: ['DLQ'],
  },
  {
    term: 'Event stream',
    definition:
      'An append-only log of records that readers consume by position rather than by taking work off it, so reading removes nothing and independent readers each hold their own cursor. Records leave on a retention policy, not because somebody processed them.',
    lessonSlug: 'sd-event-streams',
    aliases: ['append-only log'],
  },

  // ---- System design: delivery (sd-cdn, sd-netflix-video-delivery) ----
  {
    term: 'Content delivery network',
    definition:
      'A fleet of caching reverse proxies in data centres near readers, plus the routing that sends each reader to a near one. It saves two separate things: the round trip to a distant origin, and the bandwidth of serving one popular object to millions of people.',
    lessonSlug: 'sd-cdn',
    aliases: ['CDN'],
  },
  {
    term: 'Adaptive bitrate',
    definition:
      'A streaming technique in which the same content is encoded at several quality rungs and the player picks which rung to fetch for each short segment. The client decides, because only it knows its measured throughput, how much buffer it holds and how large its screen is.',
    lessonSlug: 'sd-netflix-video-delivery',
  },

  // ---- System design: recovery (sd-observability-and-recovery) ----
  {
    term: 'Recovery point objective',
    definition:
      'How much data a system accepts losing in a disaster, stated as a span of time: an objective of five minutes means up to five minutes of writes may be gone. It is bought by writing copies more often — snapshots, continuous replication, synchronous commits.',
    lessonSlug: 'sd-observability-and-recovery',
    aliases: ['RPO'],
  },
  {
    term: 'Recovery time objective',
    definition:
      'How long a system accepts being unavailable after a disaster before it is serving again. It is bought by having somewhere to fail over to, and by having rehearsed the failover rather than reading about it.',
    lessonSlug: 'sd-observability-and-recovery',
    aliases: ['RTO'],
  },
];
