/**
 * A Spotify-like music platform end to end: the synchronous path a listener
 * waits on, the asynchronous path they never do, and the audio bytes that touch
 * neither.
 * Ported from `SpotifyArchitecture.astro` (React migration P3).
 *
 * Supplies only the shapes; `Figure` owns the `<svg>`, the accessible name and
 * description, the scroll frame and the caption. Every class comes from
 * Figure's drawing kit, so nothing here states a colour and both themes and
 * forced-colors mode come free.
 *
 * The claim the picture makes: three lines leave the client and never rejoin.
 * The event stream is the accent because it is the one of the three that no
 * listener is waiting on, which is what makes 50,000 events a second affordable.
 * Its band is drawn as its own region for the same reason.
 *
 * WHY THE CLIENT, NOT PLAYBACK, FEEDS THE EVENT STREAM. Drawing playback into
 * the stream would put a listening event on the synchronous path, which is one
 * of the lesson's own pitfalls. The events lane therefore leaves the client with
 * the other two and enters the stream from outside the service region.
 *
 * WHY THE RELATIONAL STORE SAYS "one schema per owner". Identity and playlist
 * both point into it, and the lesson bans a database shared by several services.
 * The sub is what makes the two arrows mean one tier with two owners rather than
 * two writers to one schema.
 *
 * WHY PLAYBACK IS NOT WIRED TO THE CDN, as in the video-platform figure: it
 * signs the URL that opens the audio path, so an edge from playback into the
 * bottom region reads as "playback carries the bytes", the exact misreading the
 * separate region exists to kill. The box's own subtitle carries the handoff.
 *
 * LAYOUT NOTE: every line travels through empty space. The gateway's fan-out
 * splits at one horizontal bus in the gap above the services, and the event
 * stream fans out at a second bus in the gap below its own row. Playback and
 * personalisation own no store, so the stores row is deliberately empty beneath
 * them, and that gap is the corridor the dashed rebuild arrow climbs.
 *
 * TYPE TIERS: every component is `.dg-label` with its one-line job in `.dg-sub`
 * a tier below; the lane label is `.dg-sub` too, and the three region names over
 * the dashed groups are `.dg-legend`. There is no `.dg-mono`: nothing in this
 * drawing is a literal command or identifier.
 */
import type { JSX } from 'react';
import Figure from '../Figure';

/**
 * The diagram.
 *
 * @returns The figure.
 */
