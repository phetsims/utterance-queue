// Copyright 2019-2022, University of Colorado Boulder

/**
 * A static object used to send aria-live updates to a screen reader. These are alerts that are independent of user
 * focus. This will create and reference 'aria-live' elements in the HTML document and update their content. You
 * will need to get these elements and add them to the document through a reference to this.ariaLiveElements.
 * A number of elements such as the following are created and used:
 *
 *    <p id="elements-1-polite-1" aria-live="polite"></p>
 *    <p id="elements-1-polite-2" aria-live="polite"></p>
 *    <p id="elements-1-polite-3" aria-live="polite"></p>
 *    <p id="elements-1-polite-4" aria-live="polite"></p>
 *
 *    <p id="elements-1-assertive-1" aria-live="assertive"></p>
 *    <p id="elements-1-assertive-2" aria-live="assertive"></p>
 *    <p id="elements-1-assertive-3" aria-live="assertive"></p>
 *    <p id="elements-1-assertive-4" aria-live="assertive"></p>
 *
 * It was discovered that cycling through using these elements prevented a VoiceOver bug where alerts would interrupt
 * each other. Starting from the first element, content is set on each element in order and cycles through.
 *
 * Many aria-live and related attributes were tested, but none were well supported or particularly useful for PhET sims,
 * see https://github.com/phetsims/chipper/issues/472.
 *
 * @author Jesse Greenberg
 * @author John Blanco
 */

import stepTimer from '../../axon/js/stepTimer.js';
import Enumeration from '../../phet-core/js/Enumeration.js';
import EnumerationValue from '../../phet-core/js/EnumerationValue.js';
import optionize from '../../phet-core/js/optionize.js';
import platform from '../../phet-core/js/platform.js';
import { PDOMUtils } from '../../scenery/js/imports.js';
import Announcer, { AnnouncerAnnounceOptions, AnnouncerOptions } from './Announcer.js';
import Utterance from './Utterance.js';
import utteranceQueueNamespace from './utteranceQueueNamespace.js';

// constants
const NUMBER_OF_ARIA_LIVE_ELEMENTS = 4;

// one indexed for the element ids, unique to each AriaLiveAnnouncer instance
let ariaLiveAnnouncerIndex = 1;

type AriaLivePriorityString = 'polite' | 'assertive';

// Possible supported values for the `aria-live` attributes created in AriaLiveAnnouncer.
class AriaLive extends EnumerationValue {
  static POLITE = new AriaLive();
  static ASSERTIVE = new AriaLive();

  static enumeration = new Enumeration( AriaLive );
}

// Options for the announce method
type SelfOptions = {
  ariaLivePriority?: AriaLive;
};
type AriaLiveAnnouncerAnnounceOptions = SelfOptions & AnnouncerAnnounceOptions;

/**
 * @param priority - value of the aria-live attribute, and used as the id too
 * @returns - a container holding each aria-live elements created
 */
function createBatchOfPriorityLiveElements( priority: AriaLivePriorityString ): HTMLDivElement {
  const container = document.createElement( 'div' );
  for ( let i = 1; i <= NUMBER_OF_ARIA_LIVE_ELEMENTS; i++ ) {
    const newParagraph = document.createElement( 'p' );
    newParagraph.setAttribute( 'id', `elements-${ariaLiveAnnouncerIndex}-${priority}-${i}` );

    // set aria-live on individual paragraph elements to prevent VoiceOver from interrupting alerts, see
    // https://github.com/phetsims/molecules-and-light/issues/235
    newParagraph.setAttribute( 'aria-live', priority );
    container.appendChild( newParagraph );
  }

  return container;
}

export type AriaLiveAnnouncerOptions = AnnouncerOptions;

class AriaLiveAnnouncer extends Announcer {

  // index of current aria-live element to use, updated every time an event triggers
  private politeElementIndex: number;
  private assertiveElementIndex: number;

  readonly ariaLiveContainer: HTMLDivElement;

  // DOM elements which will receive the updated content.
  private readonly politeElements: HTMLElement[];
  private readonly assertiveElements: HTMLElement[];

