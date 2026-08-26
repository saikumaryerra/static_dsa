# Curriculum — Kubernetes and System Design

Every module and lesson of both courses: slug, title, objective and the
Appendix A/B topics it covers. This is the plan that survives compaction —
keep the **Status** column current.

**Conventions**

- Slugs are prefixed `k8s-` / `sd-` and live **flat** in `src/content/lessons/`
  (decision D-11). One `.mdx` file per lesson, filename = slug.
- `order` is **per course**, contiguous from 1, and assigned **module by module**
  — module 1 takes 1..n, module 2 takes n+1.., and so on. The home page derives
  its module list from the order lessons appear in, so a lesson out of module
  order silently reorders the landing page.
- Status: `—` not started · `draft` written · `ok` validated + reviewed + committed.

---

## Kubernetes — 14 modules, 67 lessons

Target version **1.36** (DECISIONS D-01). Every manifest uses the D-02 allowlist.

### Module 01 · `k8s-foundations` — Foundations (orders 1–5)

| # | Slug | Title | Objective | Appendix A |
|---|---|---|---|---|
| 1 | `k8s-what-kubernetes-is` | What Kubernetes Is | Why orchestration exists, and the reconciliation model that answers it. | A1 ✅ |
| 2 | `k8s-objects-and-manifests` | Objects, Manifests and the API | Read and write any manifest: apiVersion, kind, metadata, spec, status, API groups. | A1 |
| 3 | `k8s-desired-state` | Desired State and Reconciliation | How a controller actually works: watch, compare, act, repeat — level-triggered, not edge. | A1 |
| 4 | `k8s-namespaces-and-kubectl` | Namespaces and kubectl Essentials | Scope work with namespaces and drive the API from the command line. | A1 |
| 5 | `k8s-local-cluster` | A Local Cluster for the Exercises | Get a real cluster running with kind, minikube or k3d. | A1 |

### Module 02 · `k8s-workloads` — Core workloads (orders 6–11)

| # | Slug | Title | Objective | Appendix A |
|---|---|---|---|---|
| 6 | `k8s-pods` | Pods and the Pod Lifecycle | The unit Kubernetes actually schedules, and the phases it passes through. | A2 |
| 7 | `k8s-labels-and-selectors` | Labels, Selectors and Annotations | The loose coupling every controller and Service is built on. | A2 |
| 8 | `k8s-deployments` | Deployments and ReplicaSets | Run n identical Pods and change them safely. | A2 |
| 9 | `k8s-statefulsets` | StatefulSets | Stable identity and ordered rollout — and when not to want them. | A2 |
| 10 | `k8s-daemonsets-jobs-cronjobs` | DaemonSets, Jobs and CronJobs | One Pod per node, run-to-completion work, and work on a schedule. | A2 |
| 11 | `k8s-init-and-sidecar-containers` | Init Containers and Sidecars | Ordered setup, and the native sidecar that is stable since 1.33. | A2 |

### Module 03 · `k8s-networking` — Networking (orders 12–16)

| # | Slug | Title | Objective | Appendix A |
|---|---|---|---|---|
| 12 | `k8s-networking-model` | The Networking Model | The flat-network promise, and what a CNI has to deliver to keep it. | A3 |
| 13 | `k8s-services` | Services | ClusterIP, NodePort, LoadBalancer and headless — what each is really for. | A3 |
| 14 | `k8s-dns-and-discovery` | DNS and Service Discovery | How a name becomes an address, and the failure modes of that path. | A3 |
| 15 | `k8s-ingress-and-gateway` | Ingress and the Gateway API | HTTP routing into a cluster, and why Gateway API is the direction of travel. | A3 |
| 16 | `k8s-network-policies` | NetworkPolicies | Default-allow to default-deny, and where a service mesh starts. | A3 |

### Module 04 · `k8s-config` — Configuration and secrets (orders 17–20)

| # | Slug | Title | Objective | Appendix A |
|---|---|---|---|---|
| 17 | `k8s-configmaps` | ConfigMaps | Keep settings out of the image without inventing a config service. | A4 |
| 18 | `k8s-secrets` | Secrets | What a Secret is, what it is not, and what base64 does not do. | A4 |
| 19 | `k8s-injecting-configuration` | Injecting Configuration | Environment variables versus mounted files, and why the choice matters at rollout. | A4 |
| 20 | `k8s-secret-management` | Secret Management in Practice | Encryption at rest, external stores, and rotation you can actually perform. | A4 |