export default function SpotifyArchitecture(): JSX.Element {
  return (
    <Figure
      viewBox="0 0 720 544"
      title="Spotify-like music platform architecture"
      description="A clients box on the left, standing for a phone, the web and a car, is where three separate lines begin. The first runs right into a dashed synchronous path region: an API gateway spans the top and authenticates, rate limits and routes. A single stem leaves the gateway and splits downward into a row of six services: identity for accounts, playlist for writes, catalogue for metadata, playback for the licence and the signed URL, search, and personalisation for recommendations. Below them sit three stores. Identity and playlist each point down into the relational store, which holds one schema per owner, so neither service writes the other's rows. Catalogue points down into a catalogue cache holding a full copy. Search points down into a search index, a derived copy. Playback and personalisation point at no store at all: playback owns nothing durable, it issues a licence and a URL and stops. The second line leaves the clients box, runs down the left margin below every service and enters a dashed asynchronous path region, arriving at a highlighted event stream that records listening events. The event stream fans out along one bus into analytics and into an offline recommendation pipeline, and a dashed arrow climbs from that pipeline back up to the personalisation service, labelled rebuilds shelves. The third line runs further down the same left margin, labelled audio bytes, into a separate dashed audio delivery region at the bottom: a CDN edge cache close to the listener, which reads from object storage as the audio origin. No connector joins any service box to that bottom region."
      caption="Three lines leave the client and never rejoin: requests go up to the gateway, every play and skip lands in the event stream, and audio comes back from a cache no service touches. Making that middle line asynchronous is the decision the rest of the drawing hangs on, because a stalled pipeline then costs a stale shelf tomorrow rather than a silent track now."
      minWidth={640}
    >
      {/* The one client, and the three lanes that leave it */}
      <rect className="dg-box" x="6" y="52" width="118" height="52"></rect>
      <text className="dg-label" x="65" y="76" textAnchor="middle">
        Clients
      </text>
      <text className="dg-sub" x="65" y="93" textAnchor="middle">
        phone, web, car
      </text>

      {/* Lane 1: the request path, into the gateway */}
      <line className="dg-line" x1="124" y1="78" x2="138" y2="78"></line>
      <polygon className="dg-head" points="146,78 136,73 136,83"></polygon>

      {/* ---- Synchronous path ---- */}
      <rect className="dg-group" x="134" y="16" width="578" height="272"></rect>
      <text className="dg-legend" x="142" y="36">
        Synchronous path: JSON
      </text>

      <rect className="dg-box" x="146" y="52" width="553" height="52"></rect>
      <text className="dg-label" x="422" y="76" textAnchor="middle">
        API gateway
      </text>
      <text className="dg-sub" x="422" y="93" textAnchor="middle">
        authenticate, rate limit, route
      </text>

      {/* One stem out of the gateway, split at a bus in the gap above the row */}
      <line className="dg-line" x1="422" y1="104" x2="422" y2="120"></line>
      <line className="dg-line" x1="183" y1="120" x2="639" y2="120"></line>

      <line className="dg-line" x1="183" y1="120" x2="183" y2="132"></line>
      <polygon className="dg-head" points="183,140 178,130 188,130"></polygon>
      <line className="dg-line" x1="264" y1="120" x2="264" y2="132"></line>
      <polygon className="dg-head" points="264,140 259,130 269,130"></polygon>
      <line className="dg-line" x1="351" y1="120" x2="351" y2="132"></line>
      <polygon className="dg-head" points="351,140 346,130 356,130"></polygon>
      <line className="dg-line" x1="447" y1="120" x2="447" y2="132"></line>
      <polygon className="dg-head" points="447,140 442,130 452,130"></polygon>
      <line className="dg-line" x1="536" y1="120" x2="536" y2="132"></line>
      <polygon className="dg-head" points="536,140 531,130 541,130"></polygon>
      <line className="dg-line" x1="639" y1="120" x2="639" y2="132"></line>
      <polygon className="dg-head" points="639,140 634,130 644,130"></polygon>

      {/* The services, ordered so the two relational owners sit side by side */}
      <rect className="dg-box" x="146" y="140" width="74" height="52"></rect>
      <text className="dg-label" x="183" y="164" textAnchor="middle">
        Identity
      </text>
      <text className="dg-sub" x="183" y="181" textAnchor="middle">
        accounts
      </text>

      <rect className="dg-box" x="227" y="140" width="74" height="52"></rect>
      <text className="dg-label" x="264" y="164" textAnchor="middle">
        Playlist
      </text>
      <text className="dg-sub" x="264" y="181" textAnchor="middle">
        writes
      </text>

      <rect className="dg-box" x="308" y="140" width="86" height="52"></rect>
      <text className="dg-label" x="351" y="164" textAnchor="middle">
        Catalogue
      </text>
      <text className="dg-sub" x="351" y="181" textAnchor="middle">
        metadata
      </text>

      <rect className="dg-box" x="401" y="140" width="92" height="52"></rect>
      <text className="dg-label" x="447" y="164" textAnchor="middle">
        Playback
      </text>
      <text className="dg-sub" x="447" y="181" textAnchor="middle">
        licence + URL
      </text>

      <rect className="dg-box" x="500" y="140" width="72" height="52"></rect>
      <text className="dg-label" x="536" y="164" textAnchor="middle">
        Search
      </text>
      <text className="dg-sub" x="536" y="181" textAnchor="middle">
        queries
      </text>

      <rect className="dg-box" x="579" y="140" width="120" height="52"></rect>
      <text className="dg-label" x="639" y="164" textAnchor="middle">
        Personalisation
      </text>
      <text className="dg-sub" x="639" y="181" textAnchor="middle">
        recommendations
      </text>

      {/* Each service that owns a store drops straight into it */}
      <line className="dg-line" x1="183" y1="192" x2="183" y2="208"></line>
      <polygon className="dg-head" points="183,216 178,206 188,206"></polygon>
      <line className="dg-line" x1="264" y1="192" x2="264" y2="208"></line>
      <polygon className="dg-head" points="264,216 259,206 269,206"></polygon>
      <line className="dg-line" x1="351" y1="192" x2="351" y2="208"></line>
      <polygon className="dg-head" points="351,216 346,206 356,206"></polygon>
      <line className="dg-line" x1="536" y1="192" x2="536" y2="208"></line>
      <polygon className="dg-head" points="536,216 531,206 541,206"></polygon>

      {/* The stores */}
      <rect className="dg-box" x="146" y="216" width="160" height="52"></rect>
      <text className="dg-label" x="226" y="240" textAnchor="middle">
        Relational store
      </text>
      <text className="dg-sub" x="226" y="257" textAnchor="middle">
        one schema per owner
      </text>

      <rect className="dg-box" x="316" y="216" width="134" height="52"></rect>
      <text className="dg-label" x="383" y="240" textAnchor="middle">
        Catalogue cache
      </text>
      <text className="dg-sub" x="383" y="257" textAnchor="middle">
        a full copy
      </text>

      <rect className="dg-box" x="475" y="216" width="124" height="52"></rect>
      <text className="dg-label" x="537" y="240" textAnchor="middle">
        Search index
      </text>
      <text className="dg-sub" x="537" y="257" textAnchor="middle">
        a derived copy
      </text>

      {/* Lane 2: listening events, down the left margin and into the stream */}
      <line className="dg-line" x1="88" y1="104" x2="88" y2="360"></line>
      <line className="dg-line" x1="88" y1="360" x2="138" y2="360"></line>
      <polygon className="dg-head" points="146,360 136,355 136,365"></polygon>

      {/* ---- Asynchronous path ---- */}
      <rect
        className="dg-group"
        x="134"
        y="302"
        width="578"
        height="116"
      ></rect>
      <text className="dg-legend" x="142" y="322">
        Asynchronous path: events
      </text>

      <rect
        className="dg-box dg-box--accent"
        x="146"
        y="334"
        width="170"
        height="52"
      ></rect>
      <text className="dg-label" x="231" y="358" textAnchor="middle">
        Event stream
      </text>
      <text className="dg-sub" x="231" y="375" textAnchor="middle">
        listening events
      </text>

      <rect className="dg-box" x="372" y="334" width="118" height="52"></rect>
      <text className="dg-label" x="431" y="358" textAnchor="middle">
        Analytics
      </text>
      <text className="dg-sub" x="431" y="375" textAnchor="middle">
        dashboards
      </text>

      <rect className="dg-box" x="506" y="334" width="193" height="52"></rect>
      <text className="dg-label" x="602" y="358" textAnchor="middle">
        Recommendation pipeline
      </text>
      <text className="dg-sub" x="602" y="375" textAnchor="middle">
        offline
      </text>

      {/* One stem out of the stream, split at a bus in the gap below the row */}
      <line className="dg-line" x1="231" y1="386" x2="231" y2="402"></line>
      <line className="dg-line" x1="231" y1="402" x2="602" y2="402"></line>
      <line className="dg-line" x1="431" y1="402" x2="431" y2="394"></line>
      <polygon className="dg-head" points="431,386 426,396 436,396"></polygon>
      <line className="dg-line" x1="602" y1="402" x2="602" y2="394"></line>
      <polygon className="dg-head" points="602,386 597,396 607,396"></polygon>

      {/* The rebuild climbs the empty corridor to personalisation */}
      <line
        className="dg-line dg-line--soft"
        x1="639"
        y1="334"
        x2="639"
        y2="200"
      ></line>
      <polygon
        className="dg-head dg-head--soft"
        points="639,192 634,202 644,202"
      ></polygon>
      <text className="dg-sub" x="649" y="230">
        rebuilds
      </text>
      <text className="dg-sub" x="649" y="246">
        shelves
      </text>

      {/* Lane 3: audio, down the left margin past everything */}
      <line className="dg-line" x1="40" y1="104" x2="40" y2="490"></line>
      <line className="dg-line" x1="40" y1="490" x2="138" y2="490"></line>
      <polygon className="dg-head" points="146,490 136,485 136,495"></polygon>
      <text className="dg-sub" x="48" y="404">
        audio
      </text>
      <text className="dg-sub" x="48" y="421">
        bytes
      </text>

      {/* ---- Audio delivery ---- */}
      <rect className="dg-group" x="134" y="436" width="578" height="92"></rect>
      <text className="dg-legend" x="142" y="456">
        Audio delivery: bytes
      </text>

      <rect className="dg-box" x="146" y="464" width="250" height="52"></rect>
      <text className="dg-label" x="271" y="488" textAnchor="middle">
        CDN edge cache
      </text>
      <text className="dg-sub" x="271" y="505" textAnchor="middle">
        close to the listener
      </text>

      <line className="dg-line" x1="396" y1="490" x2="441" y2="490"></line>
      <polygon className="dg-head" points="449,490 439,485 439,495"></polygon>

      <rect className="dg-box" x="449" y="464" width="250" height="52"></rect>
      <text className="dg-label" x="574" y="488" textAnchor="middle">
        Object storage
      </text>
      <text className="dg-sub" x="574" y="505" textAnchor="middle">
        the audio origin
      </text>
    </Figure>
  );
}
