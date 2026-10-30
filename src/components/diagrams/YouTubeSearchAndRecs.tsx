/**
 * Recommendations and search over a billion-item catalogue: two paths that draw
 * from one corpus and meet again at their rankers.
 * Ported from `YouTubeSearchAndRecs.astro` (React migration P3).
 *
 * Supplies only the shapes; `Figure` owns the `<svg>`, the accessible name and
 * description, the scroll frame and the caption. Every class comes from
 * Figure's drawing kit, so nothing here states a colour and both themes and
 * forced-colors mode come free.
 *
 * The claim the picture makes: the expensive model never touches the catalogue.
 * That is why candidate generation is the accent box, why the two magnitudes
 * sit on either side of it - 1,000,000,000 on the box it reads from, a few
 * hundred on the arrow it emits - and why the search path is drawn beside it at
 * the same scale: search reaches its ranker by an index rather than by an
 * embedding lookup, and arrives with a comparably small set for the same
 * reason.
 *
 * LINE GRAMMAR: solid arrows are the flow, and every one of them points down or
 * outward from the catalogue. The single soft dashed connector, between the two
 * ranking boxes, carries NO arrowhead on purpose: the two rankers draw on the
 * same feature set, and an arrowhead would claim that one feeds the other.
 * Dashed rather than merely paler so the distinction survives forced colours
 * (spec section 12: never colour alone).
 *
 * LAYOUT NOTE: the catalogue sits above both groups and its two connectors run
 * down the empty lane between them before turning outward, so they enter the
 * two second-row boxes from the side rather than crossing the first-row boxes
 * above them. The recommendation column deliberately leaves its third row empty
 * - that is the space the "a few hundred candidates" label needs, and it is
 * also what puts the two ranking boxes on the same row so the shared-features
 * link can be a straight line through the lane. No connector crosses a box.
 *
 * TYPE TIERS: every stage is `.dg-label` with a `.dg-sub` qualifier beneath it;
 * the one `.dg-mono` is the literal query a viewer typed, which is the only
 * string in the drawing that is a value rather than a name.
 */
import type { JSX } from 'react';
import Figure from '../Figure';

/**
 * The diagram.
 *
 * @returns The figure.
 */