### Module 05 · `k8s-storage` — Storage (orders 21–25)

| # | Slug | Title | Objective | Appendix A |
|---|---|---|---|---|
| 21 | `k8s-volumes` | Ephemeral Storage and Volumes | What a container's filesystem really is, and the volumes that outlive it. | A5 |
| 22 | `k8s-persistent-volumes` | PersistentVolumes and Claims | The claim/volume split, and why it exists. | A5 |
| 23 | `k8s-storage-classes` | StorageClasses and Access Modes | Dynamic provisioning, and what ReadWriteMany does and does not promise. | A5 |
| 24 | `k8s-stateful-data` | StatefulSets with Persistent Data | Per-replica volumes, and what happens on scale-down. | A5 |
| 25 | `k8s-backup-and-snapshots` | Snapshots, Backup and Restore | A snapshot is not a backup; build a restore you have tested. | A5 |

### Module 06 · `k8s-scheduling` — Scheduling and resources (orders 26–30)

| # | Slug | Title | Objective | Appendix A |
|---|---|---|---|---|
| 26 | `k8s-requests-and-limits` | Requests, Limits and QoS | What a request buys, what a limit costs, and which class you end up in. | A6 |
| 27 | `k8s-how-scheduling-works` | How Scheduling Works | Filter then score: why a Pod landed where it did. | A6 |
| 28 | `k8s-affinity` | Selectors, Affinity and Anti-Affinity | Express placement rules without hardcoding a node name. | A6 |
| 29 | `k8s-taints-and-spread` | Taints, Tolerations and Topology Spread | Repel by default, and spread across failure domains. | A6 |
| 30 | `k8s-quotas-and-priority` | Quotas, Limits, Priority and Preemption | Share a cluster without one team taking all of it. | A6 |

### Module 07 · `k8s-reliability` — Reliability and health (orders 31–34)

| # | Slug | Title | Objective | Appendix A |
|---|---|---|---|---|
| 31 | `k8s-probes` | Liveness, Readiness and Startup Probes | Three questions, three probes — and the outage a wrong liveness probe causes. | A7 |
| 32 | `k8s-rolling-updates` | Rolling Updates and Rollback | Change a running service without dropping traffic, and undo it. | A7 |
| 33 | `k8s-disruption-budgets` | PodDisruptionBudgets | Survive a node drain you did not schedule. | A7 |
| 34 | `k8s-graceful-shutdown` | Graceful Shutdown | preStop, SIGTERM and the grace period — where dropped requests actually come from. | A7 |

### Module 08 · `k8s-security` — Security (orders 35–39)

| # | Slug | Title | Objective | Appendix A |
|---|---|---|---|---|
| 35 | `k8s-rbac` | RBAC and ServiceAccounts | Give a human and a workload exactly the permissions they need. | A8 |
| 36 | `k8s-pod-security-admission` | Pod Security Admission | The three Standards, and enforcing them per namespace. | A8 |
| 37 | `k8s-security-contexts` | Security Contexts | Drop root, drop capabilities, and make the filesystem read-only. | A8 |
| 38 | `k8s-image-security` | Image Security and the Supply Chain | Scanning, signing and SBOMs — and what each one actually proves. | A8 |
| 39 | `k8s-admission-control` | Admission Control | Validating and mutating webhooks, and policy engines as the ecosystem answer. | A8 |

### Module 09 · `k8s-observability` — Observability (orders 40–43)

| # | Slug | Title | Objective | Appendix A |
|---|---|---|---|---|
| 40 | `k8s-logs-and-events` | Logs and Events | Two different records, two different questions. | A9 |
| 41 | `k8s-metrics` | Metrics | Resource metrics, kube-state-metrics, and a Prometheus-style architecture. | A9 |
| 42 | `k8s-tracing` | Traces | What a trace answers that a metric cannot, in OpenTelemetry's vocabulary. | A9 |
| 43 | `k8s-monitoring-architecture` | Monitoring Architecture and Alerting | Alert on symptoms, and design a page somebody can act on. | A9 |

