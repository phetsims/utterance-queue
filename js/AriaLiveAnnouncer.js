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
import merge from '../../phet-core/js/merge.js';
import platform from '../../phet-core/js/platform.js';
import { PDOMUtils } from '../../scenery/js/imports.js';
import Announcer from './Announcer.js';
import utteranceQueueNamespace from './utteranceQueueNamespace.js';

// constants
const NUMBER_OF_ARIA_LIVE_ELEMENTS = 4;

// one indexed for the element ids, unique to each AriaLiveAnnouncer instance
let ariaLiveAnnouncerIndex = 1;

// Possible supported values for the `aria-live` attributes created in AriaLiveAnnouncer.
class AriaLive extends EnumerationValue {
  static POLITE = new AriaLive();
  static ASSERTIVE = new AriaLive();

  static enumeration = new Enumeration( AriaLive );
}

/**
 * @param {string} priority - value of the aria-live attribute, and used as the id too
 * @returns {HTMLElement} - a container holding each aria-live elements created
 */
function createBatchOfPriorityLiveElements( priority ) {
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

class AriaLiveAnnouncer extends Announcer {

  constructor( options ) {
    options = merge( {

      // By default, don't care about response collector Properties, as they are designed for Voicing more than
      // aria-live description.
      respectResponseCollectorProperties: false
    }, options );
    super( options );

    // @private - index of current aria-live element to use, updated every time an event triggers
    this.politeElementIndex = 0;
    this.assertiveElementIndex = 0;

    // @public (read-only)
    this.ariaLiveContainer = document.createElement( 'div' ); //container div
    this.ariaLiveContainer.setAttribute( 'id', `aria-live-elements-${ariaLiveAnnouncerIndex}` );
    this.ariaLiveContainer.setAttribute( 'style', 'position: absolute; left: 0px; top: 0px; width: 0px; height: 0px; ' +
                                                  'clip: rect(0px 0px 0px 0px); pointer-events: none;' );

    // @private - By having four elements and cycling through each one, we can get around a VoiceOver bug where a new
    // alert would interrupt the previous alert if it wasn't finished speaking, see https://github.com/phetsims/scenery-phet/issues/362
    this.politeElements = createBatchOfPriorityLiveElements( 'polite' );
    this.assertiveElements = createBatchOfPriorityLiveElements( 'assertive' );

    this.ariaLiveContainer.appendChild( this.politeElements );
    this.ariaLiveContainer.appendChild( this.assertiveElements );

    // @private {Array.<HTMLElement>} - DOM elements which will receive the updated content.
    this.politeElements = Array.from( this.politeElements.children );
    this.assertiveElements = Array.from( this.assertiveElements.children );

    // increment index so the next AriaLiveAnnouncer instance has different ids for its elements.
    ariaLiveAnnouncerIndex++;
  }

  /**
   * Announce an alert, setting textContent to an aria-live element.
   * @public
   * @override
   *
   * @param {Utterance} utterance - Utterance with content to announce
   * @param {Object} [options]
   */
  announce( utterance, options ) {

    options = merge( {

      // By default, alert to a polite aria-live element
      ariaLivePriority: AriaLive.POLITE
    }, options );

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
   * @public
   * @override
   */
  cancel() {

  }

  /**
   * The implementation of cancelUtterance for AriaLiveAnnouncer. We do not know whether the AT is speaking content so
   * this function is a no-op for aria-live.
   * @public
   * @override
   * @param {Utterance} utterance
   */
  cancelUtterance( utterance ) {

  }

  /**
   * Update an element with the 'aria-live' attribute by setting its text content.
   *
   * @param {HTMLElement} liveElement - the HTML element that will send the alert to the assistive technology
   * @param {string|number} textContent - the content to be announced
   * @param {Utterance} utterance
   * @private
   */
  updateLiveElement( liveElement, textContent, utterance ) {

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
}

// @public {AriaLive} - Possible values for the `aria-live` attribute (priority) that can be alerted (like "polite" and
// "assertive"), see AriaLiveAnnouncer.announce options for details.
AriaLiveAnnouncer.AriaLive = AriaLive;

utteranceQueueNamespace.register( 'AriaLiveAnnouncer', AriaLiveAnnouncer );
export default AriaLiveAnnouncer;