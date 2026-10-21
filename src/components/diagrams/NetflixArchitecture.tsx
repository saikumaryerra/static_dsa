/**
 * A Netflix-like streaming platform end to end: the control plane of JSON, the
 * data plane of video bytes, and the fact that they are two different paths.
 * Ported from `NetflixArchitecture.astro` (React migration P3).
 *
 * Supplies only the shapes; `Figure` owns the `<svg>`, the accessible name and
 * description, the scroll frame and the caption. Every class comes from
 * Figure's drawing kit, so nothing here states a colour and both themes and
 * forced-colors mode come free.
 *
 * The claim the picture makes: no application server ever streams bytes. That
 * is why the CDN edge cache is the accent box, why the video path leaves the
 * client on its own line down the left margin rather than through the service
 * stack, and why NOT ONE connector joins a service box to the lower region.
 *
 * WHY PLAYBACK IS NOT WIRED TO THE CDN. It mints the manifest and the signed
 * URLs, so the temptation is to draw an arrow from playback into the data
 * plane. Any such edge reads as "playback talks to the CDN", which is the
 * exact misreading this figure exists to kill. The handoff is carried by the
 * box's own subtitle and by the caption instead.
 *
 * LAYOUT NOTE: every line travels through empty space. The gateway's fan-out
 * splits at one horizontal bus in the gap above the services, so five arrows
 * need one lane rather than five. The stores row deliberately leaves the
 * corridor between the metadata cache and the event stream empty, because that
 * is the lane the dashed training loop climbs to reach discovery, and the
 * event stream's feed to model training turns well to the right of it.
 *
 * TYPE TIERS: every component is `.dg-label` with its one-line job in `.dg-sub`
 * a tier below; connector labels are `.dg-sub` too, and the two region names
 * over the dashed groups are `.dg-legend`. There is no `.dg-mono` here: nothing
 * in this drawing is a literal command or identifier.
 */
import type { JSX } from 'react';
import Figure from '../Figure';

/**
 * The diagram.
 *
 * @returns The figure.
 */