### Module 10 · `k8s-scaling` — Scaling (orders 44–47)

| # | Slug | Title | Objective | Appendix A |
|---|---|---|---|---|
| 44 | `k8s-horizontal-pod-autoscaler` | The Horizontal Pod Autoscaler | Scale on a signal that actually tracks load (`autoscaling/v2`). | A10 |
| 45 | `k8s-vertical-and-cluster-autoscaling` | Vertical and Cluster Autoscaling | Right-size a Pod, and add nodes when there is nowhere to put one. | A10 |
| 46 | `k8s-event-driven-scaling` | Event-Driven Scaling | Scale on queue depth, and scale to zero — as an ecosystem capability. | A10 |
| 47 | `k8s-capacity-planning` | Bottlenecks and Capacity Planning | Find the limit before it finds you. | A10 |

### Module 11 · `k8s-delivery` — Deployments and DevOps (orders 48–52)

| # | Slug | Title | Objective | Appendix A |
|---|---|---|---|---|
| 48 | `k8s-images-and-tags` | Immutable Images and Tagging | Why `:latest` breaks rollback, and what to tag instead. | A11 |
| 49 | `k8s-rollout-strategies` | Blue/Green and Canary | Two ways to limit the blast radius of a bad release. | A11 |
| 50 | `k8s-helm` | Helm | Package and template a release, and read a chart you did not write. | A11 |
| 51 | `k8s-kustomize` | Kustomize | Overlay per environment without templating anything. | A11 |
| 52 | `k8s-gitops` | GitOps and Environment Management | Make the repository the desired state, and the cluster the reconciler. | A11 |

### Module 12 · `k8s-production` — Production Kubernetes (orders 53–58)

| # | Slug | Title | Objective | Appendix A |
|---|---|---|---|---|
| 53 | `k8s-multi-environment` | Multi-Environment Strategy | Namespaces, clusters or both — and what each choice costs. | A12 |
| 54 | `k8s-upgrades` | Cluster Upgrades and Version Skew | Upgrade without an outage, inside the supported skew. | A12 |
| 55 | `k8s-etcd-and-disaster-recovery` | etcd, HA and Disaster Recovery | Back up the one thing that is irreplaceable, and practise the restore. | A12 |
| 56 | `k8s-multi-tenancy` | Multi-Tenancy | Isolate teams on shared infrastructure, and know what is not isolated. | A12 |
| 57 | `k8s-cost-optimization` | Cost Optimisation | Find the money: idle requests, oversized nodes, forgotten volumes. | A12 |
| 58 | `k8s-operators` | CRDs and Operators | Extend the API, and encode operational knowledge as a controller. | A12 |

### Module 13 · `k8s-troubleshooting` — Troubleshooting (orders 59–63)

| # | Slug | Title | Objective | Appendix A |
|---|---|---|---|---|
| 59 | `k8s-debugging-workflow` | A Systematic Debugging Workflow | get → describe → events → logs → exec: one order, every time. | A13 |
| 60 | `k8s-pod-startup-failures` | CrashLoopBackOff and ImagePullBackOff | Read the two most common failures and fix their real causes. | A13 |
| 61 | `k8s-scheduling-failures` | Pending Pods | Insufficient resources, taints, affinity and quota — told apart. | A13 |
| 62 | `k8s-network-failures` | DNS and Service Connectivity | Follow a request from Pod to endpoint and find where it stops. | A13 |
| 63 | `k8s-rollout-failures` | Readiness and Broken Rollouts | Diagnose a rollout that is stuck rather than failed. | A13 |

### Module 14 · `k8s-projects` — Practical projects (orders 64–67)

| # | Slug | Title | Objective | Appendix A |
|---|---|---|---|---|
| 64 | `k8s-project-stateless-service` | Project: A Stateless Web Service | Deploy it, expose it, and reach it by name. | A14 |
| 65 | `k8s-project-config-and-storage` | Project: Configuration, Secrets and Storage | Give it settings, credentials and a disk. | A14 |
| 66 | `k8s-project-health-and-rollout` | Project: Health, Autoscaling and a Safe Rollout | Make it survive a bad release and a traffic spike. | A14 |
| 67 | `k8s-project-observe-and-debug` | Project: Observe and Troubleshoot It | Break it on purpose, then find it with the workflow. | A14 |

