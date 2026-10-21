/**
 * How a request reaches a Pod through a Service: the ClusterIP, and the three
 * components standing behind it (Appendix C, diagram 2).
 * Ported from `K8sRequestFlow.astro` (React migration P3).
 *
 * Supplies only the shapes; `Figure` owns the `<svg>`, the accessible name and
 * description, the scroll frame and the caption. Every class comes from
 * Figure's drawing kit, so nothing here states a colour and both themes and
 * forced-colors mode come free.
 *
 * The claim the picture makes: cluster DNS resolved the name, kube-proxy
 * programmed the path, and the EndpointSlice decided who is in the set. Three
 * different components, one request. That is why the ClusterIP is the accent
 * box and why nothing is drawn inside it: there is no process there to draw.
 *
 * LINE GRAMMAR: solid is the request (client to ClusterIP, ClusterIP to a Pod);
 * soft dashed is configuration that happened before the request and carries no
 * packet. Reading the drawing is then one rule, not three arrow labels, and the
 * distinction survives forced colours because `.dg-line--soft` is dashed rather
 * than merely paler. The modifier classes are composed with their base
 * (`dg-line dg-line--soft`) because the soft rules only override stroke and
 * dash; the width, fill and linecap live on the base.
 *
 * LAYOUT NOTE: every line travels through empty space. The two configuration
 * lines approach the ClusterIP from opposite edges (DNS straight down onto the
 * top, kube-proxy out to the right and up onto the bottom), so neither has to
 * pass through the client Pod that sits between kube-proxy and the flow. The
 * fan-out leaves the ClusterIP as one stem and splits at a vertical bus in the
 * gap before the Pods, so three arrows need one lane rather than three.
 *
 * TYPE TIERS: the components are `.dg-label`, addresses and the literal command
 * are `.dg-mono` a tier below, and connector labels and the qualifying phrases
 * inside a box are `.dg-sub`.
 */
import type { JSX } from 'react';
import Figure from '../Figure';

/**
 * The diagram.
 *
 * @returns The figure.
 */
