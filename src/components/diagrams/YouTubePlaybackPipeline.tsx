/**
 * The playback path over a long-tail catalogue: one request to the application
 * path, two to the delivery network, and three cache tiers behind them.
 * Ported from `YouTubePlaybackPipeline.astro` (React migration P3).
 *
 * Supplies only the shapes; `Figure` owns the `<svg>`, the accessible name and
 * description, the scroll frame and the caption. Every class comes from
 * Figure's drawing kit, so nothing here states a colour and both themes and
 * forced-colors mode come free.
 *
 * The claim the picture makes: the page comes from the application path and the
 * media does not, and what a user-upload catalogue changes is not the mechanism
 * but the shape of the miss stream behind the edge. That is why the edge cache
 * is the accent box — it is where roughly nine requests in ten stop, and the
 * two boxes to its right exist only for the ones that do not.
 *
 * THE SHARES ARE A TEACHING ASSUMPTION, and the drawing says so in words rather
 * than leaving the reader to infer it: the lesson derives ~90% at the edge from
 * a hot set that fits, and the ~9%/~1% split from the regional tier catching
 * most of the remainder. They are orders of magnitude, not measurements, and
 * the in-figure note is load-bearing, not decoration.
 *
 * LINE GRAMMAR: solid is a request, drawn in the request direction — viewer to
 * application path, viewer to edge, and each miss upward to the next tier.
 * Nothing is drawn coming back, because the return path is the same edge in
 * reverse and a second set of arrows would double every line for no new fact.
 * Soft dashed is the player's own adaptive-bitrate choice, which issues no
 * request and reaches nothing but the list of rungs — dashed rather than merely
 * paler so the distinction survives forced colours (spec §12).
 *
 * LAYOUT NOTE: the manifest and segment requests both start at the viewer and
 * both end on the edge cache, which is the one place two connectors could
 * collide. They are given separate lanes (x=166 and x=184) and separate bands
 * (y=168 and y=140) in the empty strip between the application group and the
 * CDN group, with the OUTER lane taking the UPPER band — swap either and the
 * two paths cross. Both then drop onto the edge box's top edge rather than its
 * left, because the top has room for the labels and the left does not. No line
 * in this drawing crosses a box.
 *
 * TYPE TIERS: the viewer, the two application boxes and the three cache tiers
 * are `.dg-label`; qualifying phrases and connector labels are `.dg-sub`; the
 * request shares and the rung names are `.dg-mono`, because a share is a figure
 * and a rung is an identifier.
 */
import type { JSX } from 'react';
import Figure from '../Figure';

/**
 * The diagram.
 *
 * @returns The figure.
 */
export default function YouTubePlaybackPipeline(): JSX.Element {
  return (
    <Figure
      viewBox="0 0 720 360"
      title="Playback path over a long-tail catalogue"
      description="A viewer at the top left makes three numbered requests, drawn as solid arrows pointing in the direction of the request. Request 1, labelled watch page, runs right from the Viewer box, which is captioned browser and player, into a dashed group named Application path. That group holds two boxes: Watch page, captioned HTML and player, and an arrow from it running right into Metadata, captioned manifest URL, token. Request 2, labelled manifest, short TTL, leaves the viewer, runs right and then down, and ends on the top edge of the Edge cache box. Request 3, labelled segments, immutable, takes a parallel route in its own lane and ends on the top edge of the same Edge cache box, a little to the right of where request 2 arrives. The Edge cache is the highlighted box and the first of three boxes in a dashed group named CDN, laid out left to right. Edge cache, holds the HOT set, ~90% of requests. Then Regional shield, the warm shoulder, ~9% of requests. Then Object storage, origin, COLD tail, ~1% of requests. An arrow labelled miss runs rightward from the Edge cache to the Regional shield, and a second arrow labelled miss runs rightward from the Regional shield to Object storage; nothing runs back the other way, and neither the shield nor object storage is reached by the viewer directly. A note inside that group reads: shares of segment requests, order of magnitude, a teaching assumption. Below the viewer, a dashed arrow labelled picks a rung from the manifest points down into a second dashed group, named Renditions, holding four stacked boxes reading 1080p, 720p, 480p and 360p and captioned rungs that exist now. That dashed arrow is the only connector that is not a request: the choice of rendition is the player's alone and reaches nothing but the list of rungs."
      caption="Only one of the paths leaving the viewer carries media, and it never touches an application server. The tiers behind it are where a long-tail catalogue shows itself: the edge holds the head and the shield the shoulder, so the tail's requests are origin traffic by design rather than a rare fallback."
      minWidth={640}
    >
      {/* The client. Every arrow in the drawing starts here or behind the edge. */}
      <rect className="dg-box" x="8" y="36" width="142" height="66"></rect>
      <text className="dg-label" x="79" y="64" textAnchor="middle">
        Viewer
      </text>
      <text className="dg-sub" x="79" y="84" textAnchor="middle">
        browser and player
      </text>

      {/* 1. The watch page, the one request the application path answers */}
      <text className="dg-sub" x="205" y="52" textAnchor="middle">
        1 watch page
      </text>
      <line className="dg-line" x1="150" y1="62" x2="256" y2="62"></line>
      <polygon className="dg-head" points="264,62 254,57 254,67"></polygon>

      <rect className="dg-group" x="250" y="16" width="336" height="100"></rect>
      <text className="dg-legend" x="258" y="36">
        Application path
      </text>

      <rect className="dg-box" x="264" y="46" width="142" height="56"></rect>
      <text className="dg-label" x="335" y="72" textAnchor="middle">
        Watch page
      </text>
      <text className="dg-sub" x="335" y="91" textAnchor="middle">
        HTML and player
      </text>

      <line className="dg-line" x1="406" y1="74" x2="420" y2="74"></line>
      <polygon className="dg-head" points="428,74 418,69 418,79"></polygon>

      <rect className="dg-box" x="428" y="46" width="142" height="56"></rect>
      <text className="dg-label" x="499" y="72" textAnchor="middle">
        Metadata
      </text>
      <text className="dg-sub" x="499" y="91" textAnchor="middle">
        manifest URL, token
      </text>

      {/* 3. Segments: the outer lane takes the upper band (see LAYOUT NOTE) */}
      <text className="dg-sub" x="252" y="132" textAnchor="middle">
        3 segments, immutable
      </text>
      <line className="dg-line" x1="150" y1="76" x2="184" y2="76"></line>
      <line className="dg-line" x1="184" y1="76" x2="184" y2="140"></line>
      <line className="dg-line" x1="184" y1="140" x2="320" y2="140"></line>
      <line className="dg-line" x1="320" y1="140" x2="320" y2="208"></line>
      <polygon className="dg-head" points="320,216 315,206 325,206"></polygon>

      {/* 2. The manifest: fetched first, and the only short-lived object here */}
      <text className="dg-sub" x="172" y="160">
        2 manifest, short TTL
      </text>
      <line className="dg-line" x1="150" y1="94" x2="166" y2="94"></line>
      <line className="dg-line" x1="166" y1="94" x2="166" y2="168"></line>
      <line className="dg-line" x1="166" y1="168" x2="250" y2="168"></line>
      <line className="dg-line" x1="250" y1="168" x2="250" y2="208"></line>
      <polygon className="dg-head" points="250,216 245,206 255,206"></polygon>

      {/* Adaptive bitrate: no request, and it reaches only the rungs */}
      <text className="dg-sub" x="122" y="116" textAnchor="end">
        picks a rung
      </text>
      <text className="dg-sub" x="122" y="132" textAnchor="end">
        from the manifest
      </text>
      <line
        className="dg-line dg-line--soft"
        x1="130"
        y1="102"
        x2="130"
        y2="132"
      ></line>
      <polygon
        className="dg-head dg-head--soft"
        points="130,140 125,130 135,130"
      ></polygon>

      <rect className="dg-group" x="8" y="140" width="142" height="190"></rect>
      <text className="dg-legend" x="16" y="160">
        Renditions
      </text>

      <rect className="dg-box" x="24" y="176" width="110" height="26"></rect>
      <text className="dg-mono" x="79" y="194" textAnchor="middle">
        1080p
      </text>

      <rect className="dg-box" x="24" y="208" width="110" height="26"></rect>
      <text className="dg-mono" x="79" y="226" textAnchor="middle">
        720p
      </text>

      <rect className="dg-box" x="24" y="240" width="110" height="26"></rect>
      <text className="dg-mono" x="79" y="258" textAnchor="middle">
        480p
      </text>

      <rect className="dg-box" x="24" y="272" width="110" height="26"></rect>
      <text className="dg-mono" x="79" y="290" textAnchor="middle">
        360p
      </text>

      <text className="dg-sub" x="79" y="320" textAnchor="middle">
        rungs that exist now
      </text>

      {/* The tiers. Pull-through: each miss is the next tier's first request. */}
      <rect
        className="dg-group"
        x="200"
        y="176"
        width="512"
        height="176"
      ></rect>
      <text className="dg-legend" x="208" y="196">
        CDN
      </text>

      <rect
        className="dg-box dg-box--accent"
        x="214"
        y="216"
        width="142"
        height="76"
      ></rect>
      <text className="dg-label" x="285" y="244" textAnchor="middle">
        Edge cache
      </text>
      <text className="dg-sub" x="285" y="263" textAnchor="middle">
        holds the HOT set
      </text>
      <text className="dg-mono" x="285" y="282" textAnchor="middle">
        ~90% of requests
      </text>

      <text className="dg-sub" x="370" y="246" textAnchor="middle">
        miss
      </text>
      <line className="dg-line" x1="356" y1="254" x2="376" y2="254"></line>
      <polygon className="dg-head" points="384,254 374,249 374,259"></polygon>

      <rect className="dg-box" x="384" y="216" width="142" height="76"></rect>
      <text className="dg-label" x="455" y="244" textAnchor="middle">
        Regional shield
      </text>
      <text className="dg-sub" x="455" y="263" textAnchor="middle">
        the warm shoulder
      </text>
      <text className="dg-mono" x="455" y="282" textAnchor="middle">
        ~9% of requests
      </text>

      <text className="dg-sub" x="540" y="246" textAnchor="middle">
        miss
      </text>
      <line className="dg-line" x1="526" y1="254" x2="546" y2="254"></line>
      <polygon className="dg-head" points="554,254 544,249 544,259"></polygon>

      <rect className="dg-box" x="554" y="216" width="142" height="76"></rect>
      <text className="dg-label" x="625" y="244" textAnchor="middle">
        Object storage
      </text>
      <text className="dg-sub" x="625" y="263" textAnchor="middle">
        origin, COLD tail
      </text>
      <text className="dg-mono" x="625" y="282" textAnchor="middle">
        ~1% of requests
      </text>

      <text className="dg-sub" x="214" y="326">
        Shares of segment requests, order of magnitude, a teaching assumption.
      </text>
    </Figure>
  );
}