---

## System Design — 9 modules, 45 lessons

Every architectural claim carries one of the three labels in CONTENT_STYLE.md.

### Module 01 · `sd-foundations` — The design workflow (orders 1–4)

| # | Slug | Title | Objective | Appendix B |
|---|---|---|---|---|
| 1 | `sd-design-workflow` | A Repeatable Design Workflow | Turn "design X" into thirteen answerable questions. | B1 ✅ |
| 2 | `sd-requirements` | Functional and Non-Functional Requirements | Separate what it does from how well, and scope out loud. | B1 |
| 3 | `sd-capacity-estimation` | Back-of-Envelope Estimation | Derive QPS, storage and bandwidth from stated assumptions. | B1 |
| 4 | `sd-trade-off-reasoning` | Reasoning About Trade-offs | State every decision with the cost that made it arguable. | B1 |

### Module 02 · `sd-properties` — Scale, latency and consistency (orders 5–8)

| # | Slug | Title | Objective | Appendix B |
|---|---|---|---|---|
| 5 | `sd-latency-and-throughput` | Latency and Throughput | Percentiles, queueing, and why p99 is the number that matters. | B1 |
| 6 | `sd-availability-and-durability` | Availability and Durability | Nines as an error budget; durability as a separate promise. | B1 |
| 7 | `sd-consistency-models` | Consistency Models, CAP and PACELC | Strong, eventual, read-your-writes — and what a partition forces. | B1 |
| 8 | `sd-idempotency-and-backpressure` | Idempotency, Retries and Backpressure | Timeouts, circuit breakers, and retry storms you caused yourself. | B1 |

### Module 03 · `sd-edge` — Building blocks: the edge (orders 9–13)

| # | Slug | Title | Objective | Appendix B |
|---|---|---|---|---|
| 9 | `sd-load-balancers` | Load Balancers and Reverse Proxies | L4 versus L7, health checking, and what a proxy adds beyond spreading load. | B2 |
| 10 | `sd-cdn` | Content Delivery Networks | Push the bytes to the reader; know what must not be cached. | B2 |
| 11 | `sd-caching` | Caching | Placement, key design, TTL, invalidation, stampedes and cold starts. | B2 |
| 12 | `sd-rate-limiting` | Rate Limiting | Token bucket versus sliding window, and limiting fairly at scale. | B2 |
| 13 | `sd-api-design` | API Design and Data Modelling | Design the contract before the schema, and pick the entities carefully. | B2 |

### Module 04 · `sd-data` — Building blocks: data (orders 14–18)

| # | Slug | Title | Objective | Appendix B |
|---|---|---|---|---|
| 14 | `sd-relational-databases` | Relational Databases | Transactions, indexes, isolation — and the scale where they bend. | B2 |
| 15 | `sd-nosql-databases` | NoSQL Databases | Key-value, document, wide-column and graph: what each buys and gives up. | B2 |
| 16 | `sd-object-storage` | Object Storage | Where large immutable blobs belong, and why not the database. | B2 |
| 17 | `sd-search-indexes` | Search Indexes | Inverted indexes, ranking, freshness, and why search is its own system. | B2 |
| 18 | `sd-replication-and-sharding` | Replication, Partitioning and Sharding | Copies for reads, splits for writes, and choosing a key you can live with. | B2 |

### Module 05 · `sd-async` — Building blocks: asynchrony and operations (orders 19–23)

| # | Slug | Title | Objective | Appendix B |
|---|---|---|---|---|
| 19 | `sd-message-queues` | Message Queues | Decouple producer from consumer; delivery semantics and dead letters. | B2 |
| 20 | `sd-event-streams` | Event Streams | A replayable log, and how it differs from a queue in every way that matters. | B2 |
| 21 | `sd-workers-and-schedulers` | Workers and Schedulers | Run work later, run it repeatedly, and run it exactly once enough. | B2 |
| 22 | `sd-service-discovery` | Service Discovery and Coordination | Find a peer; agree on a leader; know why consensus is expensive. | B2 |
| 23 | `sd-observability-and-recovery` | Observability, Failure Handling and DR | Metrics, logs, traces, degradation, RPO and RTO. | B2 |