export default function K8sRequestFlow(): JSX.Element {
  return (
    <Figure
      viewBox="0 0 700 360"
      title="Request path through a ClusterIP Service"
      description="A client Pod on the left sends a request rightward into a Service ClusterIP in the middle, drawn as the highlighted box and labelled 10.96.0.42 port 80, a virtual address that no process listens on. Above it, a cluster DNS box holding the name web.default.svc connects downward to the ClusterIP with a dashed line labelled 'resolves the name'. Below and to the left, a kube-proxy box inside a dashed Node boundary connects upward to the ClusterIP with a second dashed line labelled 'programs the rule'. A third dashed line runs leftward from an EndpointSlice box into kube-proxy, labelled 'ready endpoints'. From the right edge of the ClusterIP, solid arrows fan out to three ready backend Pods, each labelled with its own address and port. Every solid arrow is the request itself: client to ClusterIP, then ClusterIP to one Pod. Every dashed line is a component that set that path up beforehand, and none of them carries the request."
      caption="Cluster DNS resolves the name, kube-proxy programs the path, and the EndpointSlice decides who is in the set. Three different components stand behind one request, and each of them can be wrong on its own."
      minWidth={620}
    >
      {/* Cluster DNS */}
      <rect className="dg-box" x="232" y="16" width="206" height="56"></rect>
      <text className="dg-label" x="335" y="40" textAnchor="middle">
        Cluster DNS
      </text>
      <text className="dg-mono" x="335" y="58" textAnchor="middle">
        web.default.svc
      </text>

      {/* DNS resolved the name to the address, down onto the ClusterIP's top edge */}
      <line
        className="dg-line dg-line--soft"
        x1="335"
        y1="72"
        x2="335"
        y2="100"
      ></line>
      <polygon
        className="dg-head dg-head--soft"
        points="335,108 330,98 340,98"
      ></polygon>
      <text className="dg-sub" x="324" y="94" textAnchor="end">
        resolves the name
      </text>

      {/* Client Pod */}
      <rect className="dg-box" x="8" y="122" width="140" height="56"></rect>
      <text className="dg-label" x="78" y="146" textAnchor="middle">
        Client Pod
      </text>
      <text className="dg-mono" x="78" y="164" textAnchor="middle">
        curl http://web
      </text>

      {/* The request */}
      <line className="dg-line" x1="148" y1="150" x2="224" y2="150"></line>
      <polygon className="dg-head" points="232,150 222,145 222,155"></polygon>
      <text className="dg-sub" x="186" y="140" textAnchor="middle">
        request
      </text>

      {/* The Service's virtual address: the one thing the eye should land on */}
      <rect
        className="dg-box dg-box--accent"
        x="232"
        y="108"
        width="206"
        height="84"
      ></rect>
      <text className="dg-label" x="335" y="136" textAnchor="middle">
        Service ClusterIP
      </text>
      <text className="dg-mono" x="335" y="156" textAnchor="middle">
        10.96.0.42:80
      </text>
      <text className="dg-sub" x="335" y="176" textAnchor="middle">
        no process listens here
      </text>

      {/* The node, and the thing on it that makes the address reach a Pod */}
      <rect className="dg-group" x="8" y="246" width="180" height="100"></rect>
      <text className="dg-legend" x="16" y="266">
        Node
      </text>
      <rect className="dg-box" x="20" y="278" width="156" height="56"></rect>
      <text className="dg-label" x="98" y="302" textAnchor="middle">
        kube-proxy
      </text>
      <text className="dg-mono" x="98" y="320" textAnchor="middle">
        iptables / nftables
      </text>

      {/* kube-proxy up and around the client Pod onto the ClusterIP's bottom edge */}
      <line
        className="dg-line dg-line--soft"
        x1="98"
        y1="278"
        x2="98"
        y2="222"
      ></line>
      <line
        className="dg-line dg-line--soft"
        x1="98"
        y1="222"
        x2="290"
        y2="222"
      ></line>
      <line
        className="dg-line dg-line--soft"
        x1="290"
        y1="222"
        x2="290"
        y2="200"
      ></line>
      <polygon
        className="dg-head dg-head--soft"
        points="290,192 285,202 295,202"
      ></polygon>
      <text className="dg-sub" x="196" y="214" textAnchor="middle">
        programs the rule
      </text>

      {/* The list kube-proxy is programming from */}
      <rect className="dg-box" x="310" y="278" width="180" height="56"></rect>
      <text className="dg-label" x="400" y="302" textAnchor="middle">
        EndpointSlice
      </text>
      <text className="dg-sub" x="400" y="320" textAnchor="middle">
        who is in the set
      </text>
      <line
        className="dg-line dg-line--soft"
        x1="310"
        y1="306"
        x2="186"
        y2="306"
      ></line>
      <polygon
        className="dg-head dg-head--soft"
        points="176,306 186,301 186,311"
      ></polygon>
      <text className="dg-sub" x="248" y="298" textAnchor="middle">
        ready endpoints
      </text>

      {/* The Pods the rule can pick from */}
      <rect className="dg-group" x="512" y="32" width="180" height="214"></rect>
      <text className="dg-legend" x="520" y="52">
        Ready backend Pods
      </text>

      <rect className="dg-box" x="526" y="66" width="152" height="48"></rect>
      <text className="dg-label" x="602" y="88" textAnchor="middle">
        Pod
      </text>
      <text className="dg-mono" x="602" y="105" textAnchor="middle">
        10.244.1.7:8080
      </text>

      <rect className="dg-box" x="526" y="126" width="152" height="48"></rect>
      <text className="dg-label" x="602" y="148" textAnchor="middle">
        Pod
      </text>
      <text className="dg-mono" x="602" y="165" textAnchor="middle">
        10.244.2.15:8080
      </text>

      <rect className="dg-box" x="526" y="186" width="152" height="48"></rect>
      <text className="dg-label" x="602" y="208" textAnchor="middle">
        Pod
      </text>
      <text className="dg-mono" x="602" y="225" textAnchor="middle">
        10.244.3.4:8080
      </text>

      {/* One stem out of the ClusterIP, split at a bus in the gap before the Pods */}
      <line className="dg-line" x1="438" y1="150" x2="478" y2="150"></line>
      <line className="dg-line" x1="478" y1="90" x2="478" y2="210"></line>

      <line className="dg-line" x1="478" y1="90" x2="518" y2="90"></line>
      <polygon className="dg-head" points="526,90 516,85 516,95"></polygon>

      <line className="dg-line" x1="478" y1="150" x2="518" y2="150"></line>
      <polygon className="dg-head" points="526,150 516,145 516,155"></polygon>

      <line className="dg-line" x1="478" y1="210" x2="518" y2="210"></line>
      <polygon className="dg-head" points="526,210 516,205 516,215"></polygon>

      <text className="dg-sub" x="470" y="238" textAnchor="end">
        one Pod per connection
      </text>
    </Figure>
  );
}
