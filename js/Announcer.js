// Copyright 2021, University of Colorado Boulder

/**
 * Abstract base class for the type that wires into an UtteranceQueue to announce Utterances.
 *
 * @author Michael Kauzmann (PhET Interactive Simulations)
 */

import merge from '../../phet-core/js/merge.js';
import utteranceQueueNamespace from './utteranceQueueNamespace.js';

class Announcer {

  constructor( options ) {
    options = merge( {
      respectResponseCollectorProperties: true
    }, options );

    // @protected (read-only) - When an Utterance to be announced provided an alert in `ResponsePacket`-form, whether or
    // not to listen to the current values of responseCollector Properties, or to just combine all pieces of it no matter.
    this.respectResponseCollectorProperties = options.respectResponseCollectorProperties;
  }

  /**
   * Announce an alert, setting textContent to an aria-live element.
   * @public
   *
   * @param {Utterance} utterance - Utterance with content to announce
   * @param {Object} [options] - specify support for options particular to this announcer's features.
   * @abstract
   */
  announce( utterance, options ) {
    throw new Error( 'announce() must be overridden by subtype' );
  }
}

utteranceQueueNamespace.register( 'Announcer', Announcer );
export default Announcer;