### Module 06 · `sd-netflix` — Designing a Netflix-like streaming platform (orders 24–29)

| # | Slug | Title | Objective | Appendix B |
|---|---|---|---|---|
| 24 | `sd-netflix-requirements` | Requirements and Scale | Profiles, catalogue, playback, devices — and the numbers they imply. | B3 |
| 25 | `sd-netflix-architecture` | High-Level Architecture | Edge, gateway, catalogue, playback, data and event pipelines. | B3 |
| 26 | `sd-netflix-video-delivery` | Video Delivery | Encode, segment, adapt, cache — and why no app server streams bytes. | B3 |
| 27 | `sd-netflix-recommendations` | Personalisation and Experimentation | Ranking a small catalogue, and testing changes on real traffic. | B3 |
| 28 | `sd-netflix-playback-state` | Watch History and Continue Watching | A small, high-frequency write path with a real consistency question. | B3 |
| 29 | `sd-netflix-reliability` | Scale, Reliability and Degradation | Regional failure, cache efficiency, and chaos engineering as practice. | B3 |

### Module 07 · `sd-spotify` — Designing a Spotify-like music platform (orders 30–35)

| # | Slug | Title | Objective | Appendix B |
|---|---|---|---|---|
| 30 | `sd-spotify-requirements` | Requirements and Request Rate | A hundred million small tracks, and sessions that touch dozens. | B4 |
| 31 | `sd-spotify-architecture` | Architecture and the Two Paths | Catalogue, playlist, playback and event services, and what joins them. | B4 |
| 32 | `sd-spotify-audio-delivery` | Audio Delivery and Offline | Small files, prefetch, caching, and rights at concept level. | B4 |
| 33 | `sd-spotify-recommendations` | The Recommendation Pipeline | Events → features → candidates → ranking → feedback, offline and online. | B4 |
| 34 | `sd-spotify-playlists` | Playlist Consistency | Concurrent and collaborative edits, ordering and conflict handling. | B4 |
| 35 | `sd-spotify-reliability` | Scale, Events and Reliability | Listening events at volume, bursts, outages and degradation. | B4 |

### Module 08 · `sd-youtube` — Designing a YouTube-like video platform (orders 36–42)

| # | Slug | Title | Objective | Appendix B |
|---|---|---|---|---|
| 36 | `sd-youtube-requirements` | Requirements and an Unbounded Catalogue | Anyone uploads; a billion videos; a long tail that dominates. | B5 |
| 37 | `sd-youtube-upload-pipeline` | Upload and Transcoding | Resumable upload → storage → queue → transcode → moderate → publish. | B5 |
| 38 | `sd-youtube-playback` | Playback and Delivery | Manifests, segments, ABR, and hot content over a cold catalogue. | B5 |
| 39 | `sd-youtube-search` | Search | Indexing, ranking, freshness, autocomplete and distribution. | B5 |
| 40 | `sd-youtube-recommendations` | Recommendations | Candidate generation and ranking, as the 2016 paper describes them. | B5 |
| 41 | `sd-youtube-engagement` | Comments, Counters and Notifications | Huge write volume, eventual counters and fan-out. | B5 |
| 42 | `sd-youtube-scale` | Storage, Bandwidth and Failure | Where the money goes, and what a region loss looks like. | B5 |

### Module 09 · `sd-comparison` — Comparative architecture (orders 43–45)

| # | Slug | Title | Objective | Appendix B |
|---|---|---|---|---|
| 43 | `sd-comparison-table` | Three Platforms Side by Side | The comparison table, read column by column. | B6 |
| 44 | `sd-comparison-why-different` | Why the Architectures Differ | Workload shape, not taste, is what decides. | B6 |
| 45 | `sd-comparison-applying` | Applying It to a New Problem | Place an unfamiliar product on the same axes and predict its architecture. | B6 |

---

## Status

All 112 planned lessons are written, reviewed and shipped; this table was the
production tracker and is kept as the final count.

| Course | Modules | Lessons | Status |
|---|---|---|---|
| Kubernetes | 14 | 67 | **all shipped** |
| System Design | 9 | 45 | **all shipped** |

Coverage is enforced rather than tracked here: every Appendix A and B topic in
`coverage.json` maps to a published lesson, and `npm run validate:content --strict`
fails if one does not.