export default function NetflixArchitecture(): JSX.Element {
  return (
    <Figure
      viewBox="0 0 720 484"
      title="Netflix-like streaming architecture"
      description="A clients box on the left, standing for a TV, a phone and a browser, is where two separate paths begin. The first runs right into a dashed control plane region: an edge point of presence that terminates TLS, checks the token and applies rate limits, and beside it an API gateway that fans out and returns one page. A single stem leaves the gateway and splits downward into a row of five service boxes: auth, profiles, catalogue metadata, discovery, and playback, whose job is the manifest and the signed URLs. Below the services sit their stores. The catalogue service points down into a metadata cache holding a full copy; the cache points left into a catalogue store, which it reads through to on a miss; the playback service points down into an event stream that records one event per action. The event stream points down into two boxes on the bottom row, analytics and model training, and a dashed arrow runs from model training back up to the discovery service, labelled rebuilds the rows. The second path leaves the same clients box, runs straight down the left margin past every service and store, labelled video segments, and enters a separate dashed data plane region below: a highlighted CDN edge cache close to the viewer, then a regional cache that fills a miss, then object storage as the origin. No connector joins any service box to that lower region."
      caption="Two paths leave the same client and never meet again: JSON goes up to the gateway, bytes come back from a cache. Playback mints the signed URL that opens the second path and then stays out of it, which is why no application server in this drawing ever carries a video byte."
      minWidth={640}
    >
      {/* The one client, and the fork */}
      <rect className="dg-box" x="6" y="52" width="132" height="52"></rect>
      <text className="dg-label" x="72" y="76" textAnchor="middle">
        Clients
      </text>
      <text className="dg-sub" x="72" y="93" textAnchor="middle">
        TV, phone, browser
      </text>

      {/* Control path: client into the edge */}
      <line className="dg-line" x1="138" y1="78" x2="154" y2="78"></line>
      <polygon className="dg-head" points="162,78 152,73 152,83"></polygon>

      {/* ---- Control plane ---- */}
      <rect className="dg-group" x="150" y="16" width="562" height="338"></rect>
      <text className="dg-legend" x="158" y="36">
        Control plane: JSON
      </text>

      <rect className="dg-box" x="162" y="52" width="250" height="52"></rect>
      <text className="dg-label" x="287" y="76" textAnchor="middle">
        Edge PoP
      </text>
      <text className="dg-sub" x="287" y="93" textAnchor="middle">
        TLS, token check, rate limit
      </text>

      <line className="dg-line" x1="412" y1="78" x2="436" y2="78"></line>
      <polygon className="dg-head" points="444,78 434,73 434,83"></polygon>

      <rect className="dg-box" x="444" y="52" width="256" height="52"></rect>
      <text className="dg-label" x="572" y="76" textAnchor="middle">
        API gateway
      </text>
      <text className="dg-sub" x="572" y="93" textAnchor="middle">
        fans out, returns one page
      </text>

      {/* One stem out of the gateway, split at a bus in the gap above the row */}
      <line className="dg-line" x1="572" y1="104" x2="572" y2="120"></line>
      <line className="dg-line" x1="198" y1="120" x2="645" y2="120"></line>

      <line className="dg-line" x1="198" y1="120" x2="198" y2="132"></line>
      <polygon className="dg-head" points="198,140 193,130 203,130"></polygon>
      <line className="dg-line" x1="288" y1="120" x2="288" y2="132"></line>
      <polygon className="dg-head" points="288,140 283,130 293,130"></polygon>
      <line className="dg-line" x1="395" y1="120" x2="395" y2="132"></line>
      <polygon className="dg-head" points="395,140 390,130 400,130"></polygon>
      <line className="dg-line" x1="519" y1="120" x2="519" y2="132"></line>
      <polygon className="dg-head" points="519,140 514,130 524,130"></polygon>
      <line className="dg-line" x1="645" y1="120" x2="645" y2="132"></line>
      <polygon className="dg-head" points="645,140 640,130 650,130"></polygon>

      {/* The services */}
      <rect className="dg-box" x="162" y="140" width="72" height="52"></rect>
      <text className="dg-label" x="198" y="164" textAnchor="middle">
        Auth
      </text>
      <text className="dg-sub" x="198" y="181" textAnchor="middle">
        tokens
      </text>

      <rect className="dg-box" x="242" y="140" width="92" height="52"></rect>
      <text className="dg-label" x="288" y="164" textAnchor="middle">
        Profiles
      </text>
      <text className="dg-sub" x="288" y="181" textAnchor="middle">
        per account
      </text>

      <rect className="dg-box" x="342" y="140" width="106" height="52"></rect>
      <text className="dg-label" x="395" y="164" textAnchor="middle">
        Catalogue
      </text>
      <text className="dg-sub" x="395" y="181" textAnchor="middle">
        metadata
      </text>

      <rect className="dg-box" x="456" y="140" width="126" height="52"></rect>
      <text className="dg-label" x="519" y="164" textAnchor="middle">
        Discovery
      </text>
      <text className="dg-sub" x="519" y="181" textAnchor="middle">
        recommendations
      </text>

      <rect className="dg-box" x="590" y="140" width="110" height="52"></rect>
      <text className="dg-label" x="645" y="164" textAnchor="middle">
        Playback
      </text>
      <text className="dg-sub" x="645" y="181" textAnchor="middle">
        manifest + URLs
      </text>

      {/* Each service that owns a store drops straight into it */}
      <line className="dg-line" x1="395" y1="192" x2="395" y2="208"></line>
      <polygon className="dg-head" points="395,216 390,206 400,206"></polygon>

      <line className="dg-line" x1="645" y1="192" x2="645" y2="208"></line>
      <polygon className="dg-head" points="645,216 640,206 650,206"></polygon>

      {/* The stores */}
      <rect className="dg-box" x="162" y="216" width="142" height="52"></rect>
      <text className="dg-label" x="233" y="240" textAnchor="middle">
        Catalogue store
      </text>
      <text className="dg-sub" x="233" y="257" textAnchor="middle">
        titles, artwork
      </text>

      <rect className="dg-box" x="325" y="216" width="140" height="52"></rect>
      <text className="dg-label" x="395" y="240" textAnchor="middle">
        Metadata cache
      </text>
      <text className="dg-sub" x="395" y="257" textAnchor="middle">
        a full copy
      </text>

      <rect className="dg-box" x="556" y="216" width="144" height="52"></rect>
      <text className="dg-label" x="628" y="240" textAnchor="middle">
        Event stream
      </text>
      <text className="dg-sub" x="628" y="257" textAnchor="middle">
        one per action
      </text>

      {/* The cache reads through to the store behind it */}
      <line className="dg-line" x1="325" y1="242" x2="316" y2="242"></line>
      <polygon className="dg-head" points="304,242 314,237 314,247"></polygon>

      {/* The stream feeds analytics, and the training path */}
      <line className="dg-line" x1="650" y1="268" x2="650" y2="284"></line>
      <polygon className="dg-head" points="650,292 645,282 655,282"></polygon>

      <line className="dg-line" x1="600" y1="268" x2="600" y2="278"></line>
      <line className="dg-line" x1="600" y1="278" x2="556" y2="278"></line>
      <line className="dg-line" x1="556" y1="278" x2="556" y2="284"></line>
      <polygon className="dg-head" points="556,292 551,282 561,282"></polygon>

      <rect className="dg-box" x="440" y="292" width="140" height="48"></rect>
      <text className="dg-label" x="510" y="316" textAnchor="middle">
        Model training
      </text>
      <text className="dg-sub" x="510" y="333" textAnchor="middle">
        offline
      </text>

      <rect className="dg-box" x="600" y="292" width="100" height="48"></rect>
      <text className="dg-label" x="650" y="316" textAnchor="middle">
        Analytics
      </text>
      <text className="dg-sub" x="650" y="333" textAnchor="middle">
        experiments
      </text>

      {/* Training climbs the empty corridor back to discovery */}
      <line
        className="dg-line dg-line--soft"
        x1="510"
        y1="292"
        x2="510"
        y2="200"
      ></line>
      <polygon
        className="dg-head dg-head--soft"
        points="510,192 505,202 515,202"
      ></polygon>
      <text className="dg-sub" x="520" y="208">
        rebuilds the rows
      </text>

      {/* Media path: down the left margin, past everything */}
      <line className="dg-line" x1="64" y1="104" x2="64" y2="432"></line>
      <line className="dg-line" x1="64" y1="432" x2="154" y2="432"></line>
      <polygon className="dg-head" points="162,432 152,427 152,437"></polygon>
      <text className="dg-sub" x="74" y="300">
        video
      </text>
      <text className="dg-sub" x="74" y="317">
        segments
      </text>

      {/* ---- Data plane ---- */}
      <rect className="dg-group" x="150" y="378" width="562" height="92"></rect>
      <text className="dg-legend" x="158" y="398">
        Data plane: video bytes
      </text>

      <rect
        className="dg-box dg-box--accent"
        x="162"
        y="406"
        width="180"
        height="52"
      ></rect>
      <text className="dg-label" x="252" y="430" textAnchor="middle">
        CDN edge cache
      </text>
      <text className="dg-sub" x="252" y="447" textAnchor="middle">
        close to the viewer
      </text>

      <line className="dg-line" x1="342" y1="432" x2="358" y2="432"></line>
      <polygon className="dg-head" points="366,432 356,427 356,437"></polygon>

      <rect className="dg-box" x="366" y="406" width="150" height="52"></rect>
      <text className="dg-label" x="441" y="430" textAnchor="middle">
        Regional cache
      </text>
      <text className="dg-sub" x="441" y="447" textAnchor="middle">
        fills a miss
      </text>

      <line className="dg-line" x1="516" y1="432" x2="532" y2="432"></line>
      <polygon className="dg-head" points="540,432 530,427 530,437"></polygon>

      <rect className="dg-box" x="540" y="406" width="160" height="52"></rect>
      <text className="dg-label" x="620" y="430" textAnchor="middle">
        Object storage
      </text>
      <text className="dg-sub" x="620" y="447" textAnchor="middle">
        the origin
      </text>
    </Figure>
  );
}