export default function YouTubeSearchAndRecs(): JSX.Element {
  return (
    <Figure
      viewBox="0 0 700 500"
      title="Recommendation and search paths"
      description="A box at the top named Catalogue, holding 1,000,000,000 videos, is the source both paths read from. Two arrows leave its underside, run down the empty lane between two dashed groups placed side by side, and turn outward into them. The left group is named Recommendation path and runs top to bottom. It begins with Watch history and events, plays, skips, subscriptions, and an arrow leads down from it into the highlighted box, Candidate generation, lookups, not a model per item, which is also where the Catalogue arrow arrives from the right. A long arrow leads down from Candidate generation to Ranking, richer features per item, and is labelled a few hundred candidates: the stage turns the catalogue's 1,000,000,000 videos into a few hundred. An arrow then leads from Ranking down to Home feed, a handful of videos. The right group is named Search path and runs top to bottom in the same direction. It begins with Query, showing the typed query how to tie a bowline, and an arrow leads down to Inverted index, over titles, descriptions and transcripts, which is where the second Catalogue arrow arrives from the left. An arrow leads down to Retrieval, text match plus quality score, another down to Ranking, relevance, engagement, recency, and a last one down to Results page, the matches, best first. Across the lane between the two groups, a dashed line labelled shared features joins the two Ranking boxes. It carries no arrowhead because the two rankers draw on the same feature set rather than one feeding the other, and it is the only connector between the two paths below the Catalogue."
      caption="Both paths end at a ranking model, and neither reaches it with more than a few hundred items: the expensive model never touches the catalogue. The two-stage shape on the left is the one Covington, Adams and Sargin document in Deep Neural Networks for YouTube Recommendations (RecSys 2016); search gets there by a different route, an index rather than an embedding lookup, and arrives in the same place."
      minWidth={620}
    >
      {/* The shared source. Both paths are reading the same billion videos. */}
      <rect className="dg-box" x="232" y="14" width="236" height="52"></rect>
      <text className="dg-label" x="350" y="38" textAnchor="middle">
        Catalogue
      </text>
      <text className="dg-sub" x="350" y="56" textAnchor="middle">
        1,000,000,000 videos
      </text>

      {/* Catalogue into candidate generation, down the lane and in from the side */}
      <line className="dg-line" x1="310" y1="66" x2="310" y2="224"></line>
      <line className="dg-line" x1="310" y1="224" x2="286" y2="224"></line>
      <polygon className="dg-head" points="278,224 288,219 288,229"></polygon>

      {/* Catalogue into the index, the mirror of it */}
      <line className="dg-line" x1="390" y1="66" x2="390" y2="224"></line>
      <line className="dg-line" x1="390" y1="224" x2="414" y2="224"></line>
      <polygon className="dg-head" points="422,224 412,219 412,229"></polygon>

      {/* Recommendation path */}
      <rect className="dg-group" x="12" y="88" width="280" height="396"></rect>
      <text className="dg-legend" x="24" y="110">
        Recommendation path
      </text>

      <rect className="dg-box" x="26" y="122" width="252" height="52"></rect>
      <text className="dg-label" x="152" y="146" textAnchor="middle">
        Watch history and events
      </text>
      <text className="dg-sub" x="152" y="164" textAnchor="middle">
        plays, skips, subscriptions
      </text>

      <line className="dg-line" x1="152" y1="174" x2="152" y2="190"></line>
      <polygon className="dg-head" points="152,198 147,188 157,188"></polygon>

      <rect
        className="dg-box dg-box--accent"
        x="26"
        y="198"
        width="252"
        height="52"
      ></rect>
      <text className="dg-label" x="152" y="222" textAnchor="middle">
        Candidate generation
      </text>
      <text className="dg-sub" x="152" y="240" textAnchor="middle">
        lookups, not a model per item
      </text>

      {/* The reduction, down the empty third row so the label has room */}
      <line className="dg-line" x1="152" y1="250" x2="152" y2="342"></line>
      <polygon className="dg-head" points="152,350 147,340 157,340"></polygon>
      <text className="dg-sub" x="166" y="292">
        a few hundred
      </text>
      <text className="dg-sub" x="166" y="308">
        candidates
      </text>

      <rect className="dg-box" x="26" y="350" width="252" height="52"></rect>
      <text className="dg-label" x="152" y="374" textAnchor="middle">
        Ranking
      </text>
      <text className="dg-sub" x="152" y="392" textAnchor="middle">
        richer features per item
      </text>

      <line className="dg-line" x1="152" y1="402" x2="152" y2="418"></line>
      <polygon className="dg-head" points="152,426 147,416 157,416"></polygon>

      <rect className="dg-box" x="26" y="426" width="252" height="52"></rect>
      <text className="dg-label" x="152" y="450" textAnchor="middle">
        Home feed
      </text>
      <text className="dg-sub" x="152" y="468" textAnchor="middle">
        a handful of videos
      </text>

      {/* Search path */}
      <rect className="dg-group" x="408" y="88" width="280" height="396"></rect>
      <text className="dg-legend" x="420" y="110">
        Search path
      </text>

      <rect className="dg-box" x="422" y="122" width="252" height="52"></rect>
      <text className="dg-label" x="548" y="146" textAnchor="middle">
        Query
      </text>
      <text className="dg-mono" x="548" y="164" textAnchor="middle">
        how to tie a bowline
      </text>

      <line className="dg-line" x1="548" y1="174" x2="548" y2="190"></line>
      <polygon className="dg-head" points="548,198 543,188 553,188"></polygon>

      <rect className="dg-box" x="422" y="198" width="252" height="52"></rect>
      <text className="dg-label" x="548" y="222" textAnchor="middle">
        Inverted index
      </text>
      <text className="dg-sub" x="548" y="240" textAnchor="middle">
        titles, descriptions, transcripts
      </text>

      <line className="dg-line" x1="548" y1="250" x2="548" y2="266"></line>
      <polygon className="dg-head" points="548,274 543,264 553,264"></polygon>

      <rect className="dg-box" x="422" y="274" width="252" height="52"></rect>
      <text className="dg-label" x="548" y="298" textAnchor="middle">
        Retrieval
      </text>
      <text className="dg-sub" x="548" y="316" textAnchor="middle">
        text match plus quality score
      </text>

      <line className="dg-line" x1="548" y1="326" x2="548" y2="342"></line>
      <polygon className="dg-head" points="548,350 543,340 553,340"></polygon>

      <rect className="dg-box" x="422" y="350" width="252" height="52"></rect>
      <text className="dg-label" x="548" y="374" textAnchor="middle">
        Ranking
      </text>
      <text className="dg-sub" x="548" y="392" textAnchor="middle">
        relevance, engagement, recency
      </text>

      <line className="dg-line" x1="548" y1="402" x2="548" y2="418"></line>
      <polygon className="dg-head" points="548,426 543,416 553,416"></polygon>

      <rect className="dg-box" x="422" y="426" width="252" height="52"></rect>
      <text className="dg-label" x="548" y="450" textAnchor="middle">
        Results page
      </text>
      <text className="dg-sub" x="548" y="468" textAnchor="middle">
        the matches, best first
      </text>

      {/* The two rankers share a feature set. No arrowhead: nothing flows. */}
      <text className="dg-sub" x="350" y="368" textAnchor="middle">
        shared features
      </text>
      <line
        className="dg-line dg-line--soft"
        x1="278"
        y1="376"
        x2="422"
        y2="376"
      ></line>
    </Figure>
  );
}
