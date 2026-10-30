/**
 * Kubernetes cluster architecture — control plane, worker nodes, and the one
 * door between them (Appendix C, diagram 1).
 * Ported from `K8sArchitecture.astro` (React migration P3).
 *
 * Supplies only the shapes; `Figure` owns the `<svg>`, the accessible name and
 * description, the scroll frame and the caption. Every class comes from
 * Figure's drawing kit, so nothing here states a colour and both themes and
 * forced-colors mode come free.
 *
 * The claim the picture makes: every arrow that matters ends at the API server.
 * That is why it is the accent box, why it spans the full width of the control
 * plane with everything else beneath it, and why the kubelets reach across the
 * gap to it rather than to each other.
 *
 * LAYOUT NOTE: etcd and the scheduler sit side by side so the controller
 * manager's connector can run up the gap between them. Every line in this
 * drawing travels through empty space — a connector crossing a box reads as a
 * relationship that is not there.
 *
 * TYPE TIERS: control-plane components are `.dg-label`, the node's internals are
 * `.dg-mono` a tier below, and `.dg-mono` on the client is a literal command.
 * The tiering is what says the node boxes are inside something, without a third
 * kind of border.
 */
import type { JSX } from 'react';
import Figure from '../Figure';

/**
 * The diagram.
 *
 * @returns The figure.
 */
export default function K8sArchitecture(): JSX.Element {
  return (
    <Figure
      viewBox="0 0 690 356"
      title="Kubernetes cluster architecture"
      description="A client running kubectl on the left sends requests to the control plane in the middle. Inside the control plane the kube-apiserver spans the top. Below it, etcd and the kube-scheduler sit side by side, and the controller manager spans the bottom. The kube-apiserver writes to etcd; the scheduler and the controller manager each connect upward to the kube-apiserver and to nothing else — not to etcd, and not to each other. On the right are two worker nodes, each running a kubelet and a kube-proxy and hosting Pods. Each kubelet connects to the kube-apiserver; the two nodes do not connect to each other. Every connector in the diagram begins or ends at the kube-apiserver."
      caption="Every component talks to the API server and to nothing else. That single rule is most of what makes a Kubernetes cluster comprehensible: there is one door, one datastore behind it, and every other part is a client."
      minWidth={620}
    >
      {/* Client */}
      <rect className="dg-box" x="8" y="52" width="104" height="52"></rect>
      <text className="dg-label" x="60" y="76" textAnchor="middle">
        You
      </text>
      <text className="dg-mono" x="60" y="93" textAnchor="middle">
        kubectl
      </text>

      {/* Client to API server */}
      <line className="dg-line" x1="112" y1="78" x2="158" y2="78"></line>
      <polygon className="dg-head" points="166,78 156,73 156,83"></polygon>

      {/* Control plane */}
      <rect className="dg-group" x="150" y="16" width="290" height="252"></rect>
      <text className="dg-legend" x="158" y="36">
        Control plane
      </text>

      <rect
        className="dg-box dg-box--accent"
        x="166"
        y="52"
        width="258"
        height="52"
      ></rect>
      <text className="dg-label" x="295" y="76" textAnchor="middle">
        kube-apiserver
      </text>
      <text className="dg-sub" x="295" y="93" textAnchor="middle">
        the only door
      </text>

      <rect className="dg-box" x="166" y="128" width="100" height="48"></rect>
      <text className="dg-label" x="216" y="150" textAnchor="middle">
        etcd
      </text>
      <text className="dg-sub" x="216" y="167" textAnchor="middle">
        cluster state
      </text>

      <rect className="dg-box" x="290" y="128" width="134" height="48"></rect>
      <text className="dg-label" x="357" y="150" textAnchor="middle">
        kube-scheduler
      </text>
      <text className="dg-sub" x="357" y="167" textAnchor="middle">
        picks a node
      </text>

      <rect className="dg-box" x="166" y="204" width="258" height="48"></rect>
      <text className="dg-label" x="295" y="226" textAnchor="middle">
        controller manager
      </text>
      <text className="dg-sub" x="295" y="243" textAnchor="middle">
        runs the control loops
      </text>

      {/* API server writes to etcd */}
      <line className="dg-line" x1="216" y1="104" x2="216" y2="120"></line>
      <polygon className="dg-head" points="216,128 211,118 221,118"></polygon>

      {/* Scheduler reads and writes through the API server */}
      <line className="dg-line" x1="357" y1="128" x2="357" y2="112"></line>
      <polygon className="dg-head" points="357,104 352,114 362,114"></polygon>

      {/* Controller manager, up the gap between etcd and the scheduler */}
      <line className="dg-line" x1="278" y1="204" x2="278" y2="112"></line>
      <polygon className="dg-head" points="278,104 273,114 283,114"></polygon>

      {/* Worker node 1 */}
      <rect className="dg-group" x="470" y="16" width="200" height="150"></rect>
      <text className="dg-legend" x="478" y="36">
        Worker node
      </text>
      <rect className="dg-box" x="484" y="46" width="84" height="38"></rect>
      <text className="dg-mono" x="526" y="70" textAnchor="middle">
        kubelet
      </text>
      <rect className="dg-box" x="576" y="46" width="84" height="38"></rect>
      <text className="dg-mono" x="618" y="70" textAnchor="middle">
        kube-proxy
      </text>
      <rect className="dg-box" x="484" y="96" width="176" height="52"></rect>
      <text className="dg-label" x="572" y="119" textAnchor="middle">
        Pods
      </text>
      <text className="dg-sub" x="572" y="136" textAnchor="middle">
        your containers run here
      </text>

      {/* Worker node 2 */}
      <rect
        className="dg-group"
        x="470"
        y="190"
        width="200"
        height="150"
      ></rect>
      <text className="dg-legend" x="478" y="210">
        Worker node
      </text>
      <rect className="dg-box" x="484" y="220" width="84" height="38"></rect>
      <text className="dg-mono" x="526" y="244" textAnchor="middle">
        kubelet
      </text>
      <rect className="dg-box" x="576" y="220" width="84" height="38"></rect>
      <text className="dg-mono" x="618" y="244" textAnchor="middle">
        kube-proxy
      </text>
      <rect className="dg-box" x="484" y="270" width="176" height="52"></rect>
      <text className="dg-label" x="572" y="293" textAnchor="middle">
        Pods
      </text>
      <text className="dg-sub" x="572" y="310" textAnchor="middle">
        your containers run here
      </text>

      {/* Each kubelet to the API server, through the gap between the two groups */}
      <line className="dg-line" x1="484" y1="65" x2="432" y2="65"></line>
      <polygon className="dg-head" points="424,65 434,60 434,70"></polygon>

      <line className="dg-line" x1="484" y1="239" x2="452" y2="239"></line>
      <line className="dg-line" x1="452" y1="239" x2="452" y2="90"></line>
      <line className="dg-line" x1="452" y1="90" x2="432" y2="90"></line>
      <polygon className="dg-head" points="424,90 434,85 434,95"></polygon>
    </Figure>
  );
}
