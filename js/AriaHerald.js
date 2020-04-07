// Copyright 2019-2020, University of Colorado Boulder

/**
 * A static object used to send aria-live updates to a screen reader. These are alerts that are independent of user
 * focus. This will create and reference 'aria-live' elements in the HTML document and update their content. You
 * will need to get these elements and add them to the document through a reference to this.ariaLiveElements.
 * These are the elements that are created and used:
 *
 *    <p id="polite-1" aria-live="polite"></p>
 *    <p id="polite-2" aria-live="polite"></p>
 *    <p id="polite-3" aria-live="polite"></p>
 *    <p id="polite-4" aria-live="polite"></p>
 *
 * It was discovered that cycling through these alerts prevented a VoiceOver bug where alerts would interrupt each
 * other. Starting from the first element, content is set on each element in order and cycles through.
 *
 * Many aria-live and related attributes were tested, but none were well supported or particularly useful for PhET sims,
 * see https://github.com/phetsims/chipper/issues/472.
 *
 * @author Jesse Greenberg
 * @author John Blanco
 */

import Emitter from '../../axon/js/Emitter.js';
import timer from '../../axon/js/timer.js';
import PDOMUtils from '../../scenery/js/accessibility/pdom/PDOMUtils.js';
import utteranceQueueNamespace from './utteranceQueueNamespace.js';

// constants
const NUMBER_OF_ARIA_LIVE_ELEMENTS = 4;

// one indexed for the element ids
let ariaHeraldIndex = 1;

class AriaHerald {

  constructor() {

    // @private index of current aria-live element to use, updated every time an event triggers
    this.elementIndex = 0;

    // @public {null|Emitter} - Emit whenever we announce.
    this.announcingEmitter = new Emitter( {
      parameters: [ { valueType: 'string' } ]
    } );

    // @public (read-only)
    this.ariaLiveContainer = document.createElement( 'div' ); //container div
    this.ariaLiveContainer.setAttribute( 'id', `aria-live-elements-${ariaHeraldIndex}` );
    this.ariaLiveContainer.setAttribute( 'style', 'position: absolute; left: 0px; top: 0px; width: 0px; height: 0px; ' +
                                                  'clip: rect(0px 0px 0px 0px); pointer-events: none;' );

    for ( let i = 1; i <= NUMBER_OF_ARIA_LIVE_ELEMENTS; i++ ) {
      const newParagraph = document.createElement( 'p' );
      newParagraph.setAttribute( 'id', `elements-${ariaHeraldIndex}-polite-${i}` );

      // set aria-live on individual paragraph elements to prevent VoiceOver from interrupting alerts, see
      // https://github.com/phetsims/molecules-and-light/issues/235
      newParagraph.setAttribute( 'aria-live', 'polite' );
      this.ariaLiveContainer.appendChild( newParagraph );
    }

    // @private {Array.<HTMLElement>} - DOM elements which will receive the updated content. By having four elements
    // and cycling through each one, we can get around a VoiceOver bug where a new alert would interrupt the previous
    // alert if it wasn't finished speaking, see https://github.com/phetsims/scenery-phet/issues/362
    this.ariaLiveElements = Array.from( this.ariaLiveContainer.children );

    // no need to be removed, exists for the lifetime of the simulation.
    this.announcingEmitter.addListener( textContent => {
      const element = this.ariaLiveElements[ this.elementIndex ];
      this.updateLiveElement( element, textContent );

      // update index for next time
      this.elementIndex = ( this.elementIndex + 1 ) % this.ariaLiveElements.length;
    } );

    // increment index so the next AriaHerald instance has different ids for its elements.
    ariaHeraldIndex++;
  }

  /**
   * Announce a polite alert.  This alert should be announced when the user has finished their current interaction or
   * after other utterances in the screen reader's queue are finished.
   * @public
   *
   * @param {string} textContent - the polite content to announce
   */
  announcePolite( textContent ) {

    // or the default to support propper emitter typing
    this.announcingEmitter.emit( textContent );
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
    timer.setTimeout( () => {
      PDOMUtils.setTextContent( liveElement, textContent );

      // Hide the content so that it cant be read with the virtual cursor. Must be done
      // behind at least 200 ms delay or else alerts may be missed by NVDA and VoiceOver, see
      // https://github.com/phetsims/scenery-phet/issues/491
      timer.setTimeout( () => {

        // Using `hidden` rather than clearing textContent works better on mobile VO,
        // see https://github.com/phetsims/scenery-phet/issues/490
        liveElement.hidden = true;
      }, 200 );
    }, 0 );
  }
}

utteranceQueueNamespace.register( 'AriaHerald', AriaHerald );
export default AriaHerald;