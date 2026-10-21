/**
 * Three media-delivery architectures side by side: the same four stages, once
 * per platform, so the differences are readable as a comparison rather than as
 * three separate drawings.
 * Ported from `MediaDeliveryComparison.astro` (React migration P3).
 *
 * Supplies only the shapes; `Figure` owns the `<svg>`, the accessible name and
 * description, the scroll frame and the caption. Every class comes from
 * Figure's drawing kit, so nothing here states a colour and both themes and
 * forced-colors mode come free.
 *
 * The claim the picture makes: the ingest cell decides the three cells after
 * it. Curated studio delivery buys a slow high-quality encode, a small
 * catalogue and a prepositioned cache; continuous user upload spends all three.
 *
 * WHY THERE IS NO ACCENT BOX. The lesson's own caution is that the table is a
 * set of axes and not a scoreboard, so accenting a lane would assert a winner
 * the drawing is arguing against. The eye is meant to travel down a column, not
 * land on one box.
 *
 * LAYOUT NOTE: the four columns are byte-identical across the three lanes (x =
 * 20, 194, 368, 542, all 158 wide) because the comparison IS the alignment; a
 * per-lane width would break reading down a column. Every connector is a short
 * horizontal arrow inside a 16-unit gap between two boxes of the same lane, so
 * no connector crosses a box, and the lanes are deliberately not joined to each
 * other.
 *
 * TYPE TIERS: the differentiating characteristic of each stage is `.dg-label`,
 * its qualifiers and the scale figures are `.dg-sub`. `.dg-legend` carries both
 * the four stage names across the top and the three lane names, which are the
 * drawing's two axes; position tells them apart. There is no literal command or
 * identifier here, so nothing is `.dg-mono`.
 */
import type { JSX } from 'react';
import Figure from '../Figure';

/**
 * The diagram.
 *
 * @returns The figure.
 */
export default function MediaDeliveryComparison(): JSX.Element {
  return (
    <Figure
      viewBox="0 0 720 428"
      title="Media delivery across three platforms"
      description="Three parallel lanes, one per platform, drawn as three dashed groups stacked top to bottom. Every lane holds the same four stages in the same four columns, headed Ingest, Processing, Storage and Delivery, with a short arrow running left to right from each stage to the next. The lanes are not connected to one another, and no box is highlighted: the drawing makes no claim that one lane is the hard one. The top lane, Streaming (Netflix-like), reads: Studio delivery, curated, low volume, high touch per title; then Encode once, into many renditions, quality over speed; then Small catalogue, tens of thousands of curated titles; then Pushed to CDN, popularity is knowable, very high cache hits. The middle lane, Music (Spotify-like), reads: Label delivery, distributors and licences, structured metadata; then Batch transcode, per track, cheap, audio and not video; then Large catalogue, about 100 million small audio files; then CDN and small files, prefetch ahead of play, offline downloads. The bottom lane, Video sharing (YouTube-like), reads: User upload, continuous, massive, resumable and moderated; then Transcode fleet, at extreme scale, publish latency binds; then Unbounded, about a billion videos and it grows daily; then CDN with hot spikes, filled on first view, cold tail behind it."
      caption="Read down a column and the four stages move together: what arrives at ingest decides the encode budget, the catalogue shape and whether a cache can be filled before anyone asks. That is why the ingest cell is the one to ask about first for a product you have never designed. No lane is accented, because none of them is the hard one; they are hard on different resources."
      minWidth={660}
    >
      {/* The four stages, read as columns across all three lanes */}
      <text className="dg-legend" x="99" y="22" textAnchor="middle">
        Ingest
      </text>
      <text className="dg-legend" x="273" y="22" textAnchor="middle">
        Processing
      </text>
      <text className="dg-legend" x="447" y="22" textAnchor="middle">
        Storage
      </text>
      <text className="dg-legend" x="621" y="22" textAnchor="middle">
        Delivery
      </text>

      {/* Lane 1: streaming */}
      <rect className="dg-group" x="8" y="32" width="704" height="118"></rect>
      <text className="dg-legend" x="20" y="52">
        Streaming (Netflix-like)
      </text>

      <rect className="dg-box" x="20" y="62" width="158" height="76"></rect>
      <text className="dg-label" x="99" y="88" textAnchor="middle">
        Studio delivery
      </text>
      <text className="dg-sub" x="99" y="108" textAnchor="middle">
        curated, low volume
      </text>
      <text className="dg-sub" x="99" y="126" textAnchor="middle">
        high touch per title
      </text>

      <line className="dg-line" x1="178" y1="100" x2="186" y2="100"></line>
      <polygon className="dg-head" points="194,100 184,95 184,105"></polygon>

      <rect className="dg-box" x="194" y="62" width="158" height="76"></rect>
      <text className="dg-label" x="273" y="88" textAnchor="middle">
        Encode once
      </text>
      <text className="dg-sub" x="273" y="108" textAnchor="middle">
        into many renditions
      </text>
      <text className="dg-sub" x="273" y="126" textAnchor="middle">
        quality over speed
      </text>

      <line className="dg-line" x1="352" y1="100" x2="360" y2="100"></line>
      <polygon className="dg-head" points="368,100 358,95 358,105"></polygon>

      <rect className="dg-box" x="368" y="62" width="158" height="76"></rect>
      <text className="dg-label" x="447" y="88" textAnchor="middle">
        Small catalogue
      </text>
      <text className="dg-sub" x="447" y="108" textAnchor="middle">
        tens of thousands
      </text>
      <text className="dg-sub" x="447" y="126" textAnchor="middle">
        of curated titles
      </text>

      <line className="dg-line" x1="526" y1="100" x2="534" y2="100"></line>
      <polygon className="dg-head" points="542,100 532,95 532,105"></polygon>

      <rect className="dg-box" x="542" y="62" width="158" height="76"></rect>
      <text className="dg-label" x="621" y="88" textAnchor="middle">
        Pushed to CDN
      </text>
      <text className="dg-sub" x="621" y="108" textAnchor="middle">
        popularity is knowable
      </text>
      <text className="dg-sub" x="621" y="126" textAnchor="middle">
        very high cache hits
      </text>

      {/* Lane 2: music */}
      <rect className="dg-group" x="8" y="166" width="704" height="118"></rect>
      <text className="dg-legend" x="20" y="186">
        Music (Spotify-like)
      </text>

      <rect className="dg-box" x="20" y="196" width="158" height="76"></rect>
      <text className="dg-label" x="99" y="222" textAnchor="middle">
        Label delivery
      </text>
      <text className="dg-sub" x="99" y="242" textAnchor="middle">
        distributors, licences
      </text>
      <text className="dg-sub" x="99" y="260" textAnchor="middle">
        structured metadata
      </text>

      <line className="dg-line" x1="178" y1="234" x2="186" y2="234"></line>
      <polygon className="dg-head" points="194,234 184,229 184,239"></polygon>

      <rect className="dg-box" x="194" y="196" width="158" height="76"></rect>
      <text className="dg-label" x="273" y="222" textAnchor="middle">
        Batch transcode
      </text>
      <text className="dg-sub" x="273" y="242" textAnchor="middle">
        per track, cheap
      </text>
      <text className="dg-sub" x="273" y="260" textAnchor="middle">
        audio, not video
      </text>

      <line className="dg-line" x1="352" y1="234" x2="360" y2="234"></line>
      <polygon className="dg-head" points="368,234 358,229 358,239"></polygon>

      <rect className="dg-box" x="368" y="196" width="158" height="76"></rect>
      <text className="dg-label" x="447" y="222" textAnchor="middle">
        Large catalogue
      </text>
      <text className="dg-sub" x="447" y="242" textAnchor="middle">
        about 100 million
      </text>
      <text className="dg-sub" x="447" y="260" textAnchor="middle">
        small audio files
      </text>

      <line className="dg-line" x1="526" y1="234" x2="534" y2="234"></line>
      <polygon className="dg-head" points="542,234 532,229 532,239"></polygon>

      <rect className="dg-box" x="542" y="196" width="158" height="76"></rect>
      <text className="dg-label" x="621" y="222" textAnchor="middle">
        CDN, small files
      </text>
      <text className="dg-sub" x="621" y="242" textAnchor="middle">
        prefetch ahead of play
      </text>
      <text className="dg-sub" x="621" y="260" textAnchor="middle">
        offline downloads
      </text>

      {/* Lane 3: video sharing */}
      <rect className="dg-group" x="8" y="300" width="704" height="118"></rect>
      <text className="dg-legend" x="20" y="320">
        Video sharing (YouTube-like)
      </text>

      <rect className="dg-box" x="20" y="330" width="158" height="76"></rect>
      <text className="dg-label" x="99" y="356" textAnchor="middle">
        User upload
      </text>
      <text className="dg-sub" x="99" y="376" textAnchor="middle">
        continuous, massive
      </text>
      <text className="dg-sub" x="99" y="394" textAnchor="middle">
        resumable, moderated
      </text>

      <line className="dg-line" x1="178" y1="368" x2="186" y2="368"></line>
      <polygon className="dg-head" points="194,368 184,363 184,373"></polygon>

      <rect className="dg-box" x="194" y="330" width="158" height="76"></rect>
      <text className="dg-label" x="273" y="356" textAnchor="middle">
        Transcode fleet
      </text>
      <text className="dg-sub" x="273" y="376" textAnchor="middle">
        at extreme scale
      </text>
      <text className="dg-sub" x="273" y="394" textAnchor="middle">
        publish latency binds
      </text>

      <line className="dg-line" x1="352" y1="368" x2="360" y2="368"></line>
      <polygon className="dg-head" points="368,368 358,363 358,373"></polygon>

      <rect className="dg-box" x="368" y="330" width="158" height="76"></rect>
      <text className="dg-label" x="447" y="356" textAnchor="middle">
        Unbounded
      </text>
      <text className="dg-sub" x="447" y="376" textAnchor="middle">
        about a billion videos
      </text>
      <text className="dg-sub" x="447" y="394" textAnchor="middle">
        and it grows daily
      </text>

      <line className="dg-line" x1="526" y1="368" x2="534" y2="368"></line>
      <polygon className="dg-head" points="542,368 532,363 532,373"></polygon>

      <rect className="dg-box" x="542" y="330" width="158" height="76"></rect>
      <text className="dg-label" x="621" y="356" textAnchor="middle">
        CDN, hot spikes
      </text>
      <text className="dg-sub" x="621" y="376" textAnchor="middle">
        filled on first view
      </text>
      <text className="dg-sub" x="621" y="394" textAnchor="middle">
        cold tail behind it
      </text>
    </Figure>
  );
}