  constructor( providedOptions?: AriaLiveAnnouncerOptions ) {
    const options = optionize<AriaLiveAnnouncerOptions, {}, AnnouncerOptions>()( {

      // By default, don't care about response collector Properties, as they are designed for Voicing more than
      // aria-live description.
      respectResponseCollectorProperties: false
    }, providedOptions );

    super( options );

    this.politeElementIndex = 0;
    this.assertiveElementIndex = 0;

    this.ariaLiveContainer = document.createElement( 'div' ); //container div
    this.ariaLiveContainer.setAttribute( 'id', `aria-live-elements-${ariaLiveAnnouncerIndex}` );
    this.ariaLiveContainer.setAttribute( 'style', 'position: absolute; left: 0px; top: 0px; width: 0px; height: 0px; ' +
                                                  'clip: rect(0px 0px 0px 0px); pointer-events: none;' );

    // By having four elements and cycling through each one, we can get around a VoiceOver bug where a new
    // alert would interrupt the previous alert if it wasn't finished speaking, see https://github.com/phetsims/scenery-phet/issues/362
    const politeElementContainer = createBatchOfPriorityLiveElements( 'polite' );
    const assertiveElementContainer = createBatchOfPriorityLiveElements( 'assertive' );

    this.ariaLiveContainer.appendChild( politeElementContainer );
    this.ariaLiveContainer.appendChild( assertiveElementContainer );

    this.politeElements = Array.from( politeElementContainer.children ) as HTMLElement[];
    this.assertiveElements = Array.from( assertiveElementContainer.children ) as HTMLElement[];

    // increment index so the next AriaLiveAnnouncer instance has different ids for its elements.
    ariaLiveAnnouncerIndex++;
  }

  /**
   * Announce an alert, setting textContent to an aria-live element.
   */
  override announce( utterance: Utterance, providedOptions?: AriaLiveAnnouncerAnnounceOptions ): void {

    const options = optionize<AriaLiveAnnouncerAnnounceOptions, SelfOptions>()( {

      // By default, alert to a polite aria-live element
      ariaLivePriority: AriaLive.POLITE
    }, providedOptions );

    // aria-live and AT has no API to detect successful speech, we can only assume every announce is successful
    this.hasSpoken = true;

    const textContent = utterance.getAlertText( this.respectResponseCollectorProperties );

    // Don't update if null
    if ( textContent ) {

      if ( options.ariaLivePriority === AriaLive.POLITE ) {
        const element = this.politeElements[ this.politeElementIndex ];
        this.updateLiveElement( element, textContent, utterance );

        // update index for next time
        this.politeElementIndex = ( this.politeElementIndex + 1 ) % this.politeElements.length;
      }
      else if ( options.ariaLivePriority === AriaLive.ASSERTIVE ) {
        const element = this.assertiveElements[ this.assertiveElementIndex ];
        this.updateLiveElement( element, textContent, utterance );
        // update index for next time
        this.assertiveElementIndex = ( this.assertiveElementIndex + 1 ) % this.assertiveElements.length;
      }
      else {
        assert && assert( false, 'unsupported aria live prioirity' );
      }
    }

    // With aria-live we don't have information about when the screen reader is done speaking
    // the content, so we have to emit this right away
    this.announcementCompleteEmitter.emit( utterance, textContent );
  }

  /**
   * The implementation of cancel for AriaLiveAnnouncer. We do not know whether the AT is speaking content so
   * this function is a no-op for aria-live.
   */
  override cancel(): void { }

  /**
   * The implementation of cancelUtterance for AriaLiveAnnouncer. We do not know whether the AT is speaking content so
   * this function is a no-op for aria-live.
   */
  override cancelUtterance( utterance: Utterance ): void { }

  /**
   * Update an element with the 'aria-live' attribute by setting its text content.
   *
   * @param liveElement - the HTML element that will send the alert to the assistive technology
   * @param textContent - the content to be announced
   * @param utterance
   */
  private updateLiveElement( liveElement: HTMLElement, textContent: string | number, utterance: Utterance ): void {

    // fully clear the old textContent so that sequential alerts with identical text will be announced, which
    // some screen readers might have prevented
    liveElement.textContent = '';

    // element must be visible for alerts to be spoken
    liveElement.hidden = false;

    // must be done asynchronously from setting hidden above or else the screen reader
    // will fail to read the content
    stepTimer.setTimeout( () => {

      // make sure that the utterance is not out of date right before it is actually sent to assistive technology
      if ( utterance.predicate() ) {

        PDOMUtils.setTextContent( liveElement, textContent );

        // Hide the content so that it cant be read with the virtual cursor. Must be done
        // behind at least 200 ms delay or else alerts may be missed by NVDA and VoiceOver, see
        // https://github.com/phetsims/scenery-phet/issues/491
        stepTimer.setTimeout( () => {

          if ( platform.safari ) {

            // Using `hidden` rather than clearing textContent works better on mobile VO,
            // see https://github.com/phetsims/scenery-phet/issues/490
            liveElement.hidden = true;
          }
          else {
            liveElement.textContent = '';
          }
        }, 200 );
      }
    }, 0 );
  }

  // Possible values for the `aria-live` attribute (priority) that can be alerted (like "polite" and
  // "assertive"), see AriaLiveAnnounceOptions for details.
  static AriaLive = AriaLive;
}

utteranceQueueNamespace.register( 'AriaLiveAnnouncer', AriaLiveAnnouncer );
export default AriaLiveAnnouncer;