// Copyright 2019-2020, University of Colorado Boulder

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

import Emitter from '../../axon/js/Emitter.js';
import stepTimer from '../../axon/js/stepTimer.js';
import Enumeration from '../../phet-core/js/Enumeration.js';
import merge from '../../phet-core/js/merge.js';
import platform from '../../phet-core/js/platform.js';
import PDOMUtils from '../../scenery/js/accessibility/pdom/PDOMUtils.js';
import utteranceQueueNamespace from './utteranceQueueNamespace.js';

// constants
const NUMBER_OF_ARIA_LIVE_ELEMENTS = 4;

// one indexed for the element ids, unique to each AriaHerald instance
let ariaHeraldIndex = 1;

// Possible supported values for the `aria-live` attributes created in AriaHerald.
const AriaLive = Enumeration.byKeys( [ 'POLITE', 'ASSERTIVE' ] );

/**
 * @param {string} priority - value of the aria-live attribute, and used as the id too
 * @returns {HTMLElement} - a container holding each aria-live elements created
 */
function createBatchOfPriorityLiveElements( priority ) {
  const container = document.createElement( 'div' );
  for ( let i = 1; i <= NUMBER_OF_ARIA_LIVE_ELEMENTS; i++ ) {
    const newParagraph = document.createElement( 'p' );
    newParagraph.setAttribute( 'id', `elements-${ariaHeraldIndex}-${priority}-${i}` );

    // set aria-live on individual paragraph elements to prevent VoiceOver from interrupting alerts, see
    // https://github.com/phetsims/molecules-and-light/issues/235
    newParagraph.setAttribute( 'aria-live', priority );
    container.appendChild( newParagraph );
  }

  return container;
}

class AriaHerald {

  constructor() {

    // @private - index of current aria-live element to use, updated every time an event triggers
    this.politeElementIndex = 0;
    this.assertiveElementIndex = 0;

    // @public {null|Emitter} - Emit whenever we announce.
    this.announcingEmitter = new Emitter( {
      parameters: [ { valueType: 'string' }, { valueType: AriaHerald.AriaLive } ]
    } );

    // @public (read-only)
    this.ariaLiveContainer = document.createElement( 'div' ); //container div
    this.ariaLiveContainer.setAttribute( 'id', `aria-live-elements-${ariaHeraldIndex}` );
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

    // no need to be removed, exists for the lifetime of the simulation.
    this.announcingEmitter.addListener( ( textContent, priority ) => {

      if ( priority === AriaLive.POLITE ) {
        const element = this.politeElements[ this.politeElementIndex ];
        this.updateLiveElement( element, textContent );

        // update index for next time
        this.politeElementIndex = ( this.politeElementIndex + 1 ) % this.politeElements.length;
      }
      else if ( priority === AriaLive.ASSERTIVE ) {
        const element = this.assertiveElements[ this.assertiveElementIndex ];
        this.updateLiveElement( element, textContent );
        // update index for next time
        this.assertiveElementIndex = ( this.assertiveElementIndex + 1 ) % this.assertiveElements.length;
      }
      else {
        assert && assert( false, 'unsupported aria live prioirity' );
      }
    } );

    // increment index so the next AriaHerald instance has different ids for its elements.
    ariaHeraldIndex++;
  }

  /**
   * Announce an alert, setting textContent to an aria-live element.
   * @public
   *
   * @param {Utterance} utterance - Utterance with content to announce
   * @param {Object} [options]
   */
  announce( utterance, options ) {

    options = merge( {

      // By default, alert to a polite aria-live element
      ariaLivePriority: AriaLive.POLITE
    }, options );

    // Note that getTextToAlert will have side effects on the Utterance as the Utterance
    // may have have logic that changes its alert content each time it is used
    this.announcingEmitter.emit( utterance.getTextToAlert(), options.ariaLivePriority );
  }

  /**
   * Update an element with the 'aria-live' attribute by setting its text content.
   *
   * @param {HTMLElement} liveElement - the HTML element that will send the alert to the assistive technology
   * @param {string} textContent - the content to be announced
   * @private
   */
  updateLiveElement( liveElement, textContent ) {

    // fully clear the old textContent so that sequential alerts with identical text will be announced, which
    // some screen readers might have prevented
    liveElement.textContent = '';

    // element must be visible for alerts to be spoken
    liveElement.hidden = false;

    // must be done asynchronously from setting hidden above or else the screen reader
    // will fail to read the content
    stepTimer.setTimeout( () => {
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
    }, 0 );
  }
}

// @public - Possible values for the `aria-live` attribute (priority) that can be alerted (like "polite" and
// "assertive"), see AriaHerald.announcingEmitter for details.
AriaHerald.AriaLive = AriaLive;

utteranceQueueNamespace.register( 'AriaHerald', AriaHerald );
export default AriaHerald